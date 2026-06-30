// Position Reconciliation — syncs local Trade records with MT5 bridge positions.
//
// When real MT5 is connected, trades can be closed externally (e.g., SL hit on
// broker side, or user closed manually in MT5 terminal). This module detects
// such discrepancies and updates the local DB to match the bridge state.
//
// Flow:
//   1. Fetch all open trades from local DB (with mt5Ticket)
//   2. Fetch all positions from MT5 bridge for the account
//   3. Compare:
//      - Local + bridge → OK, update priceCurrent + floating profit
//      - Local only (not on bridge) → trade was closed externally → sync it
//        (close locally with last known bridge data or synthetic price)
//      - Bridge only (not local) → orphan position, log warning
//   4. Return reconciliation report

import 'server-only'
import { db } from './db'
import { getPositions, bridgeHealth, type MT5Position } from './mt5-client'
import { bidAsk, calcPnl } from './market'
import { atomicCloseTrade } from './db-transactions'
import { logInfo, logWarn } from './logger'

export interface ReconciliationReport {
  checked: number
  synced: number        // trades closed locally (were closed on bridge externally)
  updated: number       // trades with updated floating P&L
  orphaned: number      // positions on bridge but not in local DB
  errors: number
  details: {
    synced: Array<{ tradeId: string; symbol: string; mt5Ticket: number; reason: string }>
    orphaned: Array<{ mt5Ticket: number; symbol: string; side: string; volume: number }>
    errors: Array<{ tradeId?: string; mt5Ticket?: number; error: string }>
  }
}

/**
 * Reconcile positions for a single account.
 * Call this periodically (e.g., every 30s) from a background job.
 *
 * @param accountId - the local account ID
 * @param mt5Login - the MT5 login number
 * @returns ReconciliationReport
 */
export async function reconcileAccountPositions(
  accountId: string,
  mt5Login: number,
): Promise<ReconciliationReport> {
  const report: ReconciliationReport = {
    checked: 0,
    synced: 0,
    updated: 0,
    orphaned: 0,
    errors: 0,
    details: { synced: [], orphaned: [], errors: [] },
  }

  // 1. Check bridge is online
  const health = await bridgeHealth()
  if (!health.ok) {
    // Bridge offline — can't reconcile, skip silently
    return report
  }

  // 2. Fetch local open trades with mt5Ticket
  const localTrades = await db.trade.findMany({
    where: { accountId, status: 'open', mt5Ticket: { not: null } },
  })
  report.checked = localTrades.length

  if (localTrades.length === 0) {
    // No local trades to reconcile — but still check for orphaned bridge positions
    const bridgePositions = await getPositions(mt5Login)
    if (bridgePositions.length > 0) {
      report.orphaned = bridgePositions.length
      report.details.orphaned = bridgePositions.map((p) => ({
        mt5Ticket: p.ticket,
        symbol: p.symbol,
        side: p.type,
        volume: p.volume,
      }))
      await logWarn('mt5', `Reconciliation: ${bridgePositions.length} orphaned positions on bridge (not in local DB)`, {
        accountId,
        mt5Login,
        tickets: bridgePositions.map((p) => p.ticket),
      })
    }
    return report
  }

  // 3. Fetch bridge positions
  const bridgePositions = await getPositions(mt5Login)
  const bridgeMap = new Map<number, MT5Position>()
  for (const p of bridgePositions) {
    bridgeMap.set(p.ticket, p)
  }

  // 4. Compare each local trade with bridge
  for (const trade of localTrades) {
    if (!trade.mt5Ticket) continue

    const bridgePos = bridgeMap.get(trade.mt5Ticket)

    if (!bridgePos) {
      // ── Trade exists locally but NOT on bridge → was closed externally ──────
      // Sync it: close locally using synthetic price (bridge doesn't have the
      // close data anymore). Log the discrepancy.
      try {
        const { bid, ask } = bidAsk(trade.symbol)
        const closePrice = trade.side === 'buy' ? bid : ask
        const { pnl, pips } = calcPnl(
          trade.symbol,
          trade.side as 'buy' | 'sell',
          trade.lotSize,
          trade.openPrice,
          closePrice,
        )
        const netPnl = Number((pnl - trade.commission - trade.swap).toFixed(2))

        // Atomic close (conditional update — race-safe)
        const result = await atomicCloseTrade(trade.id, {
          closePrice,
          pnl: netPnl,
          pips,
        })

        if (result.alreadyClosed) {
          // Already closed by another process — skip
          continue
        }

        report.synced++
        report.details.synced.push({
          tradeId: trade.id,
          symbol: trade.symbol,
          mt5Ticket: trade.mt5Ticket,
          reason: 'position not found on bridge — closed externally (SL/TP/manual on MT5)',
        })

        await logInfo('mt5', `Reconciliation: synced trade ${trade.id} (${trade.symbol} ticket=${trade.mt5Ticket}) — was closed on bridge externally, synced locally with P&L ${netPnl}`, {
          accountId,
          mt5Ticket: trade.mt5Ticket,
        })
      } catch (e: any) {
        report.errors++
        report.details.errors.push({
          tradeId: trade.id,
          mt5Ticket: trade.mt5Ticket,
          error: e.message,
        })
        await logWarn('mt5', `Reconciliation: failed to sync trade ${trade.id}: ${e.message}`)
      }
    } else {
      // ── Trade exists on both local + bridge → update floating P&L ──────────
      // We don't need to write to DB here (floating P&L is computed on-the-fly
      // in the dashboard). But we could update a cached value if needed.
      report.updated++
    }
  }

  // 5. Check for orphaned bridge positions (on bridge but not in local DB)
  const localTickets = new Set(localTrades.map((t) => t.mt5Ticket))
  for (const bridgePos of bridgePositions) {
    if (!localTickets.has(bridgePos.ticket)) {
      report.orphaned++
      report.details.orphaned.push({
        mt5Ticket: bridgePos.ticket,
        symbol: bridgePos.symbol,
        side: bridgePos.type,
        volume: bridgePos.volume,
      })
    }
  }

  if (report.orphaned > 0) {
    await logWarn('mt5', `Reconciliation: ${report.orphaned} orphaned bridge positions (not in local DB)`, {
      accountId,
      mt5Login,
      tickets: report.details.orphaned.map((o) => o.mt5Ticket),
    })
  }

  // 6. Log summary
  if (report.synced > 0 || report.orphaned > 0 || report.errors > 0) {
    await logInfo('mt5', `Reconciliation complete for account ${accountId}: checked=${report.checked} synced=${report.synced} updated=${report.updated} orphaned=${report.orphaned} errors=${report.errors}`)
  }

  return report
}

/**
 * Reconcile all accounts that have MT5 login configured.
 * Call this from a background job (e.g., SL/TP monitor service).
 */
export async function reconcileAllAccounts(): Promise<ReconciliationReport> {
  const aggregate: ReconciliationReport = {
    checked: 0,
    synced: 0,
    updated: 0,
    orphaned: 0,
    errors: 0,
    details: { synced: [], orphaned: [], errors: [] },
  }

  try {
    // Get all accounts with a login number
    const accounts = await db.account.findMany({
      where: { login: { not: '' } },
    })

    for (const account of accounts) {
      const mt5Login = Number(account.login)
      if (!mt5Login || mt5Login <= 0) continue

      const report = await reconcileAccountPositions(account.id, mt5Login)
      aggregate.checked += report.checked
      aggregate.synced += report.synced
      aggregate.updated += report.updated
      aggregate.orphaned += report.orphaned
      aggregate.errors += report.errors
      aggregate.details.synced.push(...report.details.synced)
      aggregate.details.orphaned.push(...report.details.orphaned)
      aggregate.details.errors.push(...report.details.errors)
    }
  } catch (e: any) {
    await logWarn('mt5', `Reconciliation error: ${e.message}`)
    aggregate.errors++
    aggregate.details.errors.push({ error: e.message })
  }

  return aggregate
}
