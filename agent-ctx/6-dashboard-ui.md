# Task 6 — dashboard-panel (Agent: dashboard-ui)

## Task
Overwrite `/home/z/my-project/src/components/panels/dashboard-panel.tsx` with a rich, production-grade hero dashboard overview panel for the FinexFX AI Trading System. Dark theme, live tickers, KPIs, equity curve, watchlist, sessions, AI signals, top news, open positions table with close action.

## Work Log
- Read `worklog.md` to understand architecture, API contracts, helpers, and style guide.
- Read `src/lib/types.ts`, `src/lib/api.ts`, `src/lib/format.ts`, `src/lib/market.ts`, `src/lib/sessions.ts`, `src/hooks/use-price-feed.ts`, `src/components/trading/sparkline.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/api/dashboard/route.ts`, `src/components/providers.tsx`, `src/components/layout/app-topbar.tsx`, `eslint.config.mjs`, `tsconfig.json`, `package.json`, shadcn/ui component sources (card, badge, progress, table, tooltip, alert-dialog, skeleton, separator, scroll-area), and the dev log.
- Inspected live `/api/dashboard` JSON response to confirm field shapes (5 sessions, 6 news, 5 AI signals with factors as JSON object, 4 symbols, 40-pt equitySpark, 0 openTrades, etc.).
- Wrote a single-file panel with:
  - **KPI row** (4 cards): Account Equity (name + demo/live badge + broker + MT5 connection dot + balance + free margin), Today's P&L (colored bull/bear with arrow + return % + Profit/Loss badge), Daily Risk Used (usedPct/limitPct progress bar with emerald <50% / amber <80% / rose ≥80% tone + open positions count), Open Positions (count + per-symbol `×N` mini-badges + closed-today count).
  - **Equity Curve Card** (lg:col-span-8): recharts AreaChart with emerald gradient fill, balance + todayPnl badge header, custom compact money tooltip, autoscaled YAxis domain with 15% pad.
  - **Sessions Card** (lg:col-span-4): 5 sessions in canonical order (London, NY, Overlap, Tokyo, Sydney) each with progress bar + AKTIF/TUTUP badge + live pulse dot; scalping-window banner; next session open time in Jakarta WIB.
  - **Live Watchlist Card** (lg:col-span-4): 2×2 grid for EURUSD/USDJPY/GBPUSD/XAUUSD. Each `WatchlistRow` subscribes to `useTicker(symbol)` directly so live ticks re-render only that row, never the parent panel. Falls back to dashboard `symbols` snapshot when no live ticker yet. Shows full label (tooltip with symbol + pip), price (colored by changePct), changePct badge with arrow, mini Sparkline (live spark array), BID/ASK/SPR mono grid. `tick-up`/`tick-down` CSS flash classes applied via `ticker.dir`.
  - **AI Signals Card** (lg:col-span-4): up to 4 latest signals in a `max-h-72` ScrollArea. Each row: symbol badge, direction (LONG/SHORT/NEUTRAL with color), confidence %, top-3 factor chips (parsed from `signal.factors` JSON, score tinted bull/bear/warn by sign, auto-digits 0 or 1), action badge (BUY/SELL/WAIT colored). Footer button "Lihat semua →" opens an info toast (preview-only).
  - **Top News Card** (lg:col-span-4): up to 5 news items. Each: impact dot (rose=high with pulse, amber=medium, muted=low, tooltip shows level), category badge (capitalized), BREAKING badge + rose-tinted background + pulsing dot when `category === 'breaking'`, 2-line clamped title, relative time + source, sentiment arrow (up/down/minus).
  - **Open Positions Table** (full width): `OpenTradeRow` is `memo`-wrapped and subscribes to `useTicker(trade.symbol)` directly to compute live floating P&L via `calcPnl` from `@/lib/market` (close price = bid for buy / ask for sell). Columns: Symbol (with source icon for AI/auto), Side badge (BUY bull / SELL bear), Lot, Open Price, Current (live or "—"), Floating P&L (colored + pips subtext), Close button. Empty state: "Belum ada posisi terbuka" with subtext.
  - Close action: controlled `AlertDialog` (one shared dialog driven by `closingId` state) — confirmation dialog with trade details, calls `api.closeTrade(id)`, invalidates `['dashboard']` query, shows success toast with P&L+pips or error toast on failure. Action button uses `e.preventDefault()` to prevent premature close while pending; overlay/Cancel disabled during pending.
- **Motion**: parent `motion.div` with `containerVariants` (staggerChildren 0.05, delayChildren 0.04) and each card wrapped in `motion.div` with `itemVariants` (fade-up 12px → 0, 0.4s easeOut). Subtle and performant.
- **Performance**:
  - DashboardPanel parent only re-renders when `useQuery(['dashboard'])` refetches (10s) — never on tick.
  - `useTicker` is called only inside leaf row components (`WatchlistRow`, `OpenTradeRow`), each wrapped in `React.memo`. Live ticks update just the affected row.
  - `useMemo` for derived data: bySymbol grouping in KPI, chartData in equity, ordered sessions, factors per signal.
  - `useAllTickers` deliberately NOT used in parent (would re-render whole panel every tick).
  - recharts `isAnimationActive={false}` on the equity area to avoid re-animating every refetch.
- **Loading & error states**: DashboardSkeleton mirrors the final layout (4 KPI skeletons + equity/sessions row + 3-card row + table). Error state: small Card with retry button calling `query.refetch()`.
- **Style**: 12-col responsive grid (`grid-cols-1 lg:grid-cols-12`), gaps `gap-4`, card padding from shadcn defaults (Card has py-6, CardContent px-6). All numeric values use `tabular` + `font-mono`. Trading color tokens (`text-bull`/`text-bear`/`text-warn`/`bg-bull/10`/etc.) used throughout. No blue/indigo. Glassmorphism touches: blurred radial accent (`blur-2xl bg-bull/15`) in top-right of each KPI card. Live pulse dots via `live-dot` CSS class. Custom scrollbars via `scroll-thin` (via ScrollArea). Mobile-first: KPIs collapse to 1 col on mobile, 2 on sm, 4 on lg; equity+sessions and the 3-card row stack on mobile.
- Lint: `bunx eslint src/components/panels/dashboard-panel.tsx` → 0 errors, 0 warnings (clean). The 5 remaining `bun run lint` errors are in `src/app/page.tsx`, `src/components/panels/alerts-panel.tsx`, and `src/components/panels/trading-panel.tsx` — owned by other agents, not this task's scope.
- Dev server: `GET / 200 in 168ms (compile: 33ms, render: 135ms)` — dashboard panel compiles & hydrates cleanly. `/api/dashboard` still returns 200.

## Stage Summary
- `src/components/panels/dashboard-panel.tsx` is now a full hero dashboard (≈990 lines, 1 file, 0 dependencies added).
- All 7 sections (KPIs, equity curve, sessions, watchlist, AI signals, top news, open positions) implemented per spec with live ticker integration via `useTicker` per-row (no parent re-render on tick).
- Close-trade flow: AlertDialog confirm → `api.closeTrade` → toast → invalidate `['dashboard']`.
- Live ticks flash green/red on watchlist rows (`tick-up`/`tick-down` CSS) and update floating P&L in the positions table every second without any dashboard refetch.
- Lint-clean for this file; dev server compiles successfully; `/api/dashboard` 200.
- Did NOT touch any other file (no `page.tsx`, no other panels, no API routes, no lib helpers).
