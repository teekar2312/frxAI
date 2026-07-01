import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  SUPPORTED_SYMBOLS,
  SYMBOL_BASE,
  type SymbolQuote,
  type DashboardData,
  type TradingSession,
} from '@/lib/types'
import { bidAsk, sparkline, dayHighLow, changePct24h, priceAt } from '@/lib/market'
import { getSessions, getOverlap } from '@/lib/sessions'
import { computeRiskUsage } from '@/lib/risk-usage'
import { bridgeHealth, getTick, getAccountInfo } from '@/lib/mt5-client'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

async function buildSymbols(): Promise<SymbolQuote[]> {
  const out: SymbolQuote[] = []
  const t = Date.now()
  const bridgeOnline = (await bridgeHealth()).ok

  for (const sym of SUPPORTED_SYMBOLS) {
    let price: number
    let bid: number
    let ask: number
    let spread: number

    if (bridgeOnline) {
      // Try real bridge tick first
      const tick = await getTick(sym)
      if (tick) {
        price = tick.bid // use bid as mid reference for dashboard
        bid = tick.bid
        ask = tick.ask
        spread = tick.spread
      } else {
        // Fallback to synthetic
        const local = bidAsk(sym, t)
        price = priceAt(sym, t)
        bid = local.bid
        ask = local.ask
        spread = local.spread
      }
    } else {
      // Bridge offline — pure synthetic
      const local = bidAsk(sym, t)
      price = priceAt(sym, t)
      bid = local.bid
      ask = local.ask
      spread = local.spread
    }

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

function buildEquitySpark(balance: number, todayPnl: number): number[] {
  // 40-point synthetic curve anchored at balance, drifting toward balance + todayPnl.
  const out: number[] = []
  const start = balance - todayPnl * 0.5
  const end = balance + todayPnl
  for (let i = 0; i < 40; i++) {
    const frac = i / 39
    const lin = start + (end - start) * frac
    const wobble = Math.sin(i / 3.1) * (balance * 0.0008)
    out.push(Number((lin + wobble).toFixed(2)))
  }
  return out
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const requestedAccountId = searchParams.get('accountId')

    const accounts = await db.account.findMany({ orderBy: { createdAt: 'asc' } })
    // Resolve: requested accountId → default → first → null
    const defaultAccount = (requestedAccountId && accounts.find((a) => a.id === requestedAccountId))
      || accounts.find((a) => a.isDefault)
      || accounts[0]
      || null

    let openTrades: any[] = []
    let todayClosedTrades: any[] = []
    let todayPnl = 0
    let todayPnlPct = 0

    if (defaultAccount) {
      openTrades = await db.trade.findMany({
        where: { accountId: defaultAccount.id, status: 'open' },
        orderBy: { openTime: 'desc' },
      })

      const now = new Date()
      const utcStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
      )
      const utcEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
      )
      todayClosedTrades = await db.trade.findMany({
        where: {
          accountId: defaultAccount.id,
          status: 'closed',
          closeTime: { gte: utcStart, lte: utcEnd },
        },
        orderBy: { closeTime: 'desc' },
      })
      todayPnl = todayClosedTrades.reduce((s, t) => s + (t.pnl || 0), 0)
      const balance = defaultAccount.balance || 0
      todayPnlPct = balance > 0 ? (todayPnl / balance) * 100 : 0
    }

    const riskUsage = await computeRiskUsage()

    const sessions: TradingSession[] = [...getSessions(), getOverlap()]

    const topNews = await db.newsItem.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 6,
    })

    const latestSignals = await db.aiSignal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
    })

    const equitySpark = buildEquitySpark(defaultAccount?.balance ?? 10000, todayPnl)

    const symbols = await buildSymbols()

    // MT5 bridge status — included in payload so the dashboard can show a badge
    const mt5Health = await bridgeHealth()

    // If the account has an MT5 login and the bridge is online, sync live equity
    let liveAccountInfo = null
    if (defaultAccount && mt5Health.ok) {
      const mt5Login = Number(defaultAccount.login)
      if (mt5Login > 0) {
        liveAccountInfo = await getAccountInfo(mt5Login)
      }
    }

    const payload: DashboardData = {
      accounts: accounts as any,
      defaultAccount: (defaultAccount as any) ?? null,
      openTrades: openTrades as any,
      todayClosedTrades: todayClosedTrades as any,
      todayPnl: Number(todayPnl.toFixed(2)),
      todayPnlPct: Number(todayPnlPct.toFixed(2)),
      riskUsage,
      sessions,
      topNews: topNews as any,
      latestSignals: latestSignals as any,
      equitySpark,
      symbols,
      // @ts-expect-error — mt5 fields added in r10, not yet in DashboardData type
      mt5: {
        bridgeOnline: mt5Health.ok,
        adapter: mt5Health.adapter,
        isLive: mt5Health.isLive,
        liveAccount: liveAccountInfo,
      },
    }

    return NextResponse.json(payload)
  } catch (e) {
    return apiCatch(e, 'dashboard', 'GET', req)
  }
}
