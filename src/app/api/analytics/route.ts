import { NextRequest, NextResponse } from 'next/server'
import { db, trades, accounts, eq, and, gte, lte, asc } from '@/lib/db'
import { getSessions } from '@/lib/sessions'
import type { TradeAnalytics } from '@/lib/types'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// GET /api/analytics?accountId=&days=30
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId') || undefined
    const days = parseInt(searchParams.get('days') || '30')

    const from = new Date()
    from.setUTCDate(from.getUTCDate() - days)

    const trades = await db.query.trades.findMany({
      where: accountId
        ? and(eq(trades.status, 'closed'), gte(trades.closeTime, from), eq(trades.accountId, accountId))
        : and(eq(trades.status, 'closed'), gte(trades.closeTime, from)),
      orderBy: asc(trades.closeTime),
    })

    const totalClosed = trades.length
    const wins = trades.filter((t) => t.pnl > 0).length
    const losses = trades.filter((t) => t.pnl < 0).length
    const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0))
    const netProfit = trades.reduce((s, t) => s + t.pnl, 0)
    const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0
    const avgWin = wins > 0 ? grossProfit / wins : 0
    const avgLoss = losses > 0 ? grossLoss / losses : 0
    const pnlValues = trades.map((t) => t.pnl)
    const bestTrade = pnlValues.length ? Math.max(...pnlValues) : 0
    const worstTrade = pnlValues.length ? Math.min(...pnlValues) : 0

    // avg hold time
    const holdTimes = trades
      .filter((t) => t.closeTime)
      .map((t) => (new Date(t.closeTime!).getTime() - new Date(t.openTime).getTime()) / 60000)
    const avgHoldMinutes = holdTimes.length ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0

    // by pair
    const pairMap = new Map<string, { trades: number; wins: number; netPnl: number }>()
    for (const t of trades) {
      const e = pairMap.get(t.symbol) || { trades: 0, wins: 0, netPnl: 0 }
      e.trades++
      if (t.pnl > 0) e.wins++
      e.netPnl += t.pnl
      pairMap.set(t.symbol, e)
    }
    const byPair = Array.from(pairMap.entries()).map(([symbol, v]) => ({
      symbol,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      netPnl: Number(v.netPnl.toFixed(2)),
    })).sort((a, b) => b.netPnl - a.netPnl)

    // by source
    const sourceMap = new Map<string, { trades: number; wins: number; netPnl: number }>()
    for (const t of trades) {
      const e = sourceMap.get(t.source) || { trades: 0, wins: 0, netPnl: 0 }
      e.trades++
      if (t.pnl > 0) e.wins++
      e.netPnl += t.pnl
      sourceMap.set(t.source, e)
    }
    const bySource = Array.from(sourceMap.entries()).map(([source, v]) => ({
      source,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      netPnl: Number(v.netPnl.toFixed(2)),
    }))

    // by session (London 7-16, NY 12-21, Overlap 12-16, Tokyo 0-9, Sydney 21-6, Off)
    const sessionMap = new Map<string, { trades: number; wins: number; netPnl: number }>()
    for (const t of trades) {
      const h = new Date(t.openTime).getUTCHours()
      let session = 'Off-Session'
      if (h >= 12 && h < 16) session = 'Overlap'
      else if (h >= 7 && h < 16) session = 'London'
      else if (h >= 12 && h < 21) session = 'New York'
      else if (h >= 0 && h < 9) session = 'Tokyo'
      else if (h >= 21 || h < 6) session = 'Sydney'
      const e = sessionMap.get(session) || { trades: 0, wins: 0, netPnl: 0 }
      e.trades++
      if (t.pnl > 0) e.wins++
      e.netPnl += t.pnl
      sessionMap.set(session, e)
    }
    const sessionOrder = ['Overlap', 'London', 'New York', 'Tokyo', 'Sydney', 'Off-Session']
    const bySession = sessionOrder
      .filter((s) => sessionMap.has(s))
      .map((session) => {
        const v = sessionMap.get(session)!
        return {
          session,
          trades: v.trades,
          winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
          netPnl: Number(v.netPnl.toFixed(2)),
        }
      })

    // by day (last N days)
    const byDay: { day: string; trades: number; netPnl: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - i)
      const dayStr = d.toISOString().slice(0, 10)
      const dayTrades = trades.filter((t) => t.closeTime && new Date(t.closeTime).toISOString().slice(0, 10) === dayStr)
      byDay.push({
        day: dayStr,
        trades: dayTrades.length,
        netPnl: Number(dayTrades.reduce((s, t) => s + t.pnl, 0).toFixed(2)),
      })
    }

    // equity curve (cumulative)
    let running = 0
    const equityCurve = trades.map((t) => {
      running += t.pnl
      return { t: new Date(t.closeTime!).toISOString(), equity: Number(running.toFixed(2)) }
    })

    // P&L distribution (-50..+50 in $10 buckets)
    const buckets = [
      { range: '<-$50', min: -Infinity, max: -50 },
      { range: '-$50 to -$20', min: -50, max: -20 },
      { range: '-$20 to $0', min: -20, max: 0 },
      { range: '$0 to $20', min: 0, max: 20 },
      { range: '$20 to $50', min: 20, max: 50 },
      { range: '$50+', min: 50, max: Infinity },
    ]
    const pnlDistribution = buckets.map((b) => ({
      range: b.range,
      count: pnlValues.filter((v) => v >= b.min && v < b.max).length,
    }))

    // consecutive streaks
    let consecutiveWins = 0
    let consecutiveLosses = 0
    let maxConsecutiveWins = 0
    let maxConsecutiveLosses = 0
    let curWin = 0
    let curLoss = 0
    for (const t of trades) {
      if (t.pnl > 0) {
        curWin++
        curLoss = 0
        maxConsecutiveWins = Math.max(maxConsecutiveWins, curWin)
      } else if (t.pnl < 0) {
        curLoss++
        curWin = 0
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, curLoss)
      }
    }
    // current streak (from most recent trade backwards)
    for (let i = trades.length - 1; i >= 0; i--) {
      if (trades[i].pnl > 0) {
        if (i === trades.length - 1 || trades[i + 1].pnl > 0) consecutiveWins++
        else break
      } else if (trades[i].pnl < 0) {
        if (i === trades.length - 1 || trades[i + 1].pnl < 0) consecutiveLosses++
        else break
      }
    }

    // ── Advanced performance metrics ──
    // Expectancy = (winRate * avgWin) - (lossRate * avgLoss)
    const lossRate = totalClosed > 0 ? losses / totalClosed : 0
    const expectancy = Number(((winRate / 100) * avgWin - lossRate * avgLoss).toFixed(2))

    // Average R:R = avgWin / avgLoss
    const avgRR = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0

    // Max drawdown from equity curve (cumulative P&L)
    // The equityCurve is cumulative P&L (starts near 0, can go negative).
    // Max drawdown = largest peak-to-trough decline in cumulative P&L.
    // Percentage is relative to the account's starting balance for meaningfulness.
    let peak = 0
    let maxDrawdown = 0
    for (const point of equityCurve) {
      if (point.equity > peak) peak = point.equity
      const dd = peak - point.equity
      if (dd > maxDrawdown) {
        maxDrawdown = dd
      }
    }
    // Get the account balance for percentage calculation
    let balance = 10000
    if (accountId) {
      const acct = await db.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.id, accountId)).limit(1).then(r => r[0])
      if (acct) balance = acct.balance || 10000
    } else {
      const defAcct = await db.select({ balance: accounts.balance }).from(accounts).where(eq(accounts.isDefault, true)).limit(1).then(r => r[0])
      if (defAcct) balance = defAcct.balance || 10000
    }
    const maxDrawdownPct = balance > 0 ? (maxDrawdown / balance) * 100 : 0

    // Sharpe ratio (annualized from daily returns)
    const dailyReturns: number[] = []
    for (let i = 1; i < byDay.length; i++) {
      const prevEquity = i > 0 ? byDay.slice(0, i).reduce((s, d) => s + d.netPnl, 0) : 0
      const curEquity = prevEquity + byDay[i].netPnl
      if (prevEquity !== 0) {
        dailyReturns.push((curEquity - prevEquity) / Math.abs(prevEquity))
      }
    }
    const avgDailyReturn = dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0
    const dailyStd = dailyReturns.length > 1
      ? Math.sqrt(dailyReturns.reduce((a, b) => a + (b - avgDailyReturn) ** 2, 0) / (dailyReturns.length - 1))
      : 0
    const sharpeRatio = dailyStd > 0
      ? Number(((avgDailyReturn / dailyStd) * Math.sqrt(252)).toFixed(2))
      : 0

    // Sortino ratio (downside deviation only)
    const downsideReturns = dailyReturns.filter((r) => r < 0)
    const downsideStd = downsideReturns.length > 1
      ? Math.sqrt(downsideReturns.reduce((a, b) => a + b ** 2, 0) / downsideReturns.length)
      : 0
    const sortinoRatio = downsideStd > 0
      ? Number(((avgDailyReturn / downsideStd) * Math.sqrt(252)).toFixed(2))
      : 0

    // Largest win / largest loss streak in $
    const winningPnls = trades.filter((t) => t.pnl > 0).map((t) => t.pnl)
    const losingPnls = trades.filter((t) => t.pnl < 0).map((t) => t.pnl)
    const largestWin = winningPnls.length > 0 ? Math.max(...winningPnls) : 0
    const largestLoss = losingPnls.length > 0 ? Math.min(...losingPnls) : 0

    const analytics: TradeAnalytics = {
      totalTrades: trades.length,
      totalClosed,
      wins,
      losses,
      winRate: Number(winRate.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      avgWin: Number(avgWin.toFixed(2)),
      avgLoss: Number(avgLoss.toFixed(2)),
      bestTrade: Number(bestTrade.toFixed(2)),
      worstTrade: Number(worstTrade.toFixed(2)),
      avgHoldMinutes: Number(avgHoldMinutes.toFixed(1)),
      byPair,
      bySource,
      bySession,
      byDay,
      equityCurve,
      pnlDistribution,
      consecutiveWins,
      consecutiveLosses,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      expectancy,
      avgRR,
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      sharpeRatio,
      sortinoRatio,
      largestWin: Number(largestWin.toFixed(2)),
      largestLoss: Number(largestLoss.toFixed(2)),
    }

    return NextResponse.json({ analytics })
  } catch (e) {
    return apiCatch(e, 'analytics', 'GET', req)
  }
}