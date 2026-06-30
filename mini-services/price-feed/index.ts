// Price-feed WebSocket mini-service for FinexFX AI Trading dashboard.
// Self-contained (no imports from src/lib) — replicates the deterministic
// market simulation formula from `src/lib/market.ts` so live ticks match
// the Next.js API open/close prices exactly.
//
// Run:  bun --hot index.ts      (dev)   |   bun index.ts   (prod)
// Port: 3003  ·  path: '/'  ·  cors: *
// Caddy forwards browser `io('/?XTransformPort=3003')` to this port.

import { createServer, Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'

// ──────────────────────────────────────────────────────────────────────────────
// 1. Market simulation engine (MUST mirror src/lib/market.ts priceAt exactly)
// ──────────────────────────────────────────────────────────────────────────────

const SYMBOL_BASE: Record<string, { price: number; pip: number; digits: number }> = {
  EURUSD: { price: 1.085, pip: 0.0001, digits: 5 },
  USDJPY: { price: 156.4, pip: 0.01, digits: 3 },
  GBPUSD: { price: 1.272, pip: 0.0001, digits: 5 },
  XAUUSD: { price: 2335.5, pip: 0.1, digits: 2 },
}

const SYMBOLS = Object.keys(SYMBOL_BASE)

// Deterministic pseudo-random in [-1,1] from a seed
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/** Simulated mid price for a symbol at time `t` (ms epoch). */
function priceAt(symbol: string, t: number): number {
  const base = SYMBOL_BASE[symbol]
  if (!base) return 0
  const sec = t / 1000
  const wave =
    Math.sin(sec / 90) * (base.pip * 6) +
    Math.sin(sec / 37) * (base.pip * 3) +
    Math.sin(sec / 13) * (base.pip * 1.5)
  const trend = Math.sin(sec / 3600) * (base.pip * 25)
  const tick = noise(t / 1000) * (base.pip * 1.2)
  const p = base.price + trend + wave + tick
  return Number(p.toFixed(base.digits))
}

interface BidAsk {
  bid: number
  ask: number
  spread: number
}

function bidAsk(symbol: string, t: number): BidAsk {
  const mid = priceAt(symbol, t)
  const base = SYMBOL_BASE[symbol]
  const spreadPips = symbol === 'XAUUSD' ? 2 : 0.4
  const spread = spreadPips * base.pip
  const bid = mid - spread / 2
  const ask = mid + spread / 2
  return {
    bid: Number(bid.toFixed(base.digits)),
    ask: Number(ask.toFixed(base.digits)),
    spread: Number(spread.toFixed(base.digits)),
  }
}

/** 24h change % vs 24h-ago price. */
function changePct24h(symbol: string, t: number): number {
  const now = priceAt(symbol, t)
  const past = priceAt(symbol, t - 24 * 3600 * 1000)
  return Number((((now - past) / past) * 100).toFixed(2))
}

/** 40-point sparkline sampled at 5s intervals going back from `t`. */
function sparkline(symbol: string, points = 40, t: number): number[] {
  const out: number[] = []
  const step = 5000 // 5s between points
  for (let i = points - 1; i >= 0; i--) {
    out.push(priceAt(symbol, t - i * step))
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Quote / payload types
// ──────────────────────────────────────────────────────────────────────────────

interface SymbolQuote {
  symbol: string
  price: number
  bid: number
  ask: number
  spread: number
  changePct: number
  spark: number[]
  updatedAt: number
}

interface TickPayload {
  symbols: SymbolQuote[]
  ts: number
}

function buildSnapshot(t: number): SymbolQuote[] {
  return SYMBOLS.map((symbol) => {
    const { bid, ask, spread } = bidAsk(symbol, t)
    return {
      symbol,
      price: priceAt(symbol, t),
      bid,
      ask,
      spread,
      changePct: changePct24h(symbol, t),
      spark: sparkline(symbol, 40, t),
      updatedAt: t,
    }
  })
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Trading sessions (UTC). London 7-16, NY 12-21, Overlap 12-16.
//    scalpingWindow = London + Overlap (7-16 UTC).
// ──────────────────────────────────────────────────────────────────────────────

interface SessionState {
  name: string
  openUtc: number
  closeUtc: number
  active: boolean
  progress: number
}

function sessionActive(open: number, close: number, h: number): boolean {
  if (open < close) return h >= open && h < close
  return h >= open || h < close
}

function sessionProgress(open: number, close: number, h: number): number {
  if (open < close) {
    if (h >= open && h < close) return Number(((h - open) / (close - open)).toFixed(3))
    return 0
  }
  if (h >= open) return Number(((h - open) / (24 - open + close)).toFixed(3))
  if (h < close) return Number(((24 - open + h) / (24 - open + close)).toFixed(3))
  return 0
}

function buildSessions(now: Date = new Date()): SessionState[] {
  const h = now.getUTCHours() + now.getUTCMinutes() / 60
  const defs = [
    { name: 'London', openUtc: 7, closeUtc: 16 },
    { name: 'New York', openUtc: 12, closeUtc: 21 },
    { name: 'Overlap', openUtc: 12, closeUtc: 16 },
    { name: 'Tokyo', openUtc: 0, closeUtc: 9 },
    { name: 'Sydney', openUtc: 21, closeUtc: 6 },
  ]
  return defs.map((s) => ({
    name: s.name,
    openUtc: s.openUtc,
    closeUtc: s.closeUtc,
    active: sessionActive(s.openUtc, s.closeUtc, h),
    progress: sessionProgress(s.openUtc, s.closeUtc, h),
  }))
}

function isScalpingWindow(now: Date = new Date()): boolean {
  // London + Overlap = 7-16 UTC
  const h = now.getUTCHours()
  return h >= 7 && h < 16
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. Optional simulated trade / ai-signal / news events
// ──────────────────────────────────────────────────────────────────────────────

interface TradeEvent {
  id: string
  accountId: string
  symbol: string
  side: 'buy' | 'sell'
  lotSize: number
  price: number
  source: 'manual' | 'auto' | 'ai'
  status: 'open' | 'closed'
  pnl: number
  pips: number
  ts: number
}

interface AiSignalEvent {
  id: string
  symbol: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number
  reason: string
  ts: number
}

interface NewsEvent {
  id: string
  source: string
  title: string
  summary: string
  category: string
  impact: 'low' | 'medium' | 'high'
  sentiment: 'bullish' | 'bearish' | 'neutral'
  symbols: string[]
  ts: number
}

const rid = () => Math.random().toString(36).slice(2, 11)

const SAMPLE_AI_REASONS = [
  'EMA(9) crossed above EMA(21) on M5; RSI(14) exits oversold.',
  'Bearish engulfing at supply zone; volume tick rising.',
  'MACD histogram flip; momentum aligned with H1 trend.',
  'Price rejected at VWAP; scalping window active.',
  'Bollinger squeeze breakout confirmed by ATR expansion.',
  'Parabolic SAR flip + Supertrend green; high-probability long.',
]

const SAMPLE_NEWS = [
  { source: 'Reuters', title: 'ECB signals data-dependent stance on rates', category: 'central_bank', impact: 'high', sentiment: 'neutral' },
  { source: 'Bloomberg', title: 'US CPI prints in line with forecasts', category: 'cpi', impact: 'high', sentiment: 'bearish' },
  { source: 'FXStreet', title: 'Gold steadies near $2,335 as yields ease', category: 'commodity', impact: 'medium', sentiment: 'bullish' },
  { source: 'Dow Jones', title: 'BoE hawkish hold boosts GBP crosses', category: 'central_bank', impact: 'high', sentiment: 'bullish' },
  { source: 'Reuters', title: 'Tokyo CPI cools; JPY softens vs majors', category: 'cpi', impact: 'medium', sentiment: 'bearish' },
  { source: 'Bloomberg', title: 'Risk appetite firms as equities rally', category: 'sentiment', impact: 'low', sentiment: 'bullish' },
]

function randomTrade(t: number): TradeEvent {
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell'
  const sources: Array<'manual' | 'auto' | 'ai'> = ['manual', 'auto', 'ai']
  const source = sources[Math.floor(Math.random() * sources.length)]
  const status: 'open' | 'closed' = Math.random() > 0.5 ? 'open' : 'closed'
  const lot = Number((0.01 + Math.random() * 0.99).toFixed(2))
  const price = priceAt(symbol, t)
  const pips = Number(((Math.random() - 0.5) * 30).toFixed(1))
  const pnl = Number((pips * lot * 10).toFixed(2))
  return {
    id: rid(),
    accountId: 'demo-finex',
    symbol,
    side,
    lotSize: lot,
    price,
    source,
    status,
    pnl,
    pips,
    ts: t,
  }
}

function randomAiSignal(t: number): AiSignalEvent {
  const symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  const actions: Array<'buy' | 'sell' | 'hold'> = ['buy', 'sell', 'hold']
  const action = actions[Math.floor(Math.random() * actions.length)]
  const confidence = Number((0.55 + Math.random() * 0.4).toFixed(2))
  return {
    id: rid(),
    symbol,
    action,
    confidence,
    reason: SAMPLE_AI_REASONS[Math.floor(Math.random() * SAMPLE_AI_REASONS.length)],
    ts: t,
  }
}

function randomNews(t: number): NewsEvent {
  const n = SAMPLE_NEWS[Math.floor(Math.random() * SAMPLE_NEWS.length)]
  return {
    id: rid(),
    source: n.source,
    title: n.title,
    summary: n.title + ' Traders digest implications for the next session.',
    category: n.category,
    impact: n.impact as NewsEvent['impact'],
    sentiment: n.sentiment as NewsEvent['sentiment'],
    symbols: [SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]],
    ts: t,
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. HTTP + socket.io server
// ──────────────────────────────────────────────────────────────────────────────

const PORT = 3003
const httpServer: HttpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path — Caddy forwards /?XTransformPort=3003 to this port.
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const startedAt = Date.now()
let connectionCount = 0

io.on('connection', (socket: Socket) => {
  connectionCount++
  console.log(`[price-feed] client connected: ${socket.id} (total=${connectionCount})`)

  // Welcome handshake with current snapshot.
  const now = Date.now()
  socket.emit('welcome', {
    connected: true,
    symbols: buildSnapshot(now),
    ts: now,
  })

  // subscribe: simple ack (frontend may extend later).
  socket.on('subscribe', (payload: unknown, ack?: (res: unknown) => void) => {
    console.log(`[price-feed] subscribe from ${socket.id}:`, payload)
    if (typeof ack === 'function') ack({ ok: true, subscribed: true, ts: Date.now() })
  })

  // alert-check: echo back; the Next.js side handles alert persistence.
  socket.on('alert-check', (payload: { symbol?: string; price?: number; condition?: string }, ack?: (res: unknown) => void) => {
    console.log(`[price-feed] alert-check from ${socket.id}:`, payload)
    const echo = {
      ok: true,
      received: payload,
      currentPrice: payload?.symbol ? priceAt(payload.symbol, Date.now()) : null,
      ts: Date.now(),
    }
    if (typeof ack === 'function') ack(echo)
    else socket.emit('alert-check', echo)
  })

  socket.on('disconnect', (reason: string) => {
    connectionCount = Math.max(0, connectionCount - 1)
    console.log(`[price-feed] client disconnected: ${socket.id} reason=${reason} (total=${connectionCount})`)
  })

  socket.on('error', (err: Error) => {
    console.error(`[price-feed] socket error (${socket.id}):`, err)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// 6. Periodic emitters
// ──────────────────────────────────────────────────────────────────────────────

// Tick broadcast every 1000ms.
const tickTimer = setInterval(() => {
  const t = Date.now()
  const payload: TickPayload = {
    symbols: buildSnapshot(t),
    ts: t,
  }
  io.emit('tick', payload)
}, 1000)

// System status every 15 seconds.
const statusTimer = setInterval(() => {
  const now = new Date()
  io.emit('system-status', {
    sessions: buildSessions(now),
    scalpingWindow: isScalpingWindow(now),
    uptime: Date.now() - startedAt,
    connectedClients: connectionCount,
    ts: now.getTime(),
  })
}, 15000)

// Simulated trade events every ~25s.
let tradeTick = 0
const tradeTimer = setInterval(() => {
  tradeTick++
  if (tradeTick % 1 === 0) {
    io.emit('trade', randomTrade(Date.now()))
  }
}, 25000)

// AI signals every ~40s.
const aiTimer = setInterval(() => {
  io.emit('ai-signal', randomAiSignal(Date.now()))
}, 40000)

// News every ~60s.
const newsTimer = setInterval(() => {
  io.emit('news', randomNews(Date.now()))
}, 60000)

// ──────────────────────────────────────────────────────────────────────────────
// 7. Boot + graceful shutdown
// ──────────────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log('Price-feed WS running on port 3003')
})

function shutdown(signal: string) {
  console.log(`[price-feed] received ${signal}, shutting down...`)
  clearInterval(tickTimer)
  clearInterval(statusTimer)
  clearInterval(tradeTimer)
  clearInterval(aiTimer)
  clearInterval(newsTimer)
  io.close(() => {
    httpServer.close(() => {
      console.log('[price-feed] closed')
      process.exit(0)
    })
  })
  // Hard exit fallback if graceful close hangs.
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export { priceAt, bidAsk, changePct24h, sparkline, buildSnapshot }
