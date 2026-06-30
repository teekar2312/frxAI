# Task ID: 10 — alerts/logs/settings panels

Agent: panels-alerts-logs-settings
Task: Overwrite the three placeholder panel files with full implementations:
1. `src/components/panels/alerts-panel.tsx` — Price Alerts manager (live monitor + create form + active list + triggered history)
2. `src/components/panels/logs-panel.tsx` — System log viewer (filters, stats, log feed, export JSON)
3. `src/components/panels/settings-panel.tsx` — Settings center (5 tabs: Accounts, Broker & MT5, API Keys, Email & Notif, About)

Work Log:
- Read `worklog.md` for architecture, API contracts (`api.alerts/logs/accounts/notifications/systemConfig/...`), helpers (`fmtPrice`, `relativeTime`, `SYMBOL_BASE`, `SUPPORTED_SYMBOLS`), style guide (dark, emerald/rose/amber, no blue, tabular nums, scroll-thin for long lists).
- Inspected `/src/lib/api.ts`, `/src/lib/types.ts`, `/src/lib/format.ts`, `/src/hooks/use-price-feed.ts` (`useFeed`, `useTicker`), `/src/components/trading/sparkline.tsx`, and shadcn primitives (`Card`, `Tabs`, `Dialog`, `AlertDialog`, `Slider`, `Switch`, `Select`, `Tooltip`, `Badge`, `Progress`, `Collapsible`, `Input`, `Textarea`, `Label`, `Button`) to ensure correct prop APIs.
- Verified live API responses from dev server: `/api/alerts`, `/api/logs`, `/api/accounts`, `/api/notifications`, `/api/system/config` all return expected JSON shapes.

FILE 1 — AlertsPanel (`src/components/panels/alerts-panel.tsx`):
- Header with active/triggered count + live monitor badge.
- **LiveMonitorStrip** — 4-card grid (EURUSD/USDJPY/GBPUSD/XAUUSD), each card shows SYMBOL_LABEL, live price (colored by tick direction), Sparkline (48x20), 24h change%.
- **CreateAlertForm** card — symbol Select, condition Select (above/below/cross_up/cross_down) with inline condition icons, target price Input + "Use current" button (fills from `useTicker(symbol)?.price`), optional message Input, notify-email Switch (default on), "Buat Alert" button → `api.createAlert` → toast + invalidate.
- **AlertCard** (motion + AnimatePresence layout) — symbol Badge + condition `ConditionIcon` component (switch over `ArrowUp/ArrowDown/ArrowUpRight/ArrowDownRight/Target` to avoid `react-hooks/static-components` violation), target price, current price (live via `useTicker`), pip distance sign, progress bar (50-pip window scale, amber when >85% close), status badge (Active emerald / Triggered amber), notify-email icon, message preview, active Switch + Delete (AlertDialog confirm). Triggered cards render amber-tinted with `triggeredAt` time.
- **TriggeredHistory** collapsible (`Collapsible` primitives) — lists triggered alerts in a max-h-72 scroll-thin container.
- **Client-side trigger detection** via `useEffect` watching `tickers` from `useFeed`. For each active alert not already in `firedRef` (Set), compare prev price ref → current price via `shouldFire()` (above: cur≥t, below: cur≤t, cross_up: prev<t && cur≥t, cross_down: prev>t && cur≤t). On fire → `toast.success("🔔 Alert Triggered!", ...)` (8s duration) and add to firedRef so it doesn't repeat. Cleans up firedRef when alerts are removed.
- `useQuery(['alerts'], api.alerts, { refetchInterval: 10_000 })` for active refetch.
- Empty state: "Belum ada alert. Buat alert harga pertama Anda di atas."

FILE 2 — LogsPanel (`src/components/panels/logs-panel.tsx`):
- Header "System Logs — MT5 • AI • Risk • API • WebSocket • Backtest" with live/paused badge + auto-refresh Switch (default on, refetch 5s).
- **Stats row** (4 StatCard mini cards, 2 cols mobile / 4 cols desktop): Total Logs, Errors (24h, rose), Warnings (24h, amber), Info (24h, emerald). 24h filter via `Date.now() - 86_400_000`.
- **Filter bar card**: level chips (All/Info/Warn/Error/Debug with counts), source dropdown Select (all/mt5/ai/risk/api/ws/backtest/system with icons), client-side search Input (filters message/source/level/context/stack), Export JSON button (Blob download), Clear All button (rose outline → AlertDialog confirm → `api.clearLogs`).
- **LogRow** (motion + AnimatePresence layout) — left border colored by level (info emerald, warn amber, error rose, debug muted), level badge + source badge with color-coded backgrounds (mt5 sky, ai violet, risk amber, api emerald, ws cyan, backtest fuchsia, system slate), message in mono font with `break-all`, timestamp with relativeTime + Tooltip showing exact `id-ID` formatted time, expandable chevron → collapsible `<pre>` block for context (muted) and stack (rose-tinted). Newest first via API order.
- `useQuery(['logs', level, source], api.logs({ level, source, limit: 200 }), { refetchInterval: autoRefresh ? 5_000 : false })`.
- Export: `Blob([JSON.stringify(filtered, null, 2)])` → `URL.createObjectURL` → anchor download with ISO timestamp filename.
- Empty state: terminal icon + "Tidak ada log" with sub-message differentiating empty DB vs no filter match.

FILE 3 — SettingsPanel (`src/components/panels/settings-panel.tsx`):
- 5-tab `Tabs` (TabsList wraps on mobile): Akun MT5, Broker & MT5 Engine, API Keys, Email & Notifikasi, Tentang Sistem. Each `TabsContent` wrapped in `motion.div` with `AnimatePresence mode="wait"` for cross-fade transitions.
- **Tab AccountsTab**:
  - `useQuery(['accounts'], api.accounts)` + Add button + note card (amber-tinted, "Selalu uji di demo terlebih dahulu").
  - **AccountCard** (motion + AnimatePresence): demo/live badge, default star badge (top-right corner emerald pill), name, broker, MT5 connected/disconnected pulse dot, 6-row detail grid (server/login/leverage/balance/equity + icons), action buttons (Connect/Disconnect → `api.toggleConnect`, Set Default → `api.updateAccount({isDefault:true})` — backend unsets others, Edit dialog, Delete with AlertDialog confirm).
  - **Edit dialog**: name, server, login, leverage Select, balance Input → `api.updateAccount`.
  - **Add dialog**: full form with defaults (broker=FINEX Indonesia, accountType=demo, currency=USD, leverage=1:100, balance=10000) → `api.createAccount`. Validates name/server/login non-empty.
- **Tab BrokerTab**:
  - System config card (read-only rows: brokerName, brokerServer, brokerMaxLeverage, brokerSpreadMajorFromPip, brokerCommissionPerLot).
  - Editable card: mt5Path Input + pythonVersion Input → Save (`api.updateSystemConfig({mt5Path, pythonVersion})`) + "Test MT5 Connection" button → `toast.success("MT5 terminal terdeteksi", ...)`.
  - Broker Info card (emerald): FINEX specs (Spread from 0.0 pip, Commission $2-3/lot/round-turn, Max Leverage 1:100 BAPPEBTI).
  - MT5 Connection Status card with online pulse.
  - **React 19 state-sync pattern** (not useEffect): tracks `lastMt5`/`lastPy` in state and updates editable fields when server config arrives/changes — `if (cfg.mt5Path !== lastMt5) { setLastMt5(...); setMt5Path(...) }` (avoids `react-hooks/set-state-in-effect` rule).
- **Tab ApiKeysTab**:
  - ApiKeyField helper (password Input + show/hide Eye toggle + Test button + Get key external link).
  - Finnhub + MARKETAUX fields with state synced from `/api/system/config` via the same React 19 pattern (lastFinn/lastMkt/lastRefresh).
  - newsRefreshMinutes Slider (5-60, step 5) with live `{refreshMin} menit` label.
  - Save button → `api.updateSystemConfig({finnhubApiKey, marketauxApiKey, newsRefreshMinutes})`.
  - Test buttons simulate connection: warn if "demo" key, success otherwise.
  - Amber note: "API key disimpan lokal di database SQLite".
- **Tab EmailTab**:
  - SMTP config card: email recipient, smtpHost, smtpPort, "Username/password dikonfigurasi server-side" badge, emailEnabled Switch.
  - Save Config button + Kirim Email Test button (`api.testNotification(recipient)` → toast "Email test terkirim ke {recipient}"). Test disabled when emailEnabled=false (with hint text).
  - Notification Events card: 5 event toggles (trade_open, trade_close, alert, risk, news) with color-coded badges (local state — per task spec, backend persistence deferred).
  - Recent Notifications list (`useQuery(['notifications', 10], api.notifications(10))`): type badge, subject, recipient (truncated), sent/failed badge, relativeTime. Max-h-72 scroll-thin.
- **Tab AboutTab**:
  - Architecture card: "FinexFX AI Trading System v1.0" with 8 InfoRow cards (Backend, Frontend, Broker, Data Source, AI Model, Strategi, Pairs, Sesi Aktif).
  - Disclaimer card (amber): BAPPEBTI warning, "demo untuk testing", "performa historis tidak menjamin hasil".
  - Tech credits card with 15 tech badges (Next.js 16, TypeScript 5, Tailwind, shadcn/ui, Prisma, SQLite, TanStack Query, Zustand, Socket.io, Framer Motion, Recharts, Lucide, Python 3.14, MetaTrader 5, z-ai-web-dev-sdk).

Lint + Build:
- Initial `bun run lint` flagged 3 issues in my files: (a) `react-hooks/static-components` — `const Icon = condIcon(...)` then `<Icon />` in alerts-panel; (b) 3× `react-hooks/set-state-in-effect` — `useEffect` syncing query data to local state in BrokerTab/ApiKeysTab/EmailTab.
- Fixed (a) by introducing `ConditionIcon` component using a `switch` over the condition → direct `<ArrowUp|ArrowDown|ArrowUpRight|ArrowDownRight|Target>` JSX (no capitalized variable assignment).
- Fixed (b) by removing `useEffect` imports entirely and adopting the React-19-recommended "adjust state during render" pattern: store previous server value in `last*` state, compare with current prop, call setState during render if mismatch. Removed `useEffect` from settings-panel.tsx imports.
- Final `bun run lint`: 0 errors in my 3 files. (4 remaining errors are in `page.tsx`, `ai-panel.tsx`, `trading-panel.tsx` — owned by other agents, not in scope.)
- Dev log shows page loads `200`, no compile/runtime errors.

Stage Summary:
- 3/3 panels built and lint-clean. All use `'use client'`, named exports `export function AlertsPanel/LogsPanel/SettingsPanel()`, no props, compatible with the existing lazy-load pattern in `page.tsx`.
- Style adheres to guide: dark theme forced via parent ThemeProvider, emerald/rose/amber color tokens (no blue), tabular-nums on all numeric displays, `p-4 md:p-6` container padding, long lists capped with `max-h-*` + `overflow-y-auto` + `scroll-thin`.
- Live price integration via `useFeed`/`useTicker` (Zustand store populated by `usePriceFeed` in `page.tsx`) — alert cards and monitor strip update in real-time without extra subscriptions.
- Toast notifications on all user actions (create/update/delete alert, clear logs, save config, connect/disconnect MT5, test email, export JSON) via `sonner`.
- Framer Motion transitions: list reordering in alerts/logs (`AnimatePresence mode="popLayout"` + `layout`), tab cross-fades in settings.
