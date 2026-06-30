import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bidAsk, calcPnl } from '@/lib/market'
import { logInfo, sendNotification } from '@/lib/logger'
import { sendWebhook } from '@/lib/webhook'
import { atomicPartialCloseTrade } from '@/lib/db-transactions'
import { requireTrader } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

// POST /api/trades/[id]/partial-close
// Partially closes a position: closes `percent` of the lot size at current
// market price, reduces the original trade's lot size, and records the closed
// portion as a separate closed trade.
//
// All 3 writes (create closed trade + update original + update account) are
// wrapped in a single $transaction for atomicity. If any write fails, all
// roll back — no partial state.
//
// Body: { percent: number } (1-100, default 50). If percent=100 or remaining
// lot falls below 0.01, the position is fully closed.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Role guard: only trader+ can partially close trades
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const percent = Math.min(100, Math.max(1, Number(body.percent) || 50))

    const trade = await db.trade.findUnique({ where: { id }, include: { account: true } })
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (trade.status !== 'open') {
      return NextResponse.json({ error: 'Trade is not open' }, { status: 400 })
    }

    const closeLot = Number((trade.lotSize * percent / 100).toFixed(2))
    if (closeLot < 0.01) {
      return NextResponse.json({ error: 'Close lot too small (min 0.01)' }, { status: 400 })
    }
    const remainingLot = Number((trade.lotSize - closeLot).toFixed(2))

    const { bid, ask } = bidAsk(trade.symbol)
    const closePrice = trade.side === 'buy' ? bid : ask
    const { pnl, pips } = calcPnl(trade.symbol, trade.side as 'buy' | 'sell', closeLot, trade.openPrice, closePrice)
    const commission = closeLot * 2.5 * 2
    const netPnl = Number((pnl - commission).toFixed(2))

    // ─── Atomic partial close (race-condition safe) ──────────────────────────
    // All 3 writes (create closed trade + update original + update account)
    // are in one transaction. If the trade was closed by another request
    // during this operation, returns alreadyClosed=true.
    const result = await atomicPartialCloseTrade(id, {
      percent,
      closeLot,
      remainingLot,
      closePrice,
      pnl: netPnl,
      pips,
      commission,
    })

    if (result.alreadyClosed) {
      return NextResponse.json(
        { error: 'Trade was closed by another process during partial close' },
        { status: 409 },
      )
    }

    await logInfo('mt5', `Partial close ${percent}%: ${trade.symbol} ${trade.side} ${closeLot} lots @ ${closePrice} | P&L ${netPnl.toFixed(2)} | remaining ${remainingLot} lots`)
    await sendNotification(
      'trade_close',
      `Partial Close ${percent}%: ${trade.symbol} ${trade.side.toUpperCase()}`,
      `Partial close ${percent}% of ${trade.symbol} ${trade.side.toUpperCase()} position.\nClosed: ${closeLot} lots @ ${closePrice}\nPips: ${pips}\nP&L: $${netPnl.toFixed(2)}\nRemaining: ${remainingLot} lots (still open)`,
      'trader@example.com',
    )

    // r15-INTEGRATION: webhook notification for partial close
    await sendWebhook({
      type: 'trade_close',
      title: `📐 Partial Close ${percent}%: ${trade.symbol} ${trade.side.toUpperCase()}`,
      message: `Closed ${closeLot} lots @ ${closePrice}. P&L = $${netPnl.toFixed(2)} (${pips} pips). Remaining: ${remainingLot} lots.`,
      color: netPnl >= 0 ? 0x10b981 : 0xef4444,
      fields: [
        { name: 'Symbol', value: trade.symbol },
        { name: 'Side', value: trade.side.toUpperCase() },
        { name: 'Percent', value: `${percent}%` },
        { name: 'Closed Lot', value: String(closeLot) },
        { name: 'Remaining Lot', value: String(remainingLot) },
        { name: 'Close Price', value: String(closePrice) },
        { name: 'P&L', value: `$${netPnl.toFixed(2)}` },
        { name: 'Pips', value: String(pips) },
      ],
    }).catch(() => null)

    return NextResponse.json({
      closedTrade: result.closedTrade,
      remainingLot,
      netPnl,
      pips,
      closePrice,
    })
  } catch (e: any) {
    console.error('POST /api/trades/[id]/partial-close error', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
