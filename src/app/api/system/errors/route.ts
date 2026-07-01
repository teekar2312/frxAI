import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getErrorStats, checkErrorRateSpike } from '@/lib/error-monitor'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/errors
 *
 * Returns error monitoring statistics:
 *   - Total errors in last 24h
 *   - Breakdown by severity (low/medium/high/critical)
 *   - Breakdown by source (api/mt5/ai/risk/system)
 *   - 10 most recent errors
 *   - Error rate spike check (10+ errors in 5 min = spike)
 *
 * Query params:
 *   hours=24 — how many hours back to look
 */
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  try {
    const { searchParams } = new URL(req.url)
    const hours = parseInt(searchParams.get('hours') || '24', 10)

    const [stats, spike] = await Promise.all([
      getErrorStats(hours),
      checkErrorRateSpike(),
    ])

    return NextResponse.json({
      window: `${hours}h`,
      stats,
      spike,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    return apiCatch(e, 'system', 'GET', req)
  }
}