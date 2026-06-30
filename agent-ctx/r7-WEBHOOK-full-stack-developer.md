---
Task ID: r7-WEBHOOK
Agent: full-stack-developer
Task: Add webhook notifications (Discord/Telegram/Slack) for trade events — server-only utility, test endpoint, and Settings panel configuration UI.

Work Log:
- Read `/home/z/my-project/worklog.md` r7 section to understand context (subagent 2 of 2 for r7; subagent 1 handles PDF export).
- Reviewed existing `EmailTab` in `src/components/panels/settings-panel.tsx` for the established state-sync pattern (last-value refs + useQuery + useMutation via `api.updateSystemConfig`).
- Reviewed `src/app/api/system/config/route.ts` PATCH handler — confirmed it accepts arbitrary key-value pairs via upsert, so no route modification needed for `webhook_*` keys.
- Reviewed `prisma/schema.prisma` — `SystemConfig` is already a generic key-value table (`key`/`value`), so no schema migration needed.
- Created `src/lib/webhook.ts` (server-only):
  * `getWebhookConfig()` reads `webhook_*` keys from `SystemConfig` table.
  * `sendWebhook(event)` sends to Discord (embed), Telegram (Markdown message), and Slack (attachment) in parallel.
  * Each target wrapped in try/catch with a 5-second `AbortController` timeout (`fetchWithTimeout`) so a slow/dead webhook URL can never block trade operations.
  * Top-level try/catch ensures the function is always safe to call alongside `sendNotification()` in trade event handlers.
  * Default Discord color map per event type (blue=trade_open, emerald=trade_close, amber=alert, rose=risk, indigo=system, violet=news). Caller can override `event.color` (e.g., 0xef4444 for loss, 0x10b981 for profit).
  * Telegram Markdown special chars (`_*\`[`) are escaped before sending.
  * Logs each successful send to the `Log` table (best-effort, swallowed on failure).
  * Exported `sendTestWebhook()` helper that emits a "🔧 FinexFX Webhook Test" system event.
- Created `src/app/api/system/webhook-test/route.ts` (POST endpoint) — calls `sendTestWebhook()`, returns 400 with hint if disabled or no targets configured.
- Added new `WebhookTab` component to `src/components/panels/settings-panel.tsx`:
  * Section header with `Webhook` icon (violet).
  * Master toggle card: `Switch` for `webhook_enabled` + ACTIVE/INACTIVE badge + Save Config + Test Webhook + Show/Hide secrets toggle.
  * Discord card: webhook URL input + help text ("Server Settings → Integrations → Webhooks").
  * Telegram card: Bot Token + Chat ID inputs + help text ("@BotFather → /newbot", "@userinfobot" for Chat ID).
  * Slack card: Incoming Webhook URL + help text ("Apps → Build → Make a Custom App → Incoming Webhooks").
  * Webhook Event Matrix card: reuses `NOTIF_TYPES`/`NOTIF_TYPE_COLOR` to show the 6 event types that will trigger webhooks once integrated.
  * Secrets inputs default to `type=password` with `autoComplete="off"` and `spellCheck={false}`; Show secrets button toggles visibility.
  * Local form state synced from remote query using the same `lastX` ref pattern as `EmailTab`.
  * Save mutation persists all 5 keys via `api.updateSystemConfig()`.
  * Test mutation uses raw `fetch('/api/system/webhook-test')` since `api.ts` is read-only.
- Added `Webhook` and `MessageCircle` to lucide-react imports.
- Added new `<TabsTrigger value="webhook">` and `<TabsContent value="webhook">` to the main `SettingsPanel` (between Email and About tabs).
- Lint check: `bun run lint` → 0 errors, 0 warnings.
- Verified via agent-browser:
  * Opened http://localhost:81/ → clicked Settings → "Webhook" tab is visible alongside the other 5 tabs.
  * Clicked Webhook tab → "Webhook Notifications" heading + Master Toggle + Save/Test buttons + Discord/Telegram/Slack inputs all render.
  * Enabled master toggle, filled Discord URL (`https://discord.com/api/webhooks/TEST123/abc`) and Slack URL, clicked "Save Config".
  * Confirmed persistence by GET `/api/system/config` → returns `webhook_enabled: true`, `webhook_discord_url: ...`, `webhook_slack_url: ...`.
  * Hit POST `/api/system/webhook-test` → returns `{"ok":true,"targets":["discord","slack"],"message":"Test webhook sent to: discord, slack"}`.
  * Confirmed log entry: `[info] system — Webhook sent (discord,slack): system — 🔧 FinexFX Webhook Test`.
- Screenshot saved to `/home/z/my-project/agent-ctx/r7-WEBHOOK-settings.png`.

Stage Summary:
- `src/lib/webhook.ts` (NEW, 230 lines) — server-only multi-platform webhook sender with timeout protection and graceful error handling.
- `src/app/api/system/webhook-test/route.ts` (NEW) — POST endpoint for the "Test Webhook" button.
- `src/components/panels/settings-panel.tsx` (MODIFIED) — added `WebhookTab` (~300 lines) + new tab trigger + tab content with framer-motion animation. Existing tabs (Accounts, Broker, API Keys, Email, About) untouched.
- `prisma/schema.prisma` (UNCHANGED) — `SystemConfig` model already supports arbitrary key-value pairs.
- `src/app/api/system/config/route.ts` (UNCHANGED) — existing PATCH handler persists `webhook_*` keys without modification.
- Lint: 0 errors, 0 warnings.
- Browser-verified: Webhook tab renders, Save persists to DB, Test endpoint returns success and creates a Log entry.
- Note for main agent: Integration of `sendWebhook()` into the trade event handlers (e.g., `src/app/api/trades/route.ts` POST, `src/app/api/trades/[id]/close/route.ts`, `src/app/api/alerts/route.ts`) is left to the main agent because those files are owned by other agents. The recommended call pattern is:
  ```ts
  await sendWebhook({
    type: 'trade_open',
    title: `🟢 ${trade.side} ${trade.symbol}`,
    message: `Lot ${trade.lotSize} @ ${trade.openPrice}`,
    fields: [
      { name: 'Account', value: account.name },
      { name: 'Strategy', value: trade.strategy || 'manual' },
    ],
    color: 0x3b82f6,
  })
  ```
  Place alongside the existing `sendNotification()` calls. For trade_close, override `color` with `0x10b981` (profit) or `0xef4444` (loss) based on `trade.pnl`.
```
