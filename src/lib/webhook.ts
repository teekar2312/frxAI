import 'server-only'
import { db } from './db'

/* =================================================
   Webhook Notifications (Discord / Telegram / Slack)
   -------------------------------------------------
   Server-only utility. All network calls are wrapped
   in try/catch with a 5-second timeout so webhook
   failures never crash trade operations.
   ================================================= */

export type WebhookEventType =
  | 'trade_open'
  | 'trade_close'
  | 'alert'
  | 'risk'
  | 'system'
  | 'news'

export interface WebhookField {
  name: string
  value: string
}

export interface WebhookEvent {
  type: WebhookEventType
  title: string
  message: string
  fields?: WebhookField[]
  /** Override the default Discord color int (e.g., 0x10b981 for profit, 0xef4444 for loss). */
  color?: number
}

interface WebhookConfig {
  enabled: boolean
  discordUrl: string
  telegramToken: string
  telegramChatId: string
  slackUrl: string
}

const DEFAULT_COLOR_MAP: Record<WebhookEventType, number> = {
  trade_open: 0x3b82f6, // blue
  trade_close: 0x10b981, // emerald (will be overridden by caller with profit/loss color)
  alert: 0xf59e0b, // amber
  risk: 0xef4444, // rose
  system: 0x6366f1, // indigo
  news: 0x8b5cf6, // violet
}

/** Read webhook_* keys from SystemConfig (key-value table). */
async function getWebhookConfig(): Promise<WebhookConfig> {
  try {
    const configs = await db.systemConfig.findMany({
      where: { key: { startsWith: 'webhook_' } },
    })
    const map: Record<string, string> = {}
    for (const c of configs) map[c.key] = c.value
    return {
      enabled: map.webhook_enabled === 'true',
      discordUrl: map.webhook_discord_url || '',
      telegramToken: map.webhook_telegram_token || '',
      telegramChatId: map.webhook_telegram_chat_id || '',
      slackUrl: map.webhook_slack_url || '',
    }
  } catch (e) {
    console.error('Failed to load webhook config:', e)
    return {
      enabled: false,
      discordUrl: '',
      telegramToken: '',
      telegramChatId: '',
      slackUrl: '',
    }
  }
}

/** fetch with a hard 5-second timeout so a slow webhook target can't block callers. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 5000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const EMOJI_MAP: Record<WebhookEventType, string> = {
  trade_open: '🟢',
  trade_close: '🔴',
  alert: '⚠️',
  risk: '🛑',
  system: '📢',
  news: '📰',
}

/**
 * Send a webhook notification to all configured targets (Discord, Telegram, Slack).
 * Failures in any single target are logged but never thrown — this function is
 * safe to call from trade event handlers without try/catch on the caller side.
 *
 * Set `event.color` to override the Discord/Slack color (e.g., profit = 0x10b981,
 * loss = 0xef4444).
 */
export async function sendWebhook(event: WebhookEvent): Promise<void> {
  try {
    const config = await getWebhookConfig()
    if (!config.enabled) return

    const color = event.color ?? DEFAULT_COLOR_MAP[event.type] ?? 0x808080
    const targets: string[] = []
    if (config.discordUrl) targets.push('discord')
    if (config.telegramToken && config.telegramChatId) targets.push('telegram')
    if (config.slackUrl) targets.push('slack')
    if (targets.length === 0) return

    // --- Discord ---
    if (config.discordUrl) {
      try {
        await fetchWithTimeout(config.discordUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'FinexFX AI',
            embeds: [
              {
                title: event.title,
                description: event.message,
                color,
                fields: event.fields?.map((f) => ({
                  name: f.name,
                  value: f.value,
                  inline: false,
                })),
                timestamp: new Date().toISOString(),
                footer: { text: 'FinexFX AI Trading System' },
              },
            ],
          }),
        })
      } catch (e) {
        console.error('Discord webhook failed:', e)
      }
    }

    // --- Telegram ---
    if (config.telegramToken && config.telegramChatId) {
      try {
        const emoji = EMOJI_MAP[event.type] ?? '📢'
        let text = `${emoji} *${escapeTelegramMarkdown(event.title)}*\n\n${escapeTelegramMarkdown(event.message)}`
        if (event.fields && event.fields.length > 0) {
          text +=
            '\n\n' +
            event.fields
              .map(
                (f) =>
                  `• *${escapeTelegramMarkdown(f.name)}*: ${escapeTelegramMarkdown(f.value)}`,
              )
              .join('\n')
        }
        await fetchWithTimeout(
          `https://api.telegram.org/bot${config.telegramToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: config.telegramChatId,
              text,
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
            }),
          },
        )
      } catch (e) {
        console.error('Telegram webhook failed:', e)
      }
    }

    // --- Slack ---
    if (config.slackUrl) {
      try {
        const colorHex = '#' + color.toString(16).padStart(6, '0')
        await fetchWithTimeout(config.slackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'FinexFX AI Trading System',
            attachments: [
              {
                fallback: `${event.title} — ${event.message}`,
                title: event.title,
                text: event.message,
                color: colorHex,
                fields: event.fields?.map((f) => ({
                  title: f.name,
                  value: f.value,
                  short: false,
                })),
                ts: Math.floor(Date.now() / 1000),
                footer: 'FinexFX AI Trading System',
              },
            ],
          }),
        })
      } catch (e) {
        console.error('Slack webhook failed:', e)
      }
    }

    // --- Log the webhook send (best-effort) ---
    try {
      await db.log.create({
        data: {
          level: 'info',
          source: 'system',
          message: `Webhook sent (${targets.join(',')}): ${event.type} — ${event.title}`,
        },
      })
    } catch {
      // Logging is best-effort; ignore.
    }
  } catch (e) {
    // Top-level safety net: never let a webhook failure propagate.
    console.error('sendWebhook top-level error:', e)
  }
}

/** Escape Markdown special characters for Telegram Markdown parse mode. */
function escapeTelegramMarkdown(s: string): string {
  return s.replace(/([_*`\[])/g, '\\$1')
}

/**
 * Convenience: send a test webhook from the settings panel "Test Webhook" button.
 * Returns the list of configured targets so the UI can show what was attempted.
 */
export async function sendTestWebhook(): Promise<{
  targets: string[]
  enabled: boolean
}> {
  const config = await getWebhookConfig()
  const targets: string[] = []
  if (config.discordUrl) targets.push('discord')
  if (config.telegramToken && config.telegramChatId) targets.push('telegram')
  if (config.slackUrl) targets.push('slack')

  await sendWebhook({
    type: 'system',
    title: '🔧 FinexFX Webhook Test',
    message:
      'This is a test webhook notification from your FinexFX AI Trading System. If you received this, webhook integration is working correctly.',
    fields: [
      { name: 'Targets', value: targets.length ? targets.join(', ') : 'none' },
      { name: 'Timestamp', value: new Date().toISOString() },
    ],
    color: 0x6366f1,
  })

  return { targets, enabled: config.enabled }
}
