import { NextRequest, NextResponse } from 'next/server'
import { runBacktest } from '@/lib/backtest'
import { STRATEGIES, findStrategy } from '@/lib/strategies'
import { SUPPORTED_SYMBOLS } from '@/lib/types'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// POST /api/backtest/optimize
// Runs backtests across all strategies × symbols to find the best configuration.
// Body: { periodFrom?, periodTo?, initialCapital? }
// Returns: { results: Array<{ strategy, symbol, ...metrics }>, best: { ... } }
export async function POST(req: NextRequest) {
  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.backtestOptimize)
  if (limited) return limited

  try {
    const body = await req.json().catch(() => ({}))
    const periodFrom = body.periodFrom ? new Date(body.periodFrom) : new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const periodTo = body.periodTo ? new Date(body.periodTo) : new Date()
    const initialCapital = Number(body.initialCapital ?? 10000)

    if (isNaN(periodFrom.getTime()) || isNaN(periodTo.getTime()) || periodFrom >= periodTo) {
      return NextResponse.json({ error: 'Invalid periodFrom/periodTo' }, { status: 400 })
    }

    const results: Array<{
      strategyId: string
      strategyName: string
      symbol: string
      category: string
      difficulty: string
      timeframe: string
      totalTrades: number
      winRate: number
      profitFactor: number
      netProfit: number
      maxDrawdown: number
      sharpeRatio: number
      finalCapital: number
      score: number
    }> = []

    // Run all strategy × symbol combinations (7 strategies × 4 symbols = 28 backtests)
    for (const strat of STRATEGIES) {
      for (const symbol of SUPPORTED_SYMBOLS) {
        try {
          const bt = await runBacktest({
            name: `OPT ${strat.id} ${symbol}`,
            symbol,
            timeframe: strat.timeframe,
            strategy: strat.id,
            strategyCategory: strat.category,
            strategyEngine: strat.engine,
            periodFrom,
            periodTo,
            initialCapital,
            riskPerTradePct: strat.preset.riskPerTradePct,
            stopLossPips: strat.preset.stopLossPips,
            riskReward: strat.preset.riskReward,
            emaFast: strat.preset.emaFast,
            emaSlow: strat.preset.emaSlow,
            rsiPeriod: strat.preset.rsiPeriod,
            rsiOverbought: strat.preset.rsiOverbought,
            rsiOversold: strat.preset.rsiOversold,
          })

          // Score: weighted combination of profit factor, win rate, net profit, and inverse drawdown
          // Higher score = better risk-adjusted performance
          const pf = bt.profitFactor
          const wr = bt.winRate
          const np = bt.netProfit
          const dd = Math.max(0.1, bt.maxDrawdown) // avoid div by zero
          const sharpe = bt.sharpeRatio
          const score = Number((
            (pf * 25) +           // profit factor weight
            (wr * 0.3) +          // win rate weight
            (np / initialCapital * 100) + // return %
            (sharpe * 5) +        // sharpe weight
            (dd < 10 ? 10 : 0)    // bonus for low drawdown
          ).toFixed(2))

          results.push({
            strategyId: strat.id,
            strategyName: strat.name,
            symbol,
            category: strat.category,
            difficulty: strat.difficulty,
            timeframe: strat.timeframe,
            totalTrades: bt.totalTrades,
            winRate: bt.winRate,
            profitFactor: bt.profitFactor,
            netProfit: bt.netProfit,
            maxDrawdown: bt.maxDrawdown,
            sharpeRatio: bt.sharpeRatio,
            finalCapital: bt.finalCapital,
            score,
          })
        } catch {
          // Skip failed combinations
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    const best = results[0] || null
    const worst = results[results.length - 1] || null

    // Summary stats
    const profitable = results.filter((r) => r.netProfit > 0)
    const avgWinRate = results.length > 0
      ? Number((results.reduce((s, r) => s + r.winRate, 0) / results.length).toFixed(2))
      : 0
    const avgPF = results.length > 0
      ? Number((results.reduce((s, r) => s + r.profitFactor, 0) / results.length).toFixed(2))
      : 0
    const totalNet = results.reduce((s, r) => s + r.netProfit, 0)

    return NextResponse.json({
      results,
      best,
      worst,
      summary: {
        totalConfigs: results.length,
        profitableCount: profitable.length,
        avgWinRate,
        avgProfitFactor: avgPF,
        totalNetProfit: Number(totalNet.toFixed(2)),
      },
    })
  } catch (e) {
    return apiCatch(e, 'backtest', 'POST', req)
  }
}