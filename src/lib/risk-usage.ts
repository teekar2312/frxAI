import 'server-only'
import { db } from './db'
import { calcPnl } from './market'
import type { RiskUsage } from './types'

/**
 * Compute current account risk usage:
 *  - openRiskPct = sum(|pnl if SL hit|) / balance * 100
 *  - dailyPnlPct = today's closed pnl / balance * 100
 *  - usedPct = max(openRiskPct, |dailyPnlPct|)
 * Uses the default account (or first account if none marked default).
 */
export async function computeRiskUsage(): Promise<RiskUsage> {
  const account =
    (await db.account.findFirst({ where: { isDefault: true } })) ||
    (await db.account.findFirst())

  if (!account) {
    return {
      usedPct: 0,
      limitPct: 2,
      openRiskPct: 0,
      dailyPnlPct: 0,
      openPositions: 0,
      maxPositions: 10,
      dailyPnl: 0,
      balance: 0,
    }
  }

  const settings = await db.riskSetting.findMany()
  const cfg: Record<string, string> = {}
  for (const s of settings) cfg[s.key] = s.value

  const dailyRiskLimitPct = parseFloat(cfg.dailyRiskLimitPct ?? '2')
  const maxOpenPositions = parseInt(cfg.maxOpenPositions ?? '10', 10)

  const openTrades = await db.trade.findMany({
    where: { accountId: account.id, status: 'open' },
  })

  let openRisk = 0
  for (const t of openTrades) {
    if (t.stopLoss && t.stopLoss !== t.openPrice) {
      const { pnl } = calcPnl(
        t.symbol,
        t.side as 'buy' | 'sell',
        t.lotSize,
        t.openPrice,
        t.stopLoss,
      )
      openRisk += Math.abs(pnl)
    }
  }

  const balance = account.balance || 0
  const openRiskPct = balance > 0 ? (openRisk / balance) * 100 : 0

  // today's closed pnl (UTC)
  const now = new Date()
  const utcStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  )
  const utcEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  )
  const todayClosed = await db.trade.findMany({
    where: {
      accountId: account.id,
      status: 'closed',
      closeTime: { gte: utcStart, lte: utcEnd },
    },
  })
  const dailyPnl = todayClosed.reduce((sum, t) => sum + (t.pnl || 0), 0)
  const dailyPnlPct = balance > 0 ? (dailyPnl / balance) * 100 : 0

  const usedPct = Math.max(openRiskPct, Math.abs(dailyPnlPct))

  return {
    usedPct: Number(usedPct.toFixed(2)),
    limitPct: Number.isFinite(dailyRiskLimitPct) ? dailyRiskLimitPct : 2,
    openRiskPct: Number(openRiskPct.toFixed(2)),
    dailyPnlPct: Number(dailyPnlPct.toFixed(2)),
    openPositions: openTrades.length,
    maxPositions: Number.isFinite(maxOpenPositions) ? maxOpenPositions : 10,
    dailyPnl: Number(dailyPnl.toFixed(2)),
    balance,
  }
}
