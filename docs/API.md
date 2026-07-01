# frxAI API Reference

**Base URL:** `/api`

**Authentication:** Bearer token (NextAuth JWT) via `Authorization: Bearer <token>` header or session cookie.

**Roles:**

| Role | Level | Access |
|------|-------|--------|
| `viewer` | 1 | Read-only access to most endpoints |
| `trader` | 2 | All viewer access + trade operations (open, close, modify) |
| `admin` | 3 | Full access including user management, system config, backups |

**Legend:** <span title="No authentication required">**Public**</span> &middot; <span title="Any authenticated role">**Session**</span> &middot; <span title="Trader or Admin role required">**Trader+**</span> &middot; <span title="Admin role required">**Admin**</span> &middot; <span title="Requires X-Service-Key header">**Service Key**</span>

---

## Rate Limits

All rate limits are per-IP (unless otherwise noted). Rate-limited responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` headers.

| Preset | Key | Max Requests | Window |
|--------|-----|-------------|--------|
| General API | `general-api` | 100 | 60 s |
| Login | `login` | 5 | 60 s |
| Trade Open | `trade-open` | 10 | 60 s |
| Trade Close | `trade-close` | 20 | 60 s |
| Close All | `close-all` | 3 | 60 s |
| Trade Partial Close | `trade-partial-close` | 20 | 60 s |
| Trade Move to BE | `trade-move-to-be` | 20 | 60 s |
| Trade Note | `trade-note` | 20 | 60 s |
| Kill Switch | `kill-switch` | 2 | 30 s |
| Order Cancel | `order-cancel` | 20 | 60 s |
| AI Analyze | `ai-analyze` | 5 | 60 s |
| AI Auto-Trade | `ai-auto-trade` | 3 | 60 s |
| AI Evaluate | `ai-evaluate` | 10 | 60 s |
| AI Indicator Select | `ai-indicator-select` | 5 | 60 s |
| Backtest Run | `backtest-run` | 3 | 60 s |
| Backtest Optimize | `backtest-optimize` | 2 | 60 s |
| Alert Create | `alert-create` | 10 | 60 s |
| Alert Manage | `alert-manage` | 20 | 60 s |
| Risk Update | `risk-update` | 10 | 60 s |
| Account Create | `account-create` | 5 | 60 s |
| Indicator Update | `indicator-update` | 30 | 60 s |
| Password Change | `password-change` | 3 | 3600 s |
| User Create | `user-create` | 5 | 3600 s |
| User Manage | `user-manage` | 10 | 60 s |
| Log Create | `log-create` | 30 | 60 s |
| Log Purge | `log-purge` | 2 | 3600 s |
| MT5 Connect | `mt5-connect` | 5 | 60 s |
| MT5 Disconnect | `mt5-disconnect` | 10 | 60 s |
| MT5 Reconcile | `reconcile` | 10 | 60 s |
| System Config Update | `system-config-update` | 10 | 60 s |
| News Refresh | `news-refresh` | 3 | 60 s |
| Calendar Refresh | `calendar-refresh` | 3 | 60 s |
| Webhook Test | `webhook-test` | 5 | 60 s |
| Backup Delete | `backup-delete` | 5 | 60 s |
| Manual Backup | `manual-backup` | 3 | 3600 s |

---

## Response Format

**Success (2xx):**

```json
{ "data": ... }
// or direct payload: { "trades": [...], "settings": {...}, "ok": true }
```

**Error:**

```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthorized — authentication required |
| 403 | Forbidden — insufficient role |
| 404 | Resource not found |
| 409 | Conflict — resource already modified |
| 422 | Trade rejected by risk management |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 503 | Service degraded (health check) |

---

## Authentication

### POST /api/auth/[...nextauth]

NextAuth handler. Manages login, logout, and session tokens.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | login (5/min) |

**Request body:** NextAuth credentials (`email`, `password`)

**Response:** NextAuth session object (JWT token)

---

### GET /api/auth/me

Returns the currently authenticated user's profile (for avatar + role badge).

| | |
|---|---|
| **Auth** | None (returns `null` if unauthenticated) |
| **Rate limit** | — |

**Response:**

```json
{ "user": { "id": "string", "email": "string", "name": "string", "role": "admin"|"trader"|"viewer" } | null }
```

---

### POST /api/auth/me/password

Changes the authenticated user's own password.

| | |
|---|---|
| **Auth** | Session |
| **Rate limit** | password-change (3/hour) |

**Request body:**

```json
{
  "currentPassword": "string (min 1)",
  "newPassword": "string (min 6, max 128)"
}
```

**Response:** `{ "ok": true }`

**Errors:** 400 — current password incorrect

---

## Dashboard

### GET /api/dashboard

Returns the main dashboard payload for the default (or specified) account.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:** `accountId` (optional)

**Response:** Full `DashboardData` object including `accounts`, `defaultAccount`, `openTrades`, `todayClosedTrades`, `todayPnl`, `todayPnlPct`, `riskUsage`, `sessions`, `topNews`, `latestSignals`, `equitySpark`, `symbols` (with bid/ask/spread/sparkline), and `mt5` (bridge status + live account info).

---

### GET /api/dashboard/aggregate

Multi-account aggregate view with totals across all accounts.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:**

```json
{
  "aggregate": {
    "totalBalance": number,
    "totalEquity": number,
    "totalFreeMargin": number,
    "totalUsedMargin": number,
    "accountCount": number,
    "openPositionsTotal": number,
    "todayPnlTotal": number,
    "todayPnlPct": number,
    "perAccount": [{ "accountId", "accountName", "broker", "balance", "equity", "openPositions", "todayPnl", "todayPnlPct", "connected" }],
    "symbols": [...],
    "equitySpark": number[],
    "riskUsage": {...},
    "sessions": [...]
  }
}
```

---

## Accounts

### GET /api/accounts

Lists all trading accounts.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:** `{ "accounts": [...] }`

---

### POST /api/accounts

Creates a new trading account.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | account-create (5/min) |

**Request body:**

```json
{
  "name": "string (1-100, required)",
  "broker": "string (max 100, default: 'FINEX Indonesia')",
  "server": "string (max 200, default: '')",
  "login": "string (1-50, required)",
  "accountType": "demo" | "live",
  "currency": "string (max 10, default: 'USD')",
  "leverage": "string (max 20, default: '1:100')",
  "balance": "number (min 0, default: 10000)",
  "isDefault": "boolean (default: false)"
}
```

**Response:** `{ "account": { "id", "name", "broker", "server", "login", "accountType", "currency", "leverage", "balance", "equity", "margin", "freeMargin", "marginLevel", "connected", "isDefault", "createdAt" } }`

---

### GET /api/accounts/:id

> **Not implemented.** Use `GET /api/accounts` and filter client-side.

---

### PATCH /api/accounts/:id

Updates an account. If `isDefault: true`, atomically unsets default on other accounts.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | general (100/min) |

**Request body:** Partial object with any of: `name`, `broker`, `server`, `login`, `accountType`, `currency`, `leverage`, `balance`, `equity`, `margin`, `freeMargin`, `marginLevel`, `connected`, `isDefault`.

**Response:** `{ "account": {...} }`

**Errors:** 404 — account not found

---

### DELETE /api/accounts/:id

Deletes an account atomically. Refuses if open positions exist.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | general (100/min) |

**Response:** `{ "ok": true }`

**Errors:** 400 — open positions exist (atomic delete prevents data loss)

---

### POST /api/accounts/:id/connect

Toggles the MT5 connection status for an account.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | general (100/min) |

**Response:**

```json
{ "account": {...}, "connected": true|false }
```

**Errors:** 404 — account not found

---

## Trades

### GET /api/trades

Lists trades with optional filters.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter by status (`open`, `closed`) |
| `accountId` | string | — | Filter by account ID |
| `symbol` | string | — | Filter by symbol |
| `limit` | number | 100 | Max results (1–500) |

**Response:** `{ "trades": [...] }`

---

### POST /api/trades

Opens a new trade. Routes through MT5 bridge if online; falls back to synthetic price. Subject to 8-check risk enforcement.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | trade-open (10/min) |

**Request body:**

```json
{
  "accountId": "string (required)",
  "symbol": "EURUSD" | "USDJPY" | "GBPUSD" | "XAUUSD",
  "side": "buy" | "sell",
  "lotSize": "number (positive, max 100)",
  "stopLoss": "number (positive) | null",
  "takeProfit": "number (positive) | null",
  "source": "manual" | "auto" | "ai" (default: "manual")",
  "trailingStop": "boolean (default: false)",
  "trailingPips": "number (min 0, default: 0)",
  "comment": "string (max 500) | null"
}
```

**Response:** `{ "trade": { "id", "accountId", "symbol", "side", "lotSize", "openPrice", "stopLoss", "takeProfit", "status": "open", "pnl": 0, "commission", "source", "mt5Ticket", ... } }`

**Errors:**
- 404 — account not found
- 422 — trade rejected by risk management (`{ "error": "Trade rejected by risk management", "violations": [...], "context": {...} }`)

---

### PATCH /api/trades/:id

Updates an open trade's SL, TP, trailing stop, or comment.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | general (100/min) |

**Request body:**

```json
{
  "stopLoss": "number (positive) | null",
  "takeProfit": "number (positive) | null",
  "trailingStop": "boolean",
  "trailingPips": "number (0–500)",
  "comment": "string (max 500) | null"
}
```

**Response:** `{ "trade": {...} }`

**Errors:** 404 — not found; 400 — not an open trade

---

### POST /api/trades/:id/close

Closes a single trade at market price. Atomic (race-condition safe). Closes via MT5 bridge if ticket exists.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | trade-close (20/min) |

**Request body:** None

**Response:** `{ "trade": { "id", ..., "closePrice", "pnl", "pips", "status": "closed", "closeTime", ... } }`

**Errors:** 404 — not found; 400 — already closed; 409 — closed by another process concurrently

---

### POST /api/trades/:id/partial-close

Partially closes a position by percentage. Creates a separate closed trade record for the closed portion and reduces the original trade's lot size. All 3 writes are atomic.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | trade-partial-close (20/min) |

**Request body:**

```json
{ "percent": "number (1–100, default: 50)" }
```

**Response:**

```json
{
  "closedTrade": { "id", "symbol", "side", "lotSize", "openPrice", "closePrice", "pnl", "pips", ... },
  "remainingLot": number,
  "netPnl": number,
  "pips": number,
  "closePrice": number
}
```

**Errors:** 404 — not found; 400 — not open / close lot too small (< 0.01); 409 — closed by another process

---

### POST /api/trades/:id/move-to-be

Moves the stop-loss to entry price (break-even), making the trade risk-free. Optionally adds a buffer in pips beyond entry. Guards against widening risk.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | trade-move-to-be (20/min) |

**Request body:**

```json
{ "bufferPips": "number (0–50, default: 0)" }
```

**Response:**

```json
{ "trade": {...}, "previousSl": number|null, "newSl": number, "bufferPips": number, "message": "..." }
```

**Errors:** 404 — not found; 400 — not open / BE SL would widen risk

---

### PATCH /api/trades/:id/notes

Updates the journal comment on a trade (works on both open and closed trades, unlike `PATCH /api/trades/:id`).

| | |
|---|---|
| **Auth** | Session |
| **Rate limit** | trade-note (20/min) |

**Request body:**

```json
{ "comment": "string (max 500) | null" }
```

**Response:** `{ "trade": {...} }`

**Errors:** 404 — not found

---

### POST /api/trades/close-all

Emergency close all open positions for an account atomically. Each trade uses `atomicCloseTrade()` for race safety.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | close-all (3/min) |

**Request body (optional):**

```json
{
  "accountId": "string (default account if omitted)",
  "reason": "string (max 200)"
}
```

**Response:**

```json
{
  "closed": [{ "id", "symbol", "side", "lotSize", "closePrice", "pnl", "pips", "mt5Ticket" }],
  "failed": [{ "id", "symbol", "reason" }],
  "totalPnl": number,
  "count": number,
  "message": "..."
}
```

**Errors:** 404 — account not found

---

### POST /api/trades/check-sl-tp

**Service Key** — Checks all open trades against current market prices. Closes any hitting SL/TP. Applies trailing stop adjustments. Called by the SL/TP monitor mini-service.

| | |
|---|---|
| **Auth** | Service Key (`X-Service-Key`) |
| **Rate limit** | — |

**Request body:** None

**Response:**

```json
{
  "closed": [{ "id", "symbol", "side", "reason", "closePrice", "pnl", "pips" }],
  "trailed": [{ "id", "symbol", "side", "oldSl", "newSl" }],
  "skipped": [{ "id", "symbol", "reason" }],
  "checked": number
}
```

---

### GET /api/trades/export

Exports trades as CSV file (attachment download).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | `closed` | Trade status filter |
| `accountId` | string | — | Account filter |

**Response:** CSV file (`Content-Type: text/csv`, `Content-Disposition: attachment`)

---

### GET /api/trades/:id/replay

Returns price history for a trade's open→close period for the trade replay chart. Tries MT5 bridge bars first; falls back to synthetic.

| | |
|---|---|
| **Auth** | Session |
| **Rate limit** | — |

**Response:**

```json
{
  "source": "mt5-bridge" | "synthetic-fallback",
  "bars": [{ "time", "t", "price", "open?", "high?", "low?", "close?" }],
  "trade": { "id", "symbol", "side", "openPrice", "closePrice", "stopLoss", "takeProfit", "openTime", "closeTime", "lotSize", "pnl", "pips", "source", "mt5Ticket" }
}
```

**Errors:** 404 — trade not found

---

## Orders

### GET /api/orders

Lists pending orders.

| | |
|---|---|
| **Auth** | Session |
| **Rate limit** | — |

**Query params:** `accountId` (optional)

**Response:** `{ "orders": [...] }`

---

### POST /api/orders

Creates a pending limit or stop order.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | trade-open (10/min) |

**Request body:**

```json
{
  "accountId": "string (required)",
  "symbol": "EURUSD" | "USDJPY" | "GBPUSD" | "XAUUSD",
  "side": "buy" | "sell",
  "orderType": "limit" | "stop",
  "lotSize": "number (positive, max 100)",
  "price": "number (positive, required)",
  "stopLoss": "number (positive) | null",
  "takeProfit": "number (positive) | null"
}
```

**Response:** `{ "order": { "id", "accountId", "symbol", "side", "orderType", "lotSize", "price", "stopLoss", "takeProfit", "status": "pending", ... } }`

**Errors:** 404 — account not found

---

### DELETE /api/orders/:id

Cancels a pending order (sets status to `cancelled`).

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | order-cancel (20/min) |

**Response:** `{ "ok": true }`

**Errors:** 404 — order not found

---

## AI

### POST /api/ai/analyze

Runs AI analysis on a symbol using the LLM. Feeds recent news + enabled indicators as context.

| | |
|---|---|
| **Auth** | Session |
| **Rate limit** | ai-analyze (5/min) |

**Request body:**

```json
{
  "symbol": "EURUSD" | "USDJPY" | "GBPUSD" | "XAUUSD",
  "timeframe": "M1" | "M5" | "M15" | "H1" (default: "M5")
}
```

**Response:** `{ "signal": { "id", "symbol", "direction", "action", "confidence", "reasoning", "indicators", ... } }`

---

### POST /api/ai/auto-trade

Scans latest AI signals for all symbols. If auto-trading is enabled and risk limits allow, executes trades for high-confidence actionable signals. Each trade goes through the full 8-check risk enforcement.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | ai-auto-trade (3/min) |

**Request body:** None

**Response:**

```json
{
  "enabled": true|false,
  "message": "...",
  "executed": [{ "symbol", "side", "lot", "openPrice", "confidence", "tradeId", "mt5Ticket" }],
  "rejected": [{ "symbol", "side", "lot", "confidence", "violations" }],
  "openPositions": number,
  "todayPnlPct": 0
}
```

**Errors:** 400 — no default account / account not connected

---

### POST /api/ai/evaluate

**Service Key** — Evaluates AI signal accuracy by comparing predicted direction with actual price movement.

| | |
|---|---|
| **Auth** | Service Key + Session |
| **Rate limit** | ai-evaluate (10/min) |

**Request body (optional):**

```json
{ "signalId": "string" }
```

- If `signalId` provided: evaluates that specific signal.
- If omitted: batch-evaluates all pending signals (max 50).

**Response (single):** `{ "signalId": "...", "result": {...} }`

**Response (batch):** `{ "batch": true, "evaluated": number, "correct": number, ... }`

---

### GET /api/ai/quality

Returns AI signal quality metrics: overall accuracy, per-symbol breakdown, confidence calibration.

| | |
|---|---|
| **Auth** | Session |
| **Rate limit** | — |

**Query params:** `symbol` (optional — filter to specific symbol)

**Response (overall):**

```json
{ "overallAccuracy": number, "bySymbol": [...], "totalEvaluated": number, ... }
```

**Response (per-symbol):** `{ "symbol": "EURUSD", "stats": { "accuracy", "totalSignals", ... } }`

---

### GET /api/ai/signals

Lists recent AI signals.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `symbol` | string | — | Filter by symbol |
| `limit` | number | 20 | Max results (1–200) |

**Response:** `{ "signals": [...] }`

---

## Indicators

### GET /api/indicators

Lists all technical indicators ordered by weight (descending).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:** `{ "indicators": [...] }`

---

### PATCH /api/indicators/:id

Updates an indicator's settings.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | indicator-update (30/min) |

**Request body:**

```json
{
  "enabled": "boolean",
  "autoManaged": "boolean",
  "weight": "number (0–100)"
}
```

**Response:** `{ "indicator": {...} }`

**Errors:** 404 — indicator not found

---

### DELETE /api/indicators/:id

> **Not implemented.** Indicators are managed via PATCH (enable/disable).

---

### POST /api/indicators/ai-select

AI-driven indicator re-selection. Enables top 12 by weight + always-on indicators (ATR, Bollinger, VWAP) + strong trend/oscillator indicators (weight > 0.7). Disables the rest.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | ai-indicator-select (5/min) |

**Request body:** None

**Response:** `{ "indicators": [...] }`

---

## Analytics

### GET /api/analytics

Computes full trade performance analytics: win rate, profit factor, expectancy, Sharpe/Sortino ratios, max drawdown, breakdowns by pair/session/source/day, equity curve, P&L distribution, streaks.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `accountId` | string | — | Filter by account |
| `days` | number | 30 | Lookback period in days |

**Response:**

```json
{
  "analytics": {
    "totalTrades": number,
    "totalClosed": number,
    "wins": number,
    "losses": number,
    "winRate": number,
    "netProfit": number,
    "grossProfit": number,
    "grossLoss": number,
    "profitFactor": number,
    "avgWin": number,
    "avgLoss": number,
    "bestTrade": number,
    "worstTrade": number,
    "avgHoldMinutes": number,
    "byPair": [...],
    "bySource": [...],
    "bySession": [...],
    "byDay": [...],
    "equityCurve": [...],
    "pnlDistribution": [...],
    "consecutiveWins": number,
    "consecutiveLosses": number,
    "maxConsecutiveWins": number,
    "maxConsecutiveLosses": number,
    "expectancy": number,
    "avgRR": number,
    "maxDrawdown": number,
    "maxDrawdownPct": number,
    "sharpeRatio": number,
    "sortinoRatio": number,
    "largestWin": number,
    "largestLoss": number
  }
}
```

---

### GET /api/analytics/export

Generates a self-contained, print-friendly HTML performance report (browser can print/save as PDF).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:** `accountId`, `days` (default: 30)

**Response:** HTML file (`Content-Type: text/html`, `Content-Disposition: attachment`)

---

## Alerts

### GET /api/alerts

Lists all price alerts.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:** `{ "alerts": [...] }`

---

### POST /api/alerts

Creates a new price alert.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | alert-create (10/min) |

**Request body:**

```json
{
  "symbol": "EURUSD" | "USDJPY" | "GBPUSD" | "XAUUSD",
  "condition": "above" | "below" | "cross_up" | "cross_down",
  "price": "number (positive, required)",
  "notifyEmail": "boolean (default: true)",
  "message": "string (max 500) | null"
}
```

**Response:** `{ "alert": { "id", "symbol", "condition", "price", "active": true, "triggered": false, ... } }`

---

### PATCH /api/alerts/:id

Updates an alert. When marking `triggered: true`, fires a webhook notification.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | alert-manage (20/min) |

**Request body:**

```json
{
  "active": "boolean",
  "triggered": "boolean",
  "triggeredAt": "datetime string | null"
}
```

**Response:** `{ "alert": {...} }`

---

### DELETE /api/alerts/:id

Deletes an alert.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | alert-manage (20/min) |

**Response:** `{ "ok": true }`

---

## News

### GET /api/news

Lists forex/macro news items.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `category` | string | — | Filter by category |
| `impact` | string | — | Filter by impact level |
| `limit` | number | 50 | Max results (1–500) |

**Response:** `{ "news": [...] }`

---

### POST /api/news/refresh

Generates fresh news via LLM (or falls back to hardcoded items if LLM fails).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | news-refresh (3/min) |

**Request body:** None

**Response:** `{ "news": [{ "id", "title", "summary", "category", "impact", "sentiment", "symbols", "publishedAt", ... }] }`

---

## Economic Calendar

### GET /api/economic-calendar

Lists upcoming economic events.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `days` | number | 7 | Days ahead to fetch |
| `impact` | string | — | Filter by impact |
| `country` | string | — | Filter by country |
| `status` | string | — | Filter by status |
| `category` | string | — | Filter by category |
| `limit` | number | 100 | Max results (1–200) |

**Response:** `{ "events": [...], "total": number }`

---

### POST /api/economic-calendar/refresh

Uses LLM to synthesize fresh upcoming economic events (or inserts 3 deterministic fallback events).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | calendar-refresh (3/min) |

**Request body:** None

**Response:** `{ "events": [...], "added": number }`

---

### POST /api/economic-calendar/check-alerts

Checks for high-impact events within the next 15 minutes and sends email alerts (deduped).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Request body:** None

**Response:**

```json
{ "alerted": [{ "id", "title", "country", "minsUntil", "symbols" }], "checked": number }
```

---

## Risk

### GET /api/risk

Returns all risk management settings as a flat key-value map.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:** `{ "settings": { "maxPositions": "5", "dailyRiskLimitPct": "3", "autoTradingEnabled": "false", ... } }`

---

### PATCH /api/risk

Updates risk management settings. Uses upsert (creates missing keys).

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | risk-update (10/min) |

**Request body:**

```json
{
  "settings": {
    "maxPositions": "5",
    "dailyRiskLimitPct": "3",
    "autoTradingEnabled": "true",
    ...
  }
}
```

Values are `Record<string, string>` — all values stored as strings (max 2000 chars each).

**Response:** `{ "settings": {...} }`

**Errors:** 400 — `settings` object required

---

### GET /api/risk/usage

Returns current risk usage metrics (open positions, lot usage, daily P&L %).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:** `RiskUsage` object (computed via `computeRiskUsage()`)

---

### GET /api/risk/enforcement

Returns risk enforcement configuration + current status for an account.

| | |
|---|---|
| **Auth** | Session |
| **Rate limit** | — |

**Query params:** `accountId` (optional — without it, returns config only)

**Response (with accountId):**

```json
{
  "config": { "maxPositions": number, "maxLotSize": number, ... },
  "status": {
    "openPositions": number,
    "totalLot": number,
    "dailyLossCircuitBreakerActive": boolean,
    "dailyPnlPct": number,
    "tradesAllowed": boolean,
    "violations": string[],
    "context": {...}
  }
}
```

**Errors:** 404 — account not found

---

## Logs

### GET /api/logs

Lists system logs with optional filters.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `level` | string | — | `info`, `warn`, `error` |
| `source` | string | — | Log source (e.g., `api`, `mt5`, `ai`) |
| `limit` | number | 200 | Max results (1–1000) |
| `stats` | `true` | — | Return log stats instead of log entries |

**Response (logs):** `{ "logs": [...] }`

**Response (stats):** `{ "total": number, "byLevel": {...}, "bySource": {...}, "oldest": "...", "newest": "..." }`

---

### POST /api/logs

Creates a log entry programmatically.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | log-create (30/min) |

**Request body:**

```json
{
  "level": "info" | "warn" | "error",
  "source": "string (1-50, required)",
  "message": "string (1-5000, required)",
  "stack": "string (max 10000) | null",
  "context": "any | null"
}
```

**Response:** `{ "log": { "id", "level", "source", "message", ... } }`

---

### DELETE /api/logs

Purges all log entries.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | log-purge (2/hour) |

**Response:** `{ "ok": true }`

---

### POST /api/logs/cleanup

**Service Key** — Deletes logs older than retention period (info: 7d, warn: 14d, error: 30d, debug: 3d) and old AI signals. Called by SL/TP monitor every 6 hours.

| | |
|---|---|
| **Auth** | None (background service) |
| **Rate limit** | — |

**Response:** `{ "ok": true, "logs": { "deleted": number }, "signals": { "deleted": number } }`

---

## MT5

### GET /api/mt5/health

**Public** — Returns MT5 bridge status (cached 5s server-side).

| | |
|---|---|
| **Auth** | None (Public) |
| **Rate limit** | — |

**Response:**

```json
{
  "ok": true|false,
  "adapter": "mock"|"real-python",
  "isLive": boolean,
  "message": "MT5 bridge online — LIVE mode (real orders) | ..."
}
```

---

### POST /api/mt5/connect

Connects the MT5 bridge to the broker. Optionally persists login/server on the Account record and syncs balance/equity.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | mt5-connect (5/min) |

**Request body:**

```json
{
  "login": "number (int, positive, required)",
  "server": "string (1-200, required)",
  "password": "string (1-200, required)",
  "accountId": "string (optional)"
}
```

**Response:** `{ "account": { "balance", "equity", "freeMargin", "margin", "marginLevel", "leverage", ... } }`

---

### DELETE /api/mt5/connect

Disconnects the MT5 bridge session.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | mt5-disconnect (10/min) |

**Query params:** `login` (required — MT5 login number)

**Response:** `{ "ok": true }`

**Errors:** 400 — `login` query param required

---

### GET /api/mt5/account

Fetches live account info from the MT5 bridge.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:** `login` (required — MT5 login number)

**Response:** `{ "account": { "balance", "equity", "freeMargin", "margin", ... } }`

**Errors:** 400 — `login` required; 404 — account not connected to bridge

---

### GET /api/mt5/tick

Returns current bid/ask for a symbol. Tries MT5 bridge first; falls back to synthetic.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:** `symbol` (required — must be a supported symbol)

**Response:**

```json
{
  "tick": { "symbol", "bid", "ask", "spread", "time" },
  "source": "mt5-bridge" | "synthetic-fallback"
}
```

**Errors:** 400 — valid symbol required

---

### POST /api/mt5/reconcile

**Service Key** — Syncs local Trade records with MT5 bridge positions. Detects externally-closed trades and updates the local DB.

| | |
|---|---|
| **Auth** | Service Key + Session |
| **Rate limit** | reconcile (10/min) |

**Request body (optional):**

```json
{ "accountId": "string" }
```

- If `accountId` provided: reconciles that account only.
- If omitted: reconciles all accounts with MT5 login.

**Response:**

```json
{ "report": { "checked", "synced", "updated", "orphaned", "errors", "details" } }
```

**Errors:** 404 — account not found; 400 — account has no MT5 login

---

## Backtest

### GET /api/backtest

Lists previous backtests.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `symbol` | string | — | Filter by symbol |
| `limit` | number | 20 | Max results (1–200) |

**Response:** `{ "backtests": [...] }`

---

### POST /api/backtest

Runs a single backtest with specified parameters.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | backtest-run (3/min) |

**Request body:**

```json
{
  "name": "string (1-200, required)",
  "symbol": "EURUSD" | "USDJPY" | "GBPUSD" | "XAUUSD",
  "timeframe": "M1" | "M5" | "M15" | "H1",
  "strategy": "string (1+, required — strategy ID)",
  "periodFrom": "datetime string (optional)",
  "periodTo": "datetime string (optional)",
  "initialCapital": "number (min 100, default: 10000)",
  "riskPerTradePct": "number (0.1–10)",
  "stopLossPips": "number (1–100)",
  "riskReward": "number (0.5–10)"
}
```

**Response:** `{ "backtest": { "id", "totalTrades", "winRate", "profitFactor", "netProfit", "maxDrawdown", "sharpeRatio", ... } }`

**Errors:** 400 — invalid periodFrom/periodTo

---

### POST /api/backtest/optimize

Runs backtests across all strategies × all symbols (28 combinations) to find the best configuration. Scored by weighted combination of profit factor, win rate, net profit, Sharpe ratio, and low drawdown.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | backtest-optimize (2/min) |

**Request body (optional):**

```json
{
  "periodFrom": "datetime string",
  "periodTo": "datetime string",
  "initialCapital": "number (100–10,000,000, default: 10000)"
}
```

**Response:**

```json
{
  "results": [{ "strategyId", "strategyName", "symbol", "totalTrades", "winRate", "profitFactor", "netProfit", "maxDrawdown", "sharpeRatio", "score" }],
  "best": { ... } | null,
  "worst": { ... } | null,
  "summary": { "totalConfigs", "profitableCount", "avgWinRate", "avgProfitFactor", "totalNetProfit" }
}
```

**Errors:** 400 — invalid period

---

## Users (Admin)

### GET /api/users

Lists all users.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | — |

**Response:** `{ "users": [...] }`

---

### POST /api/users

Creates a new user.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | user-create (5/hour) |

**Request body:**

```json
{
  "email": "string (valid email, required)",
  "name": "string (1-100, required)",
  "password": "string (6-128, required)",
  "role": "admin" | "trader" | "viewer" (default: "trader")
}
```

**Response (201):** `{ "user": { "id", "email", "name", "role", ... } }`

---

### GET /api/users/:id

> **Not implemented.** Use `GET /api/users` and filter client-side.

---

### PATCH /api/users/:id

Updates a user's role, active status, or name.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | user-manage (10/min) |

**Request body:**

```json
{
  "role": "admin" | "trader" | "viewer",
  "active": "boolean",
  "name": "string (1-100)"
}
```

**Response:** `{ "user": {...} }`

**Errors:** 400 — cannot deactivate yourself

---

### POST /api/users/:id

Admin resets another user's password.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | password-change (3/hour) |

**Request body:**

```json
{ "password": "string (6-128, required)" }
```

**Response:** `{ "ok": true }`

---

### DELETE /api/users/:id

Deletes a user. Cannot delete yourself.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | user-manage (10/min) |

**Response:** `{ "ok": true }`

**Errors:** 400 — cannot delete your own account

---

## System (Admin)

### GET /api/system/config

Returns all system configuration as a flat key-value map.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:** `{ "config": { "webhook_enabled": "false", "emailRecipient": "...", ... } }`

---

### PATCH /api/system/config

Updates system configuration. Uses upsert in a transaction. All changes are audited.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | system-config-update (10/min) |

**Request body:**

```json
{
  "config": {
    "webhook_enabled": "true",
    "emailRecipient": "trader@example.com",
    ...
  }
}
```

Values are `Record<string, string>` — all values stored as strings (max 2000 chars each).

**Response:** `{ "config": {...} }`

---

### POST /api/system/kill-switch

Emergency Kill Switch. Disables auto-trading immediately and closes ALL open positions atomically.

| | |
|---|---|
| **Auth** | Trader+ |
| **Rate limit** | kill-switch (2/30s) |

**Request body (optional):**

```json
{
  "accountId": "string (default account if omitted)",
  "reason": "string (max 200)"
}
```

**Response:**

```json
{
  "halted": true,
  "autoTradingDisabled": true,
  "closed": [{ "id", "symbol", "side", "lotSize", "closePrice", "pnl", "pips" }],
  "failed": [{ "id", "symbol", "reason" }],
  "totalPnl": number,
  "count": number,
  "message": "..."
}
```

---

### GET /api/system/errors

Returns error monitoring statistics.

| | |
|---|---|
| **Auth** | Session |
| **Rate limit** | — |

**Query params:** `hours` (default: 24)

**Response:**

```json
{
  "window": "24h",
  "stats": { "total", "bySeverity": {...}, "bySource": {...}, "recent": [...] },
  "spike": { "active": boolean, "count": number, ... },
  "timestamp": "..."
}
```

---

### GET /api/system/backup

Lists all database backups with statistics.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | — |

**Response:**

```json
{
  "stats": { "totalBackups", "totalSizeMB", "lastBackup": "..." },
  "backups": [{ "filename", "size", "sizeMB", "createdAt" }]
}
```

---

### POST /api/system/backup

**Service Key** — Triggers a manual database backup.

| | |
|---|---|
| **Auth** | Service Key + Admin |
| **Rate limit** | manual-backup (3/hour) |

**Request body:** None

**Response:**

```json
{
  "ok": true,
  "backup": { "filename", "size", "sizeMB", "createdAt" },
  "message": "Backup created: ..."
}
```

---

### DELETE /api/system/backup

Deletes a specific backup file.

| | |
|---|---|
| **Auth** | Admin |
| **Rate limit** | backup-delete (5/min) |

**Query params:** `filename` (required)

**Response:** `{ "ok": true, "message": "Backup ... deleted" }`

**Errors:** 400 — `filename` required

---

### POST /api/system/webhook-test

Sends a test webhook to all configured targets (Discord, Telegram, Slack).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | webhook-test (5/min) |

**Request body:** None

**Response:**

```json
{ "ok": true, "targets": ["Discord", "Telegram"], "message": "Test webhook sent to: ..." }
```

**Errors:** 400 — webhooks disabled / no targets configured

---

## Other

### GET /api/health

**Public** — System health check for monitoring. Returns status of database, MT5 bridge, price feed service, SL/TP monitor, memory, uptime, and entity counts.

| | |
|---|---|
| **Auth** | None (Public) |
| **Rate limit** | — |

**Response:**

```json
{
  "status": "healthy" | "degraded",
  "timestamp": "...",
  "checks": {
    "database": { "status": "ok", "latencyMs": number, "logCount": number, "recentErrors": number },
    "mt5Bridge": { "status": "ok"|"error", "latency": number, "detail": "..." },
    "entities": { "status": "ok", "detail": "..." },
    "memory": { "status": "ok", "detail": "..." },
    "uptime": { "status": "ok", "detail": "..." },
    "priceFeedService": { "status": "ok"|"error", "latency": number, "detail": "..." },
    "mt5BridgeMiniService": { "status": "ok"|"error", "latency": number, "detail": "..." },
    "sltpMonitorService": { "status": "ok"|"error", "latency": number, "detail": "..." },
    "summary": { "status": "ok", "detail": "..." }
  }
}
```

Returns HTTP 200 if all critical checks pass, 503 if degraded.

---

### GET /api/sessions

Returns current trading session states (Tokyo, London, New York, Overlap) and scalping window status.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:**

```json
{
  "sessions": [{ "name", "status": "active"|"upcoming"|"closed", "openHour", "closeHour" }],
  "overlap": { "name": "London-New York Overlap", "status": "..." },
  "scalpingWindow": boolean
}
```

---

### GET /api/strategies

Returns all available backtest strategies with their presets and parameters.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:** `{ "strategies": [...] }`

---

### GET /api/symbols

Returns current prices, spreads, sparklines, and day high/low for all supported symbols.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Response:**

```json
{
  "symbols": [{ "symbol", "price", "bid", "ask", "spread", "changePct", "high", "low", "pip", "spark": number[], "updatedAt" }]
}
```

---

### GET /api/notifications

Lists recent notifications (email/webhook dispatch log).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | — |

**Query params:** `limit` (default: 50, max: 500)

**Response:** `{ "notifications": [...] }`