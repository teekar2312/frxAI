// MT5 Bridge Service — HTTP server on port 3050 using Bun.serve.
// Routes all MT5 operations through a pluggable adapter (mock or real-python).
//
// Run:  bun --hot index.ts      (dev)   |   bun index.ts   (prod)
// Port: 3050  ·  CORS: localhost-only  ·  Auth: X-Bridge-Key / Bearer
//   via Caddy: /api/mt5/*?XTransformPort=3050
//
// Adapter selection via MT5_ADAPTER env var:
//   - 'mock' (default)        → simulation, no real MT5 needed
//   - 'real-python'           → calls Python bridge (MetaTrader5 on Windows)

import type { MT5Adapter } from './adapters/types'
import { MockMT5Adapter } from './adapters/mock'
import { RealPythonMT5Adapter } from './adapters/real-python'

const PORT = 3050
const ADAPTER_NAME = process.env.MT5_ADAPTER || 'mock'

function createAdapter(name: string): MT5Adapter {
  if (name === 'real-python') return new RealPythonMT5Adapter()
  if (name === 'mock') return new MockMT5Adapter()
  throw new Error(`Unknown MT5 adapter: ${name}`)
}

const adapter = createAdapter(ADAPTER_NAME)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
]
const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Service-Key',
}

function getCorsHeaders(origin?: string): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return { ...corsHeaders, 'Access-Control-Allow-Origin': origin }
  }
  // No origin match — don't send ACAO header (browser will block)
  return corsHeaders
}

const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || 'frxai-bridge-key-dev-only'

function verifyBridgeAuth(req: Request): boolean {
  // Health endpoint is always public (no auth needed)
  const url = new URL(req.url)
  if (url.pathname === '/health' && req.method === 'GET') return true

  const key = req.headers.get('x-bridge-key') || req.headers.get('authorization')?.replace('Bearer ', '')
  if (!key) return false
  return key === BRIDGE_API_KEY
}

function json(body: any, status = 200, origin?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  })
}

// ─── Router ────────────────────────────────────────────────────────────────────

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method
  const origin = req.headers.get('origin') || undefined

  if (method === 'OPTIONS') {
    const headers = getCorsHeaders(origin)
    return new Response(null, { status: 204, headers })
  }

  if (!verifyBridgeAuth(req)) {
    return json({ error: 'Unauthorized — missing or invalid bridge API key' }, 401, origin)
  }

  try {
    // ── Health ──────────────────────────────────────────────────────────────
    if (path === '/health' && method === 'GET') {
      return json({
        status: 'ok',
        adapter: adapter.name,
        isLive: adapter.isLive,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      }, 200, origin)
    }

    // ── Connect ────────────────────────────────────────────────────────────
    if (path === '/connect' && method === 'POST') {
      const body = await req.json()
      const login = Number(body.login)
      const server = String(body.server || '').trim()
      const password = String(body.password || '')

      if (!login || login <= 0 || !server || server.length > 100 || !password || password.length > 100) {
        return json({ error: 'Invalid connect parameters: login (positive number), server (string), password (string) required' }, 400, origin)
      }
      const info = await adapter.connect({ login, server, password })
      return json({ account: info }, 200, origin)
    }

    if (path.startsWith('/disconnect/') && method === 'POST') {
      const login = Number(path.split('/').pop())
      await adapter.disconnect(login)
      return json({ ok: true }, 200, origin)
    }

    // ── Account ────────────────────────────────────────────────────────────
    if (path.startsWith('/account/') && method === 'GET') {
      const login = Number(path.split('/').pop())
      const info = await adapter.accountInfo(login)
      if (!info) return json({ error: 'Account not connected' }, 404, origin)
      return json({ account: info }, 200, origin)
    }

    // ── Tick ───────────────────────────────────────────────────────────────
    if (path.startsWith('/tick/') && method === 'GET') {
      const symbol = path.split('/').pop()!
      const tick = await adapter.tick(symbol)
      if (!tick) return json({ error: `Unknown symbol: ${symbol}` }, 404, origin)
      return json({ tick }, 200, origin)
    }

    // ── Bars ───────────────────────────────────────────────────────────────
    if (path.startsWith('/bars/') && method === 'GET') {
      const symbol = path.split('/')[2]
      const tf = (url.searchParams.get('tf') || 'M5') as any
      const count = Number(url.searchParams.get('count') || '100')
      const bars = await adapter.bars(symbol, tf, Math.min(Math.max(count, 1), 1000))
      return json({ bars }, 200, origin)
    }

    // ── Positions ──────────────────────────────────────────────────────────
    if (path.startsWith('/positions/') && method === 'GET') {
      const login = Number(path.split('/').pop())
      const positions = await adapter.positions(login)
      return json({ positions }, 200, origin)
    }

    // ── Market order ───────────────────────────────────────────────────────
    if (path === '/order/market' && method === 'POST') {
      const body = await req.json()
      const login = Number(body.login)
      const symbol = String(body.symbol || '').trim()
      const side = String(body.side || '').trim()
      const volume = Number(body.volume)

      if (!login || !['EURUSD','USDJPY','GBPUSD','XAUUSD'].includes(symbol) || !['buy','sell'].includes(side) || !volume || volume <= 0 || volume > 100) {
        return json({ error: 'Invalid order parameters' }, 400, origin)
      }
      const result = await adapter.marketOrder(body)
      return json({ order: result }, 200, origin)
    }

    // ── Close position ─────────────────────────────────────────────────────
    if (path.match(/^\/position\/\d+\/close$/) && method === 'POST') {
      const ticket = Number(path.split('/')[2])
      const result = await adapter.closePosition(ticket)
      return json({ result }, 200, origin)
    }

    // ── Modify position ────────────────────────────────────────────────────
    if (path.match(/^\/position\/\d+\/modify$/) && method === 'POST') {
      const ticket = Number(path.split('/')[2])
      const body = await req.json()
      const result = await adapter.modifyPosition(ticket, body.sl ?? null, body.tp ?? null)
      return json({ result }, 200, origin)
    }

    return json({ error: `Not found: ${method} ${path}` }, 404, origin)
  } catch (e: any) {
    console.error(`[mt5-bridge] ${method} ${path} error:`, e?.message)
    return json({ error: e?.message || 'Internal error' }, 500, origin)
  }
}

// ─── Start server (Bun.serve) ─────────────────────────────────────────────────

async function start() {
  await adapter.init()

  const server = Bun.serve({
    port: PORT,
    fetch(req) {
      return handle(req).catch((e) => {
        console.error(`[mt5-bridge] UNHANDLED error on ${req.method} ${new URL(req.url).pathname}:`, e)
        return json({ error: 'Internal error' }, 500)
      })
    },
    error(e) {
      console.error('[mt5-bridge] server error:', e)
      return new Response('Internal Server Error', { status: 500, headers: corsHeaders })
    },
  })

  console.log(`╔══════════════════════════════════════════════════════════════╗`)
  console.log(`║  MT5 Bridge Service                                          ║`)
  console.log(`║  Port: ${PORT}                                                    ║`)
  console.log(`║  Adapter: ${adapter.name.padEnd(48)} ║`)
  console.log(`║  Live: ${adapter.isLive ? 'YES — real MT5 orders' : 'NO  — simulation mode'}                              ║`)
  console.log(`╚══════════════════════════════════════════════════════════════╝`)

  process.on('uncaughtException', (e) => console.error('[mt5-bridge] uncaughtException:', e))
  process.on('unhandledRejection', (e) => console.error('[mt5-bridge] unhandledRejection:', e))
  process.on('SIGINT', () => { server.stop(); process.exit(0) })
  process.on('SIGTERM', () => { server.stop(); process.exit(0) })
}

start().catch((e) => {
  console.error('Failed to start mt5-bridge:', e)
  process.exit(1)
})
