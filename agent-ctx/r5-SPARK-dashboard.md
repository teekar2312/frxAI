# Task r5-SPARK — KPI Sparklines on Dashboard

**Agent**: full-stack-developer (dashboard)
**Scope**: `src/components/panels/dashboard-panel.tsx` only (file ownership)
**Goal**: Add mini sparklines to the 4 KPI cards (Equity, P&L, Risk, Open Positions) to make the dashboard more visually rich and "alive".

## Approach

1. Created a reusable `MiniSpark` component (recharts AreaChart + Area, monotone curve, gradient fill, no axes/tooltip) — kept subtle at ~36px height.
2. Created a deterministic `genSpark(seed, points, startValue, endValue, noise)` helper for synthetic curves (used by Risk + Open Positions cards since no historical data exists for those metrics).
3. Extended each KPI card's props and added a footer section with:
   - A tiny 2-column label row (e.g. "Equity · 30m trend" + a metric value)
   - A `motion.div` fade-in (opacity 0→1, 0.5s, 0.15s delay) with fixed `height: 36` to prevent layout shift
   - The `MiniSpark` itself
4. Updated the parent `DashboardPanel` to pass the new props.

## Per-card Implementation

### KpiAccountCard — Equity Sparkline (real data)
- New prop: `spark?: number[]`
- Receives `data.equitySpark` (40-point synthetic curve anchored at balance) from parent.
- Color: emerald (`var(--bull)`) — always positive equity color.
- Label: "Equity · 30m trend" + computes % change from first→last spark value, colored bull/bear.

### KpiPnlCard — P&L Sparkline (real cumulative)
- New prop: `closedTrades?: Trade[]`
- Builds cumulative P&L: filters by `closeTime`, sorts ascending, accumulates `pnl`, prepends 0.
- Falls back to flat line `[0, 0]` if no closed trades today.
- Color: emerald if `pnl >= 0`, rose if negative.
- Label: "P&L · today" + "{n} trade" or "flat".

### KpiRiskCard — Risk Usage Sparkline (synthetic)
- No new prop — uses `risk.usedPct`.
- Generates 20-point rising curve via `genSpark(seed, 20, usedPct * 0.15, usedPct, 0.22)` — starts low and oscillates up to the current value.
- Color: emerald if <50%, amber if 50–80%, rose if >80% (matches `riskTone()`).
- Label: "Risk · 30m trend" + "{usedPct}%" colored via `tone.text`.

### KpiOpenPositionsCard — Positions Sparkline (synthetic descending)
- No new prop — uses `trades.length`.
- Generates 20-point descending curve via `genSpark(seed, 20, peak, current, 0.25)` where `peak = max(current+2, 5)` — conveys positions winding down from a recent peak.
- Color: emerald (`var(--bull)`).
- Label: "Positions · 30m trend" + "{n} now".
- Sparkline is placed ABOVE the existing symbol badges (which remain intact per task spec).

## Styling Decisions
- Gradient fill: `stop-color={color} stop-opacity=0.4` (top) → `0` (bottom).
- Stroke width: 1.75px, monotone curve, no dots, no animation (instant render — no layout shift).
- Each card uses a unique gradient ID: `kpi-acct-spark`, `kpi-pnl-spark`, `kpi-risk-spark`, `kpi-pos-spark`.
- Existing corner blur glow (`-right-8 -top-8 h-24 w-24 rounded-full blur-2xl`) is preserved — sparkline added below as a separate footer section separated by a `<Separator>`.
- Sparkline container is wrapped in `motion.div` with `style={{ height: 36, width: '100%' }}` so the height is reserved during fade-in (no layout shift).

## Verification

### Lint
`bun run lint` → **0 errors, 0 warnings** ✅

### DOM check (agent-browser)
On `#dashboard` tab, queried `.recharts-surface` elements with height ~36:
```
4 surfaces: w=205, h=36, top=336/284/276/218 (KPI row)
1 surface: w=656, h=192 (Equity Curve Card)
4 surfaces: w=32, h=28 (Watchlist sparklines — pre-existing)
```
All 4 new MiniSparks confirmed rendering in the KPI row.

### Visual QA (VLM via z-ai vision)
Prompted GLM-4.6v to verify each of the 4 KPI cards for: (a) sparkline visible, (b) color, (c) label present.

Per-card result:
- **Account Equity**: ✅ sparkline, ✅ green, ✅ "Equity · 30m trend"
- **Today's P&L**: ✅ sparkline, ✅ green, ✅ "P&L · today"
- **Daily Risk Used**: ✅ sparkline, ✅ green, ✅ "Risk · 30m trend"
- **Open Positions**: ✅ sparkline, ✅ green, ✅ "Positions · 30m trend"

VLM also confirmed sparklines are "subtle and appropriately designed" and "don't overpower the main KPI information."

### Console
Only pre-existing warnings from the watchlist `Sparkline` component (width=70, height=32 fixed in ResponsiveContainer — unrelated to my code). No JS errors.

## Files Modified
- `src/components/panels/dashboard-panel.tsx` — added `MiniSpark`, `genSpark`, extended 4 KPI cards, updated parent props.

## Notes for Future Cycles
- The risk + open-positions sparklines are synthetic (no historical data exists in DB). A future cycle could add a `kpi_history` table that records equity/pnl/risk/positions every minute, then wire the sparklines to real history.
- The P&L sparkline shows cumulative closed-trade P&L only (not live floating P&L). A future enhancement could overlay the current open-trade floating P&L as a dotted endpoint.
