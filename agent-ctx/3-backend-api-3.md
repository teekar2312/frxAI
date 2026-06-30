# Task 3 — AI / News / Alert / Log / Backtest / Risk / Notification / Dashboard API Routes

**Agent**: backend-api-3
**Task ID**: 3
**Scope**: Build all AI/news/alert/log/backtest/risk/notification/dashboard Next.js 16 API routes.

## Files Created (13 route files + 1 shared lib helper)

| # | Path | Methods | Notes |
|---|------|---------|-------|
| 1 | `src/app/api/news/route.ts` | GET | Filters by `category`, `impact`; default `limit=50`; ordered by `publishedAt desc`. |
| 2 | `src/app/api/news/refresh/route.ts` | POST | Calls `z-ai-web-dev-sdk` LLM to synthesize 6 fresh forex news items across the 7 analysis dimensions; inserts as `source='marketaux'`, `publishedAt=now`. 3 deterministic fallback items (breaking / central_bank / cpi) inserted if LLM fails so endpoint never errors. Logs via `logInfo('ai', 'News refreshed: N items')`. |
| 3 | `src/app/api/ai/signals/route.ts` | GET | Filter by `symbol`; default `limit=20`; ordered by `createdAt desc`. |
| 4 | `src/app/api/ai/analyze/route.ts` | POST | Body `{ symbol }`; fetches 15 most-recent news + enabled indicator names; calls `analyzeSymbol(...)`; returns `{ signal }`. |
| 5 | `src/app/api/alerts/route.ts` | GET, POST | GET lists all alerts desc. POST creates `{ symbol, condition, price, notifyEmail?, message? }` with `active=true, triggered=false`; logs via `logInfo('system', ...)`. |
| 6 | `src/app/api/alerts/[id]/route.ts` | PATCH, DELETE | PATCH accepts `{ active?, triggered? }`; DELETE removes. Uses Next 16 `params: Promise<{id}>` awaiting pattern. |
| 7 | `src/app/api/logs/route.ts` | GET, POST, DELETE | GET filters by `level`/`source` (default `limit=200`); POST creates; DELETE clears all. |
| 8 | `src/app/api/backtest/route.ts` | GET, POST | GET filters by `symbol`. POST accepts full schema, defaults `initialCapital=10000`, `riskPerTradePct=0.75`, `stopLossPips=10`, `riskReward=1.5`; validates dates; calls `runBacktest(...)`. |
| 9 | `src/app/api/risk/route.ts` | GET, PATCH | GET returns `Record<key,value>`; PATCH upserts each entry; logs via `logInfo('risk', 'Risk settings updated')`. |
| 10 | `src/app/api/risk/usage/route.ts` | GET | Delegates to shared `computeRiskUsage()` in `@/lib/risk-usage`. |
| 11 | `src/app/api/notifications/route.ts` | GET | Default `limit=50`; ordered by `createdAt desc`. |
| 12 | `src/app/api/notifications/test/route.ts` | POST | Reads `recipient` from body or `SystemConfig.emailRecipient`; calls `sendNotification('system', ...)`. |
| 13 | `src/app/api/dashboard/route.ts` | GET | Returns full `DashboardData`: `accounts`, `defaultAccount`, `openTrades`, `todayClosedTrades`, `todayPnl`, `todayPnlPct`, `riskUsage`, `sessions` (Sydney/Tokyo/London/NY + Overlap), `topNews` (6), `latestSignals` (8), `equitySpark` (40-pt synthetic), `symbols` (4 majors w/ bid/ask/spread/high/low/change/spark). |

**Shared helper**: `src/lib/risk-usage.ts` — exports `computeRiskUsage(): Promise<RiskUsage>`. Used by both `/api/risk/usage` and `/api/dashboard` so the math stays single-sourced. Logic: pulls default account (or first), sums `|calcPnl(symbol, side, lot, openPrice, stopLoss)|` of all open trades with an SL → `openRiskPct`; sums pnl of trades closed today (UTC) → `dailyPnlPct`; `usedPct = max(openRiskPct, |dailyPnlPct|)`; `limitPct` and `maxPositions` pulled from `RiskSetting` (`dailyRiskLimitPct`, `maxOpenPositions`).

## Conventions Followed
- `import { NextRequest, NextResponse } from 'next/server'` everywhere.
- `export const dynamic = 'force-dynamic'` on every route.
- All DB ops wrapped in `try/catch`, returning `{ error }` with status 500 on failure.
- Dynamic route uses `params: Promise<{ id: string }>` then `await params` (Next 16 contract).
- All server-side, no `'use client'`.
- LLM calls use `const ZAI = require('z-ai-web-dev-sdk').default; const zai = await ZAI.create(); const res = await zai.chat.completions.create({ messages, temperature })` then `res.choices[0].message.content`.
- Minimal lint fix to pre-existing `src/lib/ai.ts` (added `// eslint-disable-next-line @typescript-eslint/no-require-imports` above the existing `require` call) — did NOT rewrite the helper.
- `src/lib/risk-usage.ts` marked `'server-only'`.

## Lint Result
`bun run lint` → clean, no errors, no warnings.

## Smoke Test Results (all 200 / valid JSON)
- GET `/api/news` → returns seeded news list.
- POST `/api/news/refresh` → LLM generated 6 fresh items across categories (central_bank, cpi, geopolitical, etc.) and persisted them.
- GET `/api/ai/signals` → returns seeded signals.
- POST `/api/ai/analyze { symbol: 'EURUSD' }` → LLM produced signal `short @ 75%` with reasoning + factor scores.
- GET/POST `/api/alerts` → created alert `EURUSD above 1.09`, persisted with `active=true, triggered=false`.
- GET/POST `/api/logs` → created info log entry.
- POST `/api/backtest { name:'Smoke EURUSD', symbol:'EURUSD', strategy:'ema-cross', periodFrom:'2024-01-01', periodTo:'2024-01-08' }` → ran 58 trades, 67.24% win rate, PF 3.07, +$3383.50 net.
- GET `/api/risk` → returned all risk settings as key/value map.
- GET `/api/risk/usage` → `{usedPct:0, limitPct:2.5, openRiskPct:0, dailyPnlPct:0, openPositions:0, maxPositions:3, dailyPnl:0, balance:10000}`.
- GET `/api/notifications` → returned notification list.
- POST `/api/notifications/test {}` → resolved `recipient` from `SystemConfig.emailRecipient` seed (`trader@example.com`), created `sent=true` notification.
- GET `/api/dashboard` → full payload including 2 accounts (Demo Scalper default + Live Scalper), sessions with progress, topNews, latestSignals, equitySpark (40 pts), 4 symbols with live bid/ask/spread/spark.

## Stage Summary
- All 13 assigned routes built, lint-clean, and verified working at runtime against the live dev server.
- Reused all existing helpers (`@/lib/db`, `@/lib/types`, `@/lib/market`, `@/lib/sessions`, `@/lib/ai`, `@/lib/backtest`, `@/lib/logger`); did NOT recreate any of them.
- Added one new shared helper `@/lib/risk-usage.ts` to keep the risk-usage math DRY between `/api/risk/usage` and `/api/dashboard`.
- Did NOT touch `src/app/page.tsx` or any frontend file.
- LLM integration confirmed working end-to-end (news synthesis + AI signal generation both produced real model output, not just the heuristic fallback).
- Backend is ready for the frontend agent (Task 4) to wire up the dashboard UI to these endpoints.
