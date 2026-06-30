# Task 2 — Backend API Routes Agent

## Task
Build all trading/account/indicator/symbol/session/strategy/system API routes for the FinexFX forex live-trading dashboard.

## Files Created (15 route files, all server-side)
1. `src/app/api/accounts/route.ts` — GET (list all) + POST (create, handles isDefault by unsetting others)
2. `src/app/api/accounts/[id]/route.ts` — PATCH (partial update, isDefault handling) + DELETE
3. `src/app/api/accounts/[id]/connect/route.ts` — POST (toggles connected bool, logs via logInfo/logWarn 'mt5')
4. `src/app/api/trades/route.ts` — GET (filters: status, accountId, symbol, limit; default 100, capped at 500) + POST (validates SUPPORTED_SYMBOLS, opens at bidAsk-based price, default SL 10pips / TP 15pips via SYMBOL_BASE pip, commission = lot*2.5*2, logs + sendNotification)
5. `src/app/api/trades/[id]/route.ts` — PATCH (only open trades, allowed fields: stopLoss, takeProfit, trailingStop, trailingPips, comment)
6. `src/app/api/trades/[id]/close/route.ts` — POST (close at bid/ask based on side, calcPnl for pnl+pips, netPnl deducts commission+swap, updates account balance/equity/freeMargin, logs + sendNotification)
7. `src/app/api/orders/route.ts` — GET (status=pending, optional accountId filter) + POST (validates symbol/side/orderType, creates pending order, logs)
8. `src/app/api/orders/[id]/route.ts` — DELETE (sets status='cancelled', logs)
9. `src/app/api/indicators/route.ts` — GET (ordered by weight desc)
10. `src/app/api/indicators/[id]/route.ts` — PATCH (enabled, autoManaged, weight)
11. `src/app/api/indicators/ai-select/route.ts` — POST (AI re-pick heuristic: top 12 by weight + always-on ATR/Bollinger/VWAP + trend/oscillator with weight>0.7 → enabled, rest disabled, all autoManaged=true; logs 'ai')
12. `src/app/api/symbols/route.ts` — GET (returns SymbolQuote[] for each SUPPORTED_SYMBOLS using bidAsk, priceAt, sparkline(40), dayHighLow, changePct24h, includes pip)
13. `src/app/api/sessions/route.ts` — GET (sessions, overlap, scalpingWindow via lib/sessions)
14. `src/app/api/strategies/route.ts` — GET (4 static strategies: scalping-m5, news-spike, london-breakout, overlap-momentum)
15. `src/app/api/system/config/route.ts` — GET (SystemConfig key→value map) + PATCH (upsert each key, returns full config)

## Conventions Followed
- All routes use `export const dynamic = 'force-dynamic'`
- All routes use `NextRequest`/`NextResponse` from `next/server`
- Dynamic routes use `params: Promise<{ id: string }>` with `await params` (Next.js 16 async params)
- All DB ops wrapped in try/catch, return `{ error }` with status 500 on failure
- Imports: `@/lib/db`, `@/lib/market`, `@/lib/sessions`, `@/lib/logger`, `@/lib/types`
- Trade POST: validates symbol against SUPPORTED_SYMBOLS, opens at side-correct bidAsk price, defaults SL/TP using SYMBOL_BASE pip, commission = lot*2.5*2, source default 'manual'
- Trade close: net PnL subtracts commission + swap, updates account balance/equity/freeMargin atomically
- Account creation: handles isDefault by clearing others' default flag
- Indicator ai-select: heuristic combines top-12-by-weight + always-on set + strong trend/oscillator

## Lint Status
`bunx eslint` on all created files → **0 errors, 0 warnings**.

(2 pre-existing lint errors remain in `src/app/api/news/refresh/route.ts` and `src/lib/ai.ts` — owned by the News/AI agent, not in this task's scope.)

## Stage Summary
All 15 trading/account/indicator/symbol/session/strategy/system API route files created and lint-clean. Routes correctly integrate with existing helpers (`@/lib/db`, `@/lib/market`, `@/lib/sessions`, `@/lib/logger`, `@/lib/types`). Trade open/close correctly compute prices, PnL, pips, commission, and propagate balance updates to accounts. The indicator AI-select route implements the spec's heuristic exactly. All routes are server-side, force-dynamic, and return JSON.
