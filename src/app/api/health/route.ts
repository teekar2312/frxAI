import { NextResponse } from 'next/server'
import { db, logs, accounts, trades, aiSignals, countAll, eq, gte, sql } from '@/lib/db'
import { bridgeHealth } from '@/lib/mt5-client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 *
 * System health check endpoint for monitoring (uptime checks, CI/CD, etc.).
 * Returns the status of all critical system components.
 * Does NOT require authentication (public endpoint for monitoring tools).
 */
export async function GET() {
  const checks: Record<string, unknown> = {}
  let allOk = true

  // 1. Database check + latency + error count + log size
  try {
    const dbStart = Date.now()
    await db.execute(sql`SELECT 1`)
    const dbLatencyMs = Date.now() - dbStart

    // Recent error count (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const [recentErrorsRow] = await db.select({ count: countAll }).from(logs).where(and(eq(logs.level, 'error'), gte(logs.createdAt, oneHourAgo)))
    const recentErrors = recentErrorsRow?.count ?? 0

    // Log table size
    const [logCountRow] = await db.select({ count: countAll }).from(logs)
    const logCount = logCountRow?.count ?? 0

    checks.database = {
      status: 'ok',
      latencyMs,
      logCount,
      recentErrors,
    }
  } catch (e: unknown) {
    const err = e as Error
    checks.database = { status: 'error', detail: err?.message }
    allOk = false
  }

  // 2. MT5 bridge check
  try {
    const bridgeStart = Date.now()
    const health = await bridgeHealth()
    const bridgeLatency = Date.now() - bridgeStart
    checks.mt5Bridge = {
      status: health.ok ? 'ok' : 'error',
      latency: bridgeLatency,
      detail: health.ok
        ? `adapter=${health.adapter}, isLive=${health.isLive}`
        : 'offline',
    }
    // Bridge offline is a warning, not a hard failure (app degrades to synthetic)
    if (!health.ok) allOk = false
  } catch (e: unknown) {
    const err = e as Error
    checks.mt5Bridge = { status: 'error', detail: err?.message }
    allOk = false
  }

  // 3. Count critical entities (lightweight queries)
  try {
    const [acctRow] = await db.select({ count: countAll }).from(accounts)
    const [tradeRow] = await db.select({ count: countAll }).from(trades).where(eq(trades.status, 'open'))
    const [signalRow] = await db.select({ count: countAll }).from(aiSignals)
    const accountCount = acctRow?.count ?? 0
    const openTradeCount = tradeRow?.count ?? 0
    const signalCount = signalRow?.count ?? 0

    checks.entities = {
      status: 'ok',
      detail: `${accountCount} accounts, ${openTradeCount} open trades, ${signalCount} AI signals`,
    }
  } catch (e: unknown) {
    const err = e as Error
    checks.entities = { status: 'error', detail: err?.message }
    allOk = false
  }

  // 4. Memory usage (Node.js process)
  const memUsage = process.memoryUsage()
  checks.memory = {
    status: 'ok',
    detail: `RSS ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB, Heap ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}/${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`,
  }

  // 5. Uptime
  checks.uptime = {
    status: 'ok',
    detail: `${(process.uptime() / 60).toFixed(1)} minutes`,
  }

  // 6. Price feed service check (port 3003)
  try {
    const pfStart = Date.now()
    const pfRes = await fetch('http://localhost:3003/health', { signal: AbortSignal.timeout(3000) })
    const pfLatency = Date.now() - pfStart
    checks.priceFeedService = {
      status: pfRes.ok ? 'ok' : 'error',
      latency: pfLatency,
      detail: pfRes.ok ? 'healthy' : `HTTP ${pfRes.status}`,
    }
    if (!pfRes.ok) allOk = false
  } catch (e: unknown) {
    const err = e as Error
    checks.priceFeedService = { status: 'error', detail: err?.message || 'unreachable' }
    // Price feed offline is non-critical — app uses synthetic fallback
  }

  // 7. MT5-bridge mini-service check (port 3050)
  try {
    const bridgeMiniStart = Date.now()
    const bridgeMiniRes = await fetch('http://localhost:3050/health', { signal: AbortSignal.timeout(3000) })
    const bridgeMiniLatency = Date.now() - bridgeMiniStart
    checks.mt5BridgeMiniService = {
      status: bridgeMiniRes.ok ? 'ok' : 'error',
      latency: bridgeMiniLatency,
      detail: bridgeMiniRes.ok ? 'healthy' : `HTTP ${bridgeMiniRes.status}`,
    }
    if (!bridgeMiniRes.ok) allOk = false
  } catch (e: unknown) {
    const err = e as Error
    checks.mt5BridgeMiniService = { status: 'error', detail: err?.message || 'unreachable' }
    // MT5-bridge mini-service offline means bridge commands go through HTTP fallback
  }

  // 8. SL/TP monitor service check (port 3004)
  try {
    const sltpStart = Date.now()
    const sltpRes = await fetch('http://localhost:3004/health', { signal: AbortSignal.timeout(3000) })
    const sltpLatency = Date.now() - sltpStart
    checks.sltpMonitorService = {
      status: sltpRes.ok ? 'ok' : 'error',
      latency: sltpLatency,
      detail: sltpRes.ok ? 'healthy' : `HTTP ${sltpRes.status}`,
    }
    if (!sltpRes.ok) allOk = false
  } catch (e: unknown) {
    const err = e as Error
    checks.sltpMonitorService = { status: 'error', detail: err?.message || 'unreachable' }
    // SL/TP monitor offline means manual SL/TP monitoring only
  }

  // Summary of which mini-services are running
  const miniServices = ['priceFeedService', 'mt5BridgeMiniService', 'sltpMonitorService']
  const miniServicesRunning = miniServices.filter(k => checks[k]?.status === 'ok').length
  checks.summary = {
    status: 'ok' as const,
    detail: `Main: ok | Mini-services: ${miniServicesRunning}/${miniServices.length} running`,
  }

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  )
}