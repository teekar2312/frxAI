// MT5 Bridge Client — typed client for the mt5-bridge mini-service.
// ALL calls gracefully degrade to null/undefined if the bridge is offline,
// so the dashboard never breaks when the bridge is down.
//
// The bridge runs at http://localhost:3050 internally. From the browser,
// requests go through Caddy with ?XTransformPort=3050. From server-side
// (API routes), we call localhost:3050 directly.

import 'server-only'

const BRIDGE_URL = process.env.MT5_BRIDGE_URL || 'http://localhost:3050'
const REQUEST_TIMEOUT_MS = 4000
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || 'frxai-bridge-key-dev-only'

export interface MT5AccountInfo {
  login: number
  server: string
  currency: string
  leverage: number
  balance: number
  equity: number
  margin: number
  freeMargin: number
  marginLevel: number
  name: string
  company: string
  connectedAt: string
}

export interface MT5Tick {
  symbol: string
  bid: number
  ask: number
  spread: number
  time: string
}

export interface MT5Bar {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MT5Position {
  ticket: number
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  priceOpen: number
  priceCurrent: number
  sl: number | null
  tp: number | null
  profit: number
  swap: number
  commission: number
  time: string
  comment: string
}

export interface MT5OrderResult {
  ticket: number
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  price: number
  sl: number | null
  tp: number | null
  comment: string
  retcode: number
  retcodeExternal: string
}

export type MT5Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1'

let _healthCache: { ok: boolean; adapter: string; isLive: boolean; checkedAt: number } | null = null
const HEALTH_CACHE_MS = 5000

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      headers: {
        'X-Bridge-Key': BRIDGE_API_KEY,
        ...(init.headers as Record<string, string> || {}),
      },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Check if the MT5 bridge is online. Cached for 5 seconds to avoid
 * hammering /health on every API call.
 */
export async function bridgeHealth(): Promise<{ ok: boolean; adapter: string; isLive: boolean }> {
  const now = Date.now()
  if (_healthCache && now - _healthCache.checkedAt < HEALTH_CACHE_MS) {
    return _healthCache
  }
  try {
    const res = await fetchWithTimeout(`${BRIDGE_URL}/health`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    _healthCache = {
      ok: data.status === 'ok',
      adapter: data.adapter || 'unknown',
      isLive: !!data.isLive,
      checkedAt: now,
    }
    return _healthCache
  } catch {
    _healthCache = { ok: false, adapter: 'offline', isLive: false, checkedAt: now }
    return _healthCache
  }
}

/**
 * Connect to MT5 with credentials. Returns account info on success.
 * Throws on failure (caller should catch and show user-friendly error).
 */
export async function connectMT5(params: {
  login: number
  server: string
  password: string
}): Promise<MT5AccountInfo> {
  const res = await fetchWithTimeout(`${BRIDGE_URL}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }, 8000)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Connect failed: HTTP ${res.status}`)
  return data.account
}

export async function disconnectMT5(login: number): Promise<void> {
  try {
    await fetchWithTimeout(`${BRIDGE_URL}/disconnect/${login}`, { method: 'POST' })
  } catch (e) {
    console.error('disconnectMT5 failed (non-fatal):', e)
  }
}

/**
 * Get account info from the bridge. Returns null if bridge offline
 * or account not connected.
 */
export async function getAccountInfo(login: number): Promise<MT5AccountInfo | null> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_URL}/account/${login}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.account || null
  } catch {
    return null
  }
}

/**
 * Get current tick (bid/ask) for a symbol. Returns null if bridge offline.
 * IMPORTANT: callers should fall back to the local `bidAsk()` from `@/lib/market`
 * if this returns null.
 */
export async function getTick(symbol: string): Promise<MT5Tick | null> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_URL}/tick/${symbol}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.tick || null
  } catch {
    return null
  }
}

/**
 * Get historical OHLCV bars. Returns empty array if bridge offline.
 */
export async function getBars(symbol: string, timeframe: MT5Timeframe = 'M5', count = 100): Promise<MT5Bar[]> {
  try {
    const res = await fetchWithTimeout(
      `${BRIDGE_URL}/bars/${symbol}?tf=${timeframe}&count=${count}`,
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.bars || []
  } catch {
    return []
  }
}

/**
 * Get all open positions for a connected account. Returns empty array on failure.
 */
export async function getPositions(login: number): Promise<MT5Position[]> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_URL}/positions/${login}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.positions || []
  } catch {
    return []
  }
}

/**
 * Open a market order via the bridge. Returns the order result (with ticket).
 * Throws on failure — caller MUST catch and decide fallback behavior.
 *
 * On success, store the returned `ticket` in the Trade record's `mt5Ticket` field
 * so future close/modify operations can target the bridge position.
 */
export async function marketOrder(params: {
  login: number
  symbol: string
  side: 'buy' | 'sell'
  volume: number
  sl?: number | null
  tp?: number | null
  comment?: string
}): Promise<MT5OrderResult> {
  const res = await fetchWithTimeout(`${BRIDGE_URL}/order/market`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }, 8000)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Market order failed: HTTP ${res.status}`)
  return data.order
}

/**
 * Close a position by ticket. Returns the close price + realized profit.
 * Throws on failure.
 */
export async function closePosition(ticket: number): Promise<{
  ticket: number
  price: number
  profit: number
  retcode: number
}> {
  const res = await fetchWithTimeout(`${BRIDGE_URL}/position/${ticket}/close`, {
    method: 'POST',
  }, 8000)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Close failed: HTTP ${res.status}`)
  return data.result
}

/**
 * Modify SL/TP of an open position. Returns new SL/TP values.
 * Throws on failure.
 */
export async function modifyPosition(
  ticket: number,
  sl: number | null,
  tp: number | null,
): Promise<{ ticket: number; sl: number | null; tp: number | null; retcode: number }> {
  const res = await fetchWithTimeout(`${BRIDGE_URL}/position/${ticket}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sl, tp }),
  }, 8000)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Modify failed: HTTP ${res.status}`)
  return data.result
}

/**
 * Get real-time prices for all supported symbols. Returns a map of symbol → tick.
 * Falls back to empty object if bridge offline (caller should use local bidAsk).
 */
export async function getAllTicks(symbols: string[]): Promise<Record<string, MT5Tick>> {
  const out: Record<string, MT5Tick> = {}
  await Promise.all(
    symbols.map(async (sym) => {
      const tick = await getTick(sym)
      if (tick) out[sym] = tick
    }),
  )
  return out
}
