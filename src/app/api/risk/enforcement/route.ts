import { NextRequest, NextResponse } from 'next/server'
import { getRiskConfig, isDailyLossCircuitBreakerActive, enforceTradeOpen } from '@/lib/risk-enforcement'
import { requireAuth } from '@/lib/auth-server'
import { db, accounts, trades, eq, and } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

/**
 * GET /api/risk/enforcement?accountId=xxx
 *
 * Returns the current risk enforcement configuration + status:
 * - All risk limits (maxPositions, maxLotSize, dailyRiskLimit, etc.)
 * - Current usage (open positions, total lot, daily P&L)
 * - Whether the daily loss circuit breaker is active
 * - Whether new trades are currently allowed
 *
 * Used by the Trading panel to show enforcement status to the user
 * BEFORE they try to open a trade.
 */
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')
    const cfg = await getRiskConfig()

    if (!accountId) {
      return NextResponse.json({ config: cfg })
    }

    const account = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Check circuit breaker
    const breaker = await isDailyLossCircuitBreakerActive(accountId)

    // Simulate a trade open check (0.01 lot, no SL) to see if trades are currently allowed
    const testCheck = await enforceTradeOpen({
      accountId,
      symbol: 'EURUSD',
      side: 'buy',
      lotSize: 0.01,
      stopLoss: null,
    })

    // Count open positions + total lot
    const openTrades = await db.query.trades.findMany({
      where: and(eq(trades.accountId, accountId), eq(trades.status, 'open')),
    })

    return NextResponse.json({
      config: cfg,
      status: {
        openPositions: openTrades.length,
        totalLot: Number(openTrades.reduce((s, t) => s + t.lotSize, 0).toFixed(2)),
        dailyLossCircuitBreakerActive: breaker.active,
        dailyPnlPct: breaker.dailyPnlPct,
        tradesAllowed: testCheck.allowed,
        violations: testCheck.violations,
        context: testCheck.context,
      },
    })
  } catch (e) {
    return apiCatch(e, 'risk', 'GET', req)
  }
}