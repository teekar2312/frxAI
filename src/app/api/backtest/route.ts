import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { runBacktest } from '@/lib/backtest'
import { findStrategy } from '@/lib/strategies'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || undefined
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const where: any = {}
    if (symbol) where.symbol = symbol

    const backtests = await db.backtest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
    })
    return NextResponse.json({ backtests })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch backtests' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
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
    } = body || {}

    if (!name || !symbol || !strategy) {
      return NextResponse.json(
        { error: 'name, symbol, strategy are required' },
        { status: 400 },
      )
    }

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

    return NextResponse.json({ backtest })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Backtest failed' }, { status: 500 })
  }
}
