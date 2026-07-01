// Risk Enforcement — server-side hard checks that BLOCK trades from opening
// if they violate risk rules. This is the "guard rail" that prevents overtrading,
// blown accounts, and excessive risk.
//
// All checks are SERVER-SIDE (not client-side) so they cannot be bypassed.
// The trade open route calls enforceTradeOpen() BEFORE creating the trade.
// If any check fails, the trade is rejected with a 422 + reason.

import 'server-only'
import { db, eq, and, gte, lte } from './db'
import { riskSettings, accounts, trades, orders } from './db'
import { calcPnl, bidAsk } from './market'
import { SYMBOL_BASE } from './types'
import { logInfo } from './logger'

export interface RiskConfig {
  riskEnforcementEnabled: boolean
  maxOpenPositions: number
  maxLotSizePerTrade: number
  maxTotalLotSize: number
  dailyRiskLimitPct: number // e.g., 2 = 2% of balance
  maxRiskPerTradePct: number // e.g., 1 = 1% of balance
  marginCallLevel: number // e.g., 50 = block if margin level < 50%
}

const DEFAULTS: RiskConfig = {
  riskEnforcementEnabled: true,
  maxOpenPositions: 10,
  maxLotSizePerTrade: 1.0,
  maxTotalLotSize: 5.0,
  dailyRiskLimitPct: 2.0,
  maxRiskPerTradePct: 1.0,
  marginCallLevel: 50,
}

/** Load risk config from the RiskSetting table. Falls back to defaults. */
export async function getRiskConfig(): Promise<RiskConfig> {
  try {
    const rows = await db.select().from(riskSettings)
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value
    return {
      riskEnforcementEnabled: map.riskEnforcementEnabled !== 'false',
      maxOpenPositions: parseInt(map.maxOpenPositions ?? '10', 10) || 10,
      maxLotSizePerTrade: parseFloat(map.maxLotSizePerTrade ?? '1.0') || 1.0,
      maxTotalLotSize: parseFloat(map.maxTotalLotSize ?? '5.0') || 5.0,
      dailyRiskLimitPct: parseFloat(map.dailyRiskLimitPct ?? '2.0') || 2.0,
      maxRiskPerTradePct: parseFloat(map.maxRiskPerTradePct ?? '1.0') || 1.0,
      marginCallLevel: parseFloat(map.marginCallLevel ?? '50') || 50,
    }
  } catch {
    return DEFAULTS
  }
}

export interface EnforcementResult {
  allowed: boolean
  reason?: string
  violations: string[]
  // Context for debugging + UI display
  context: {
    openPositions: number
    maxPositions: number
    totalLot: number
    maxTotalLot: number
    requestedLot: number
    maxLotPerTrade: number
    dailyPnlPct: number
    dailyRiskLimitPct: number
    tradeRiskPct: number
    maxRiskPerTradePct: number
    marginLevel: number
    marginCallLevel: number
    balance: number
    freeMargin: number
    pendingOrders: number
  }
}

/**
 * Run ALL risk enforcement checks for a prospective trade open.
 * Returns { allowed: true } if the trade passes all checks.
 * Returns { allowed: false, reason, violations } if any check fails.
 *
 * Checks performed (in order):
 *   1. Risk enforcement enabled (master toggle)
 *   2. Max open positions not exceeded
 *   3. Lot size <= maxLotSizePerTrade
 *   4. Total lot size (existing + new) <= maxTotalLotSize
 *   5. Daily loss limit not exceeded (circuit breaker)
 *   6. Trade risk (if SL hit) <= maxRiskPerTradePct
 *   7. Sufficient free margin
 *   8. Margin level above margin call threshold
 */
export async function enforceTradeOpen(params: {
  accountId: string
  symbol: string
  side: 'buy' | 'sell'
  lotSize: number
  stopLoss?: number | null
}): Promise<EnforcementResult> {
  const cfg = await getRiskConfig()
  const violations: string[] = []

  // ── 1. Master toggle ──────────────────────────────────────────────────────
  if (!cfg.riskEnforcementEnabled) {
    return {
      allowed: true,
      violations: [],
      context: {
        openPositions: 0, maxPositions: cfg.maxOpenPositions,
        totalLot: 0, maxTotalLot: cfg.maxTotalLotSize,
        requestedLot: params.lotSize, maxLotPerTrade: cfg.maxLotSizePerTrade,
        dailyPnlPct: 0, dailyRiskLimitPct: cfg.dailyRiskLimitPct,
        tradeRiskPct: 0, maxRiskPerTradePct: cfg.maxRiskPerTradePct,
        marginLevel: 0, marginCallLevel: cfg.marginCallLevel,
        balance: 0, freeMargin: 0, pendingOrders: 0,
      },
    }
  }

  // ── Fetch account ──────────────────────────────────────────────────────────
  const account = await db.select().from(accounts).where(eq(accounts.id, params.accountId)).limit(1).then(r => r[0] ?? null)
  if (!account) {
    return {
      allowed: false,
      reason: 'Account not found',
      violations: ['Account not found'],
      context: {
        openPositions: 0, maxPositions: cfg.maxOpenPositions,
        totalLot: 0, maxTotalLot: cfg.maxTotalLotSize,
        requestedLot: params.lotSize, maxLotPerTrade: cfg.maxLotSizePerTrade,
        dailyPnlPct: 0, dailyRiskLimitPct: cfg.dailyRiskLimitPct,
        tradeRiskPct: 0, maxRiskPerTradePct: cfg.maxRiskPerTradePct,
        marginLevel: 0, marginCallLevel: cfg.marginCallLevel,
        balance: 0, freeMargin: 0, pendingOrders: 0,
      },
    }
  }

  // ── Fetch open trades + pending orders + today's closed trades ─────────────────
  const openTrades = await db.select().from(trades).where(
    and(eq(trades.accountId, params.accountId), eq(trades.status, 'open')),
  )

  const pendingOrders = await db.select().from(orders).where(
    and(eq(orders.accountId, params.accountId), eq(orders.status, 'pending')),
  )

  const now = new Date()
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  const utcEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
  const todayClosed = await db.select().from(trades).where(
    and(
      eq(trades.accountId, params.accountId),
      eq(trades.status, 'closed'),
      gte(trades.closeTime, utcStart),
      lte(trades.closeTime, utcEnd),
    ),
  )

  // ── Compute context values ────────────────────────────────────────────────
  const openPositions = openTrades.length
  const totalLot = openTrades.reduce((s, t) => s + t.lotSize, 0) +
    pendingOrders.reduce((s, o) => s + o.lotSize, 0)
  const dailyPnl = todayClosed.reduce((s, t) => s + (t.pnl || 0), 0)
  const balance = account.balance || 0
  const dailyPnlPct = balance > 0 ? (dailyPnl / balance) * 100 : 0
  const freeMargin = account.freeMargin || account.balance || 0

  // Estimate margin level (equity / margin * 100)
  const margin = account.margin || openTrades.reduce((s, t) => s + t.lotSize * 1000, 0)
  const equity = account.equity || balance
  const marginLevel = margin > 0 ? (equity / margin) * 100 : 0

  // Compute trade risk (how much we'd lose if SL hits)
  let tradeRiskAmount = 0
  if (params.stopLoss) {
    const { bid, ask } = bidAsk(params.symbol)
    const openPrice = params.side === 'buy' ? ask : bid
    const { pnl } = calcPnl(params.symbol, params.side, params.lotSize, openPrice, params.stopLoss)
    tradeRiskAmount = Math.abs(pnl)
  }
  const tradeRiskPct = balance > 0 ? (tradeRiskAmount / balance) * 100 : 0

  const context = {
    openPositions,
    maxPositions: cfg.maxOpenPositions,
    totalLot: Number(totalLot.toFixed(2)),
    maxTotalLot: cfg.maxTotalLotSize,
    requestedLot: params.lotSize,
    maxLotPerTrade: cfg.maxLotSizePerTrade,
    dailyPnlPct: Number(dailyPnlPct.toFixed(2)),
    dailyRiskLimitPct: cfg.dailyRiskLimitPct,
    tradeRiskPct: Number(tradeRiskPct.toFixed(2)),
    maxRiskPerTradePct: cfg.maxRiskPerTradePct,
    marginLevel: Number(marginLevel.toFixed(2)),
    marginCallLevel: cfg.marginCallLevel,
    balance,
    freeMargin,
    pendingOrders: pendingOrders.length,
  }

  // ── 2. Max open positions ─────────────────────────────────────────────────
  if (openPositions >= cfg.maxOpenPositions) {
    violations.push(
      `Max open positions exceeded: ${openPositions}/${cfg.maxOpenPositions}. Close existing positions first.`,
    )
  }

  // ── 2b. Max pending orders ─────────────────────────────────────────────────
  const MAX_PENDING_ORDERS = 20
  if (pendingOrders.length >= MAX_PENDING_ORDERS) {
    violations.push(
      `Max pending orders reached: ${pendingOrders.length}/${MAX_PENDING_ORDERS}. Cancel pending orders first.`,
    )
  }

  // ── 3. Lot size per trade ─────────────────────────────────────────────────
  if (params.lotSize > cfg.maxLotSizePerTrade) {
    violations.push(
      `Lot size ${params.lotSize} exceeds max per-trade limit (${cfg.maxLotSizePerTrade}).`,
    )
  }

  // ── 4. Total lot size ─────────────────────────────────────────────────────
  const newTotalLot = totalLot + params.lotSize
  if (newTotalLot > cfg.maxTotalLotSize) {
    violations.push(
      `Total lot size would be ${newTotalLot.toFixed(2)} (max ${cfg.maxTotalLotSize}). Current open: ${totalLot.toFixed(2)}.`,
    )
  }

  // ── 5. Daily loss circuit breaker ─────────────────────────────────────────
  // If daily P&L is negative AND |dailyPnlPct| >= dailyRiskLimitPct, block ALL new trades.
  if (dailyPnl < 0 && Math.abs(dailyPnlPct) >= cfg.dailyRiskLimitPct) {
    violations.push(
      `Daily loss limit reached: ${dailyPnlPct.toFixed(2)}% (limit: -${cfg.dailyRiskLimitPct}%). Trading halted for today.`,
    )
  }

  // ── 6. Risk per trade (if SL provided) ────────────────────────────────────
  if (params.stopLoss && tradeRiskPct > cfg.maxRiskPerTradePct) {
    violations.push(
      `Trade risk ${tradeRiskPct.toFixed(2)}% exceeds max per-trade risk (${cfg.maxRiskPerTradePct}%). Reduce lot size or tighten SL.`,
    )
  }

  // ── 7. Margin check ───────────────────────────────────────────────────────
  // Estimate required margin: lotSize * contractSize / leverage
  const base = SYMBOL_BASE[params.symbol]
  if (base) {
    // Leverage is stored as "1:100" — extract the numeric part after ':'
    const levStr = String(account.leverage || '1:100')
    const levNum = levStr.includes(':') ? parseInt(levStr.split(':')[1]) || 100 : parseInt(levStr) || 100
    const requiredMargin = (params.lotSize * base.contractSize) / levNum
    if (requiredMargin > freeMargin) {
      violations.push(
        `Insufficient free margin: required $${requiredMargin.toFixed(2)}, available $${freeMargin.toFixed(2)}.`,
      )
    }
  }

  // ── 8. Margin level check ─────────────────────────────────────────────────
  if (margin > 0 && marginLevel < cfg.marginCallLevel) {
    violations.push(
      `Margin level ${marginLevel.toFixed(2)}% below margin call threshold (${cfg.marginCallLevel}%). Close positions to free margin.`,
    )
  }

  const allowed = violations.length === 0
  const reason = allowed ? undefined : violations.join(' ')

  if (!allowed) {
    await logInfo('risk', `Trade REJECTED: ${params.side} ${params.lotSize} ${params.symbol}`, {
      accountId: params.accountId,
      violations,
      context,
    })
  }

  return { allowed, reason, violations, context }
}

/**
 * Check if the daily loss circuit breaker is active.
 * Returns true if new trades should be blocked due to daily loss.
 */
export async function isDailyLossCircuitBreakerActive(accountId: string): Promise<{
  active: boolean
  dailyPnlPct: number
  dailyRiskLimitPct: number
}> {
  const cfg = await getRiskConfig()
  const account = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1).then(r => r[0] ?? null)
  if (!account) return { active: false, dailyPnlPct: 0, dailyRiskLimitPct: cfg.dailyRiskLimitPct }

  const now = new Date()
  const utcStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0))
  const utcEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999))
  const todayClosed = await db.select().from(trades).where(
    and(
      eq(trades.accountId, accountId),
      eq(trades.status, 'closed'),
      gte(trades.closeTime, utcStart),
      lte(trades.closeTime, utcEnd),
    ),
  )
  const dailyPnl = todayClosed.reduce((s, t) => s + (t.pnl || 0), 0)
  const balance = account.balance || 0
  const dailyPnlPct = balance > 0 ? (dailyPnl / balance) * 100 : 0

  return {
    active: dailyPnl < 0 && Math.abs(dailyPnlPct) >= cfg.dailyRiskLimitPct,
    dailyPnlPct: Number(dailyPnlPct.toFixed(2)),
    dailyRiskLimitPct: cfg.dailyRiskLimitPct,
  }
}