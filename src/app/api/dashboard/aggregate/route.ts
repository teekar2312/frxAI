import { NextResponse } from 'next/server'
import { apiCatch } from '@/lib/api-handler'
import { buildEquitySpark } from '@/lib/equity-spark'
import { db, accounts, trades, eq, gte, lte, desc, asc } from '@/lib/db'
import {
  SUPPORTED_SYMBOLS,
  SYMBOL_BASE,
  type SymbolQuote,
  type TradingSession,
  type RiskUsage,
} from '@/lib/types'
import { bidAsk, sparkline, dayHighLow, changePct24h, priceAt } from '@/lib/market'
import { getSessions, getOverlap } from '@/lib/sessions'
import { computeRiskUsage } from '@/lib/risk-usage'

export const dynamic = 'force-dynamic'

interface PerAccountRow {
  accountId: string
  accountName: string
  broker: string
  balance: number
  equity: number
  openPositions: number
  todayPnl: number
  todayPnlPct: number
  connected: boolean
}

interface AggregatePayload {
  totalBalance: number
  totalEquity: number
  totalFreeMargin: number
  totalUsedMargin: number
  accountCount: number
  openPositionsTotal: number
  todayPnlTotal: number
  todayPnlPct: number
  perAccount: PerAccountRow[]
  symbols: SymbolQuote[]
  equitySpark: number[]
  riskUsage: RiskUsage
  sessions: TradingSession[]
}

function buildSymbols(): SymbolQuote[] {
  const out: SymbolQuote[] = []
  const t = Date.now()
  for (const sym of SUPPORTED_SYMBOLS) {
    const { bid, ask, spread } = bidAsk(sym, t)
    const price = priceAt(sym, t)
    const { high, low } = dayHighLow(sym, t)
    const changePct = changePct24h(sym, t)
    const spark = sparkline(sym, 40, t)
    out.push({
      symbol: sym,
      price,
      bid,
      ask,
      spread,
      changePct,
      high,
      low,
      pip: SYMBOL_BASE[sym].pip,
      spark,
      updatedAt: new Date(t).toISOString(),
    })
  }
  return out
}

export async function GET() {
  try {
    const accounts = await db.query.accounts.findMany({
      orderBy: asc(accounts.createdAt),
    })

    const now = new Date()
    const utcStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    )
    const utcEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    )

    // Parallel fetches for open + closed-today trades across ALL accounts.
    const [allOpenTrades, allTodayClosedTrades] = await Promise.all([
      db.query.trades.findMany({
        where: eq(trades.status, 'open'),
        orderBy: desc(trades.openTime),
      }),
      db.query.trades.findMany({
        where: and(
          eq(trades.status, 'closed'),
          gte(trades.closeTime, utcStart),
          lte(trades.closeTime, utcEnd),
        ),
        orderBy: desc(trades.closeTime),
      }),
    ])

    // Per-account P&L map (closed today).
    const todayPnlByAccount = new Map<string, number>()
    for (const t of allTodayClosedTrades) {
      todayPnlByAccount.set(
        t.accountId,
        (todayPnlByAccount.get(t.accountId) ?? 0) + (t.pnl || 0),
      )
    }

    // Open positions count by account.
    const openCountByAccount = new Map<string, number>()
    for (const t of allOpenTrades) {
      openCountByAccount.set(
        t.accountId,
        (openCountByAccount.get(t.accountId) ?? 0) + 1,
      )
    }

    let totalBalance = 0
    let totalEquity = 0
    let totalFreeMargin = 0
    let totalUsedMargin = 0

    const perAccount: PerAccountRow[] = accounts.map((a) => {
      const balance = a.balance || 0
      // Use balance as proxy if equity is 0.
      const equity = a.equity > 0 ? a.equity : balance
      const freeMargin = a.freeMargin || 0
      const usedMargin = a.margin || 0
      const openPositions = openCountByAccount.get(a.id) ?? 0
      const todayPnl = todayPnlByAccount.get(a.id) ?? 0
      const todayPnlPct = balance > 0 ? (todayPnl / balance) * 100 : 0

      totalBalance += balance
      totalEquity += equity
      totalFreeMargin += freeMargin
      totalUsedMargin += usedMargin

      return {
        accountId: a.id,
        accountName: a.name,
        broker: a.broker,
        balance,
        equity,
        openPositions,
        todayPnl: Number(todayPnl.toFixed(2)),
        todayPnlPct: Number(todayPnlPct.toFixed(2)),
        connected: !!a.connected,
      }
    })

    perAccount.sort((a, b) => b.balance - a.balance)

    const todayPnlTotal = perAccount.reduce((s, r) => s + r.todayPnl, 0)
    const todayPnlPct = totalBalance > 0 ? (todayPnlTotal / totalBalance) * 100 : 0

    const equitySpark = buildEquitySpark(totalBalance || 10000, todayPnlTotal)
    const symbols = buildSymbols()

    const riskUsage: RiskUsage = await computeRiskUsage()

    const sessions: TradingSession[] = [...getSessions(), getOverlap()]

    const aggregate: AggregatePayload = {
      totalBalance: Number(totalBalance.toFixed(2)),
      totalEquity: Number(totalEquity.toFixed(2)),
      totalFreeMargin: Number(totalFreeMargin.toFixed(2)),
      totalUsedMargin: Number(totalUsedMargin.toFixed(2)),
      accountCount: accounts.length,
      openPositionsTotal: allOpenTrades.length,
      todayPnlTotal: Number(todayPnlTotal.toFixed(2)),
      todayPnlPct: Number(todayPnlPct.toFixed(2)),
      perAccount,
      symbols,
      equitySpark,
      riskUsage,
      sessions,
    }

    return NextResponse.json({ aggregate })
  } catch (e) {
    return apiCatch(e, 'dashboard', 'GET')
  }
}