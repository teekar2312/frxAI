import { NextRequest, NextResponse } from 'next/server'
import { db, backtests as backtestsTable, eq, desc } from '@/lib/db'
import { runBacktest } from '@/lib/backtest'
import { findStrategy } from '@/lib/strategies'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBody, backtestCreateSchema } from '@/lib/validations'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || undefined
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const rows = await db.select().from(backtestsTable)
      .where(symbol ? eq(backtestsTable.symbol, symbol) : undefined)
      .orderBy(desc(backtestsTable.createdAt))
      .limit(Math.max(1, Math.min(200, limit)))
    return NextResponse.json({ backtests: rows })
  } catch (e) {
    return apiCatch(e, 'backtest', 'GET', req)
  }
}

export async function POST(req: NextRequest) {
  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.backtestRun)
  if (limited) return limited

  try {
    const body = await req.json().catch(() => ({}))

    // Zod validation
    const validated = validateBody(backtestCreateSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }

    const {
      name,
      symbol,
      timeframe,
      strategy,
      periodFrom,
      periodTo,
      initialCapital,
      riskPerTradePct,
      stopLossPips,
      riskReward,
    } = validated.data

    // Look up the strategy preset to get EMA periods + default risk params.
    const strat = findStrategy(strategy)

    const from = periodFrom ? new Date(periodFrom) : new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const to = periodTo ? new Date(periodTo) : new Date()
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ error: 'Invalid periodFrom/periodTo' }, { status: 400 })
    }

    const backtest = await runBacktest({
      name: String(name),
      symbol: String(symbol),
      timeframe: String(timeframe || strat?.timeframe || 'M5'),
      strategy: String(strategy),
      strategyCategory: strat?.category,
      strategyEngine: strat?.engine,
      periodFrom: from,
      periodTo: to,
      initialCapital: Number(initialCapital ?? 10000),
      riskPerTradePct: Number(riskPerTradePct ?? strat?.preset.riskPerTradePct ?? 0.75),
      stopLossPips: Number(stopLossPips ?? strat?.preset.stopLossPips ?? 10),
      riskReward: Number(riskReward ?? strat?.preset.riskReward ?? 1.5),
      emaFast: strat?.preset.emaFast,
      emaSlow: strat?.preset.emaSlow,
      rsiPeriod: strat?.preset.rsiPeriod,
      rsiOverbought: strat?.preset.rsiOverbought,
      rsiOversold: strat?.preset.rsiOversold,
    })

    await audit({
      action: 'backtest.run',
      resource: backtest.id || name,
      resourceType: 'backtest',
      details: { symbol, strategy, timeframe, totalTrades: backtest.totalTrades, netProfit: backtest.netProfit },
    })

    return NextResponse.json({ backtest })
  } catch (e) {
    return apiCatch(e, 'backtest', 'POST', req)
  }
}