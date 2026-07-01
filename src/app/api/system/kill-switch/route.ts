import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo, logWarn } from '@/lib/logger'
import { sendWebhook } from '@/lib/webhook'
import { atomicCloseTrade } from '@/lib/db-transactions'
import { closePosition as mt5ClosePosition } from '@/lib/mt5-client'
import { bidAsk, calcPnl } from '@/lib/market'
import { requireTrader } from '@/lib/auth-server'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { apiCatch } from '@/lib/api-handler'
import { auditRisk } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/system/kill-switch
 *
 * Emergency Kill Switch — the "panic button" that:
 *   1. Disables auto-trading immediately (sets autoTradingEnabled=false)
 *   2. Closes ALL open positions atomically (via atomicCloseTrade)
 *   3. Logs the event for audit trail
 *   4. Sends webhook notification (Discord/Telegram/Slack)
 *
 * Body (optional): { accountId?: string, reason?: string }
 *
 * Returns: { halted: true, autoTradingDisabled: true, closed: [...], totalPnl, count }
 *
 * This is the most critical safety endpoint in the system. Use when:
 *   - Market crash and you need to exit everything NOW
 *   - Auto-trader gone rogue (opening too many trades)
 *   - Daily loss approaching dangerous levels
 *   - Any emergency requiring immediate full exit
 */
export async function POST(req: NextRequest) {
  // Rate limit: 2 kill-switch per 30 seconds per IP (emergency, but prevent spam)
  const limited = applyRateLimit(req, RATE_LIMITS.killSwitch)
  if (limited) return limited

  // Role guard: only trader+ can trigger kill switch (viewer cannot)
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  try {
    const body = await req.json().catch(() => ({}))
    const reason = body?.reason || 'emergency-kill-switch'
    const triggeredBy = user.email

    // ── 1. Disable auto-trading IMMEDIATELY ────────────────────────────────────
    // This is the first action — even if close-all fails, auto-trade stays off.
    await db.riskSetting.upsert({
      where: { key: 'autoTradingEnabled' },
      create: { key: 'autoTradingEnabled', value: 'false' },
      update: { value: 'false' },
    })

    await logWarn('risk', `🚨 KILL SWITCH ACTIVATED by ${triggeredBy}: auto-trading DISABLED (reason: ${reason})`)

    // ── 2. Resolve account ─────────────────────────────────────────────────────
    let account = null
    if (body?.accountId) {
      account = await db.account.findUnique({ where: { id: body.accountId } })
    } else {
      account = await db.account.findFirst({ where: { isDefault: true } })
    }
    if (!account) {
      return NextResponse.json({
        halted: true,
        autoTradingDisabled: true,
        closed: [],
        failed: [],
        totalPnl: 0,
        count: 0,
        message: 'Auto-trading disabled. No account found for close-all.',
      })
    }

    // ── 3. Close ALL open positions ────────────────────────────────────────────
    const openTrades = await db.trade.findMany({
      where: { accountId: account.id, status: 'open' },
      orderBy: { openTime: 'asc' },
    })

    const closed: any[] = []
    const failed: any[] = []
    let totalPnl = 0

    for (const trade of openTrades) {
      try {
        // MT5 bridge close (if ticket exists)
        let closePrice: number
        let bridgePnl: number | null = null

        if (trade.mt5Ticket) {
          try {
            const result = await mt5ClosePosition(trade.mt5Ticket)
            closePrice = result.price
            bridgePnl = result.profit
          } catch {
            const { bid, ask } = bidAsk(trade.symbol)
            closePrice = trade.side === 'buy' ? bid : ask
          }
        } else {
          const { bid, ask } = bidAsk(trade.symbol)
          closePrice = trade.side === 'buy' ? bid : ask
        }

        const { pnl, pips } = calcPnl(
          trade.symbol,
          trade.side as 'buy' | 'sell',
          trade.lotSize,
          trade.openPrice,
          closePrice,
        )
        const grossPnl = bridgePnl != null ? bridgePnl : pnl
        const netPnl = Number((grossPnl - trade.commission - trade.swap).toFixed(2))

        // Atomic close (race-safe)
        const result = await atomicCloseTrade(trade.id, {
          closePrice,
          pnl: netPnl,
          pips,
        })

        if (result.alreadyClosed) {
          failed.push({ id: trade.id, symbol: trade.symbol, reason: 'already closed' })
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
        })
      } catch (e: any) {
        failed.push({ id: trade.id, symbol: trade.symbol, reason: e.message })
      }
    }

    // ── 4. Log + webhook + audit ───────────────────────────────────────────────
    await logInfo('risk', `KILL SWITCH complete: ${closed.length} closed, ${failed.length} failed, total P&L $${totalPnl.toFixed(2)}`, {
      accountId: account.id,
      triggeredBy,
      reason,
      closed: closed.map((c) => c.id),
    })

    await sendWebhook({
      type: 'risk',
      title: `🚨 KILL SWITCH ACTIVATED`,
      message: `Emergency halt executed by ${triggeredBy}.\n\nAuto-trading: DISABLED\nPositions closed: ${closed.length}/${openTrades.length}\nTotal realized P&L: $${totalPnl.toFixed(2)}\n\nReason: ${reason}`,
      color: 0xef4444, // rose — emergency
      fields: [
        { name: 'Triggered By', value: triggeredBy },
        { name: 'Reason', value: reason },
        { name: 'Auto-Trading', value: 'DISABLED' },
        { name: 'Positions Closed', value: `${closed.length}/${openTrades.length}` },
        { name: 'Failed', value: String(failed.length) },
        { name: 'Total P&L', value: `$${totalPnl.toFixed(2)}` },
      ],
    }).catch(() => null)

    // Audit trail for kill switch
    await auditRisk.killSwitch(triggeredBy, reason)

    return NextResponse.json({
      halted: true,
      autoTradingDisabled: true,
      closed,
      failed,
      totalPnl: Number(totalPnl.toFixed(2)),
      count: closed.length,
      message: `🚨 KILL SWITCH: Auto-trading disabled. ${closed.length} position(s) closed. Total P&L: $${totalPnl.toFixed(2)}`,
    })
  } catch (e) {
    return apiCatch(e, 'system', 'POST', req, { severity: 'critical' })
  }
}