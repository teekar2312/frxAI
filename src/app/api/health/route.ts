import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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
  const checks: Record<string, { status: 'ok' | 'error'; latency?: number; detail?: string }> = {}
  let allOk = true

  // 1. Database check
  try {
    const dbStart = Date.now()
    await db.$queryRaw`SELECT 1`
    const dbLatency = Date.now() - dbStart
    checks.database = { status: 'ok', latency: dbLatency }
  } catch (e: any) {
    checks.database = { status: 'error', detail: e?.message }
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
  } catch (e: any) {
    checks.mt5Bridge = { status: 'error', detail: e?.message }
    allOk = false
  }

  // 3. Count critical entities (lightweight queries)
  try {
    const [accountCount, openTradeCount, signalCount] = await Promise.all([
      db.account.count(),
      db.trade.count({ where: { status: 'open' } }),
      db.aiSignal.count(),
    ])
    checks.entities = {
      status: 'ok',
      detail: `${accountCount} accounts, ${openTradeCount} open trades, ${signalCount} AI signals`,
    }
  } catch (e: any) {
    checks.entities = { status: 'error', detail: e?.message }
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
  } catch (e: any) {
    checks.priceFeedService = { status: 'error', detail: e?.message || 'unreachable' }
    // Price feed offline is non-critical — app uses synthetic fallback
  }

  // 7. SL/TP monitor service check (port 3004)
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
  } catch (e: any) {
    checks.sltpMonitorService = { status: 'error', detail: e?.message || 'unreachable' }
    // SL/TP monitor offline means manual SL/TP monitoring only
  }

  // Summary of which mini-services are running
  const miniServices = ['priceFeedService', 'sltpMonitorService']
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