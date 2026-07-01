import { NextRequest, NextResponse } from 'next/server'
import { db, trades, accounts, eq, and, asc } from '@/lib/db'
import { bidAsk, calcPnl } from '@/lib/market'
import { logInfo } from '@/lib/logger'
import { sendWebhook } from '@/lib/webhook'
import { atomicCloseTrade } from '@/lib/db-transactions'
import { closePosition as mt5ClosePosition } from '@/lib/mt5-client'
import { requireTrader } from '@/lib/auth-server'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { apiCatch } from '@/lib/api-handler'
import { closeAllSchema, validateBody } from '@/lib/validations'
import { auditTrade } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/trades/close-all
 *
 * Emergency Close All — closes ALL open positions for an account atomically.
 * Each trade close uses atomicCloseTrade() (conditional update, race-safe).
 *
 * Body (optional): { accountId?: string, reason?: string }
 *   - If accountId not provided, uses the default account.
 *   - reason is logged for audit trail (e.g., "kill-switch", "manual-emergency").
 *
 * Returns: { closed: [...], failed: [...], totalPnl, count }
 *
 * r12-SAFETY: This is the Kill Switch — used when user clicks "Close All & Halt"
 * or when the daily loss circuit breaker triggers.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 3 close-all per minute per IP
  const limited = applyRateLimit(req, RATE_LIMITS.closeAll)
  if (limited) return limited

  // Role guard: only trader+ can close all (viewer cannot)
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const parsed = validateBody(closeAllSchema, body)
  if (!parsed.success) return NextResponse.json(parsed.error, { status: parsed.error.status })

  try {
    const reason = parsed.data.reason || 'manual-close-all'

    // Resolve account
    let account: any = null
    if (parsed.data.accountId) {
      account = await db.query.accounts.findFirst({ where: eq(accounts.id, parsed.data.accountId) }) || null
    } else {
      account = await db.query.accounts.findFirst({ where: eq(accounts.isDefault, true) }) || null
    }
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Fetch all open trades for this account
    const openTrades = await db.query.trades.findMany({
      where: and(eq(trades.accountId, account.id), eq(trades.status, 'open')),
      orderBy: asc(trades.openTime), // close oldest first
    })

    if (openTrades.length === 0) {
      return NextResponse.json({
        closed: [],
        failed: [],
        totalPnl: 0,
        count: 0,
        message: 'No open positions to close.',
      })
    }

    const closed: any[] = []
    const failed: any[] = []
    let totalPnl = 0

    for (const trade of openTrades) {
      try {
        // ── MT5 bridge close (if ticket exists) ──────────────────────────────
        let closePrice: number
        let bridgePnl: number | null = null

        if (trade.mt5Ticket) {
          try {
            const result = await mt5ClosePosition(trade.mt5Ticket)
            closePrice = result.price
            bridgePnl = result.profit
          } catch (e: any) {
            // Bridge close failed — fall back to synthetic price
            const { bid, ask } = bidAsk(trade.symbol)
            closePrice = trade.side === 'buy' ? bid : ask
          }
        } else {
          const { bid, ask } = bidAsk(trade.symbol)
          closePrice = trade.side === 'buy' ? bid : ask
        }

        // Compute local P&L (fallback if bridge didn't provide)
        const { pnl, pips } = calcPnl(
          trade.symbol,
          trade.side as 'buy' | 'sell',
          trade.lotSize,
          trade.openPrice,
          closePrice,
        )
        const grossPnl = bridgePnl != null ? bridgePnl : pnl
        const netPnl = Number((grossPnl - trade.commission - trade.swap).toFixed(2))

        // ── Atomic close (race-condition safe) ───────────────────────────────
        const result = await atomicCloseTrade(trade.id, {
          closePrice,
          pnl: netPnl,
          pips,
        })

        if (result.alreadyClosed) {
          // Trade was closed by another process (SL/TP or manual) — skip
          failed.push({
            id: trade.id,
            symbol: trade.symbol,
            reason: 'already closed by another process',
          })
          continue
        }

        totalPnl += netPnl
        closed.push({
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          lotSize: trade.lotSize,
          closePrice,
          pnl: netPnl,
          pips,
          mt5Ticket: trade.mt5Ticket,
        })
      } catch (e: any) {
        failed.push({
          id: trade.id,
          symbol: trade.symbol,
          reason: e.message,
        })
      }
    }

    // ── Webhook notification ──────────────────────────────────────────────────
    await sendWebhook({
      type: 'trade_close',
      title: `🚨 KILL SWITCH: ${closed.length} positions closed`,
      message: `Emergency close-all executed.\nReason: ${reason}\nClosed: ${closed.length} positions\nFailed: ${failed.length}\nTotal P&L: $${totalPnl.toFixed(2)}`,
      color: totalPnl >= 0 ? 0x10b981 : 0xef4444,
      fields: [
        { name: 'Reason', value: reason },
        { name: 'Closed', value: String(closed.length) },
        { name: 'Failed', value: String(failed.length) },
        { name: 'Total P&L', value: `$${totalPnl.toFixed(2)}` },
      ],
    }).catch(() => null)

    await logInfo('risk', `KILL SWITCH executed: ${closed.length} closed, ${failed.length} failed, total P&L $${totalPnl.toFixed(2)} (reason: ${reason})`, {
      accountId: account.id,
      closed: closed.map((c) => c.id),
      failed: failed.map((f) => f.id),
    })

    await auditTrade.closeAll({ count: closed.length, totalPnl, reason, actor: user.email })

    return NextResponse.json({
      closed,
      failed,
      totalPnl: Number(totalPnl.toFixed(2)),
      count: closed.length,
      message: `${closed.length} position(s) closed. Total P&L: $${totalPnl.toFixed(2)}`,
    })
  } catch (e) {
    return apiCatch(e, 'trades', 'POST', req)
  }
}