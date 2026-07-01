// Transaction helpers — atomic multi-write operations for trade lifecycle.
// All trade close/partial-close operations MUST go through these helpers
// to guarantee:
//   1. Atomicity (trade update + account balance update in one transaction)
//   2. Race-condition safety (conditional update prevents double-close)
//   3. Consistency (if any write fails, all roll back)

import 'server-only'
import type { Trade, Account } from '@prisma/client'
import { db } from './db'
import { logInfo } from './logger'

/**
 * Atomically close a trade and update the account balance.
 *
 * Uses a conditional update (updateMany with status: 'open') to prevent
 * double-close race conditions. If the trade was already closed by another
 * request (e.g., SL/TP monitor + manual close at the same time), this
 * returns { alreadyClosed: true } without modifying anything.
 *
 * @returns { alreadyClosed: true } if trade was not open,
 *          { trade, account } if closed successfully,
 *          throws on unexpected errors.
 */
export async function atomicCloseTrade(
  tradeId: string,
  params: {
    closePrice: number
    pnl: number
    pips: number
  },
): Promise<
  | { alreadyClosed: true; trade: null; account: null }
  | { alreadyClosed: false; trade: Trade; account: Account | null }
> {
  return db.$transaction(async (tx) => {
    // Conditional update: only succeeds if status is still 'open'.
    // If another request closed it first, affectedCount = 0.
    const result = await tx.trade.updateMany({
      where: { id: tradeId, status: 'open' },
      data: {
        status: 'closed',
        closePrice: params.closePrice,
        closeTime: new Date(),
        pnl: params.pnl,
        pips: params.pips,
      },
    })

    if (result.count === 0) {
      // Trade was already closed by another request — abort.
      return { alreadyClosed: true as const, trade: null, account: null }
    }

    // Fetch the updated trade + account in the same transaction.
    const trade = await tx.trade.findUnique({ where: { id: tradeId } })
    const account = trade
      ? await tx.account.findUnique({ where: { id: trade.accountId } })
      : null

    if (!trade) {
      throw new Error(`Trade ${tradeId} not found after update`)
    }

    // Update account balance atomically.
    if (account) {
      const newBalance = Number((account.balance + params.pnl).toFixed(2))
      const newEquity = Number(newBalance.toFixed(2))
      const marginFreed = Math.max(0, trade.lotSize * 1000)
      const newMargin = Math.max(0, account.margin - marginFreed)
      const newFreeMargin = Number((newEquity - newMargin).toFixed(2))
      const updated = await tx.account.update({
        where: { id: account.id },
        data: {
          balance: newBalance,
          equity: newEquity,
          freeMargin: newFreeMargin,
          margin: { decrement: marginFreed },
        },
      })
      return { alreadyClosed: false as const, trade, account: updated }
    }

    return { alreadyClosed: false as const, trade, account: null }
  })
}

/**
 * Atomically partially close a trade:
 *   1. Create a closed trade record for the partial portion
 *   2. Either fully close OR reduce the original trade's lot size
 *   3. Update account balance
 *
 * All 3 writes are in one transaction — if any fails, all roll back.
 * Uses conditional update to prevent double-close.
 *
 * @returns { alreadyClosed: true } if trade was not open,
 *          { closedTrade, remainingTrade, account } on success.
 */
export async function atomicPartialCloseTrade(
  tradeId: string,
  params: {
    percent: number
    closeLot: number
    remainingLot: number
    closePrice: number
    pnl: number
    pips: number
    commission: number
  },
): Promise<
  | { alreadyClosed: true; closedTrade: null; remainingTrade: null; account: null }
  | { alreadyClosed: false; closedTrade: Trade; remainingTrade: Trade | null; account: Account | null }
> {
  return db.$transaction(async (tx) => {
    // Lock the trade row by fetching it first (SQLite doesn't have SELECT FOR UPDATE,
    // but the transaction ensures consistency).
    const trade = await tx.trade.findUnique({
      where: { id: tradeId },
      include: { account: true },
    })

    if (!trade) {
      throw new Error(`Trade ${tradeId} not found`)
    }

    if (trade.status !== 'open') {
      return {
        alreadyClosed: true as const,
        closedTrade: null,
        remainingTrade: null,
        account: null,
      }
    }

    // 1. Create a closed trade record for the partial portion.
    const closedTrade = await tx.trade.create({
      data: {
        accountId: trade.accountId,
        symbol: trade.symbol,
        side: trade.side,
        lotSize: params.closeLot,
        openPrice: trade.openPrice,
        closePrice: params.closePrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        trailingStop: false,
        trailingPips: 0,
        status: 'closed',
        pnl: params.pnl,
        pips: params.pips,
        commission: params.commission,
        swap: 0,
        strategy: trade.strategy,
        timeframe: trade.timeframe,
        source: trade.source,
        comment: `Partial close ${params.percent}% of ${trade.id.slice(-6)}`,
        openTime: trade.openTime,
        closeTime: new Date(),
        mt5Ticket: trade.mt5Ticket,
        mt5Server: trade.mt5Server,
      },
    })

    // 2. Either fully close OR reduce the original trade's lot size.
    let remainingTrade: Trade | null = null
    if (params.remainingLot < 0.01) {
      // Fully close — conditional update prevents double-close.
      const result = await tx.trade.updateMany({
        where: { id: tradeId, status: 'open' },
        data: {
          status: 'closed',
          closePrice: params.closePrice,
          closeTime: new Date(),
          pnl: { increment: params.pnl },
          pips: params.pips,
        },
      })
      if (result.count === 0) {
        throw new Error('Trade was closed by another request during partial close')
      }
      remainingTrade = await tx.trade.findUnique({ where: { id: tradeId } })
    } else {
      // Reduce lot size + decrement commission + free up margin for closed portion.
      const marginToFree = params.closeLot * 1000
      remainingTrade = await tx.trade.update({
        where: { id: tradeId },
        data: {
          lotSize: params.remainingLot,
          commission: { decrement: params.commission },
        },
      })
      // Free margin for the closed portion
      if (trade.account) {
        await tx.account.update({
          where: { id: trade.accountId },
          data: {
            margin: { decrement: marginToFree },
            freeMargin: { increment: marginToFree },
          },
        })
      }
    }

    // 3. Update account balance.
    let account: Account | null = null
    if (trade.account) {
      const newBalance = Number((trade.account.balance + params.pnl).toFixed(2))
      const newEquity = Number(newBalance.toFixed(2))
      const remainingMargin = Math.max(0, (trade.account.margin || 0) - (params.closeLot * 1000))
      const newFreeMargin = Number((newEquity - remainingMargin).toFixed(2))
      account = await tx.account.update({
        where: { id: trade.accountId },
        data: {
          balance: newBalance,
          equity: newEquity,
          freeMargin: newFreeMargin,
        },
      })
    }

    return {
      alreadyClosed: false as const,
      closedTrade,
      remainingTrade,
      account,
    }
  })
}

/**
 * Atomically delete an account and all its trades + orders.
 * Prisma's onDelete: Cascade handles this, but this helper makes it explicit
 * and allows for pre-deletion validation (e.g., check no open positions).
 */
export async function atomicDeleteAccount(accountId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    // Check for open trades — refuse to delete if any exist.
    const openCount = await tx.trade.count({
      where: { accountId, status: 'open' },
    })
    if (openCount > 0) {
      throw new Error(
        `Cannot delete account with ${openCount} open position(s). Close all positions first.`,
      )
    }

    // Delete orders first (they reference account)
    await tx.order.deleteMany({ where: { accountId } })
    // Delete trades
    await tx.trade.deleteMany({ where: { accountId } })
    // Delete account
    await tx.account.delete({ where: { id: accountId } })

    await logInfo('system', `Account ${accountId} deleted atomically (trades + orders + account)`)
  })
}
