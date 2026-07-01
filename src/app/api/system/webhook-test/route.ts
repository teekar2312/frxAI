import { NextRequest, NextResponse } from 'next/server'
import { sendTestWebhook } from '@/lib/webhook'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/system/webhook-test
 * Sends a test webhook to all configured targets (Discord, Telegram, Slack).
 * Body: (none required). If webhook_enabled=false, returns 400 with a hint.
 */
export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, RATE_LIMITS.webhookTest)
  if (limited) return limited

  try {
    const { targets, enabled } = await sendTestWebhook()

    if (!enabled) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Webhook notifications are disabled. Enable the toggle in Settings → Webhook.',
        },
        { status: 400 },
      )
    }

    if (targets.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No webhook targets configured. Provide at least one of: Discord URL, Telegram (token + chat id), or Slack URL.',
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      targets,
      message: `Test webhook sent to: ${targets.join(', ')}`,
    })
  } catch (e) {
    return apiCatch(e, 'system', 'POST')
  }
}