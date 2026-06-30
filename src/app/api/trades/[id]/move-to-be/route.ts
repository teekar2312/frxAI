import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo, sendNotification } from '@/lib/logger'
import { SYMBOL_BASE } from '@/lib/types'

export const dynamic = 'force-dynamic'

// POST /api/trades/[id]/move-to-be
// Moves the stop-loss to the entry price (break-even), making the trade
// risk-free. Optionally adds a small buffer (in pips) beyond entry in the
// profit direction so the trade closes with a tiny gain even if SL is hit.
// Body: { bufferPips?: number } (default 0)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const bufferPips = Math.max(0, Math.min(20, Number(body.bufferPips) || 0))

    const trade = await db.trade.findUnique({ where: { id }, include: { account: true } })
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (trade.status !== 'open') {
      return NextResponse.json({ error: 'Trade is not open' }, { status: 400 })
    }

    const pipSize = SYMBOL_BASE[trade.symbol as keyof typeof SYMBOL_BASE]?.pip ?? 0.0001
    // For a BUY: SL moves UP to entry + buffer. SL must be below current price.
    // For a SELL: SL moves DOWN to entry - buffer. SL must be above current price.
    const newSl = trade.side === 'buy'
      ? Number((trade.openPrice + bufferPips * pipSize).toFixed(5))
      : Number((trade.openPrice - bufferPips * pipSize).toFixed(5))

    const previousSl = trade.stopLoss

    // Guard: don't widen risk. For buy, new SL must be > old SL (or old SL was null).
    // For sell, new SL must be < old SL (or old SL was null).
    if (trade.side === 'buy' && previousSl !== null && newSl <= previousSl) {
      return NextResponse.json({
        error: 'Break-even SL would widen risk (current SL is already at or beyond entry)',
        previousSl,
        newSl,
      }, { status: 400 })
    }
    if (trade.side === 'sell' && previousSl !== null && newSl >= previousSl) {
      return NextResponse.json({
        error: 'Break-even SL would widen risk (current SL is already at or beyond entry)',
        previousSl,
        newSl,
      }, { status: 400 })
    }

    const updated = await db.trade.update({
      where: { id },
      data: { stopLoss: newSl, updatedAt: new Date() },
    })

    await logInfo(
      'mt5',
      `Move to Break-Even: ${trade.symbol} ${trade.side.toUpperCase()} ${trade.lotSize} lot — SL ${previousSl ?? '—'} → ${newSl}${bufferPips > 0 ? ` (+${bufferPips}p buffer)` : ''}`,
      { tradeId: trade.id, symbol: trade.symbol, side: trade.side, previousSl, newSl, bufferPips },
    )

    try {
      await sendNotification(
        'trade_close',
        `🔴 Break-Even: ${trade.symbol} ${trade.side.toUpperCase()}`,
        `Stop-loss dipindah ke harga entry (${trade.openPrice})${bufferPips > 0 ? ` +${bufferPips}p buffer` : ''}.\n\nSL lama: ${previousSl ?? '—'}\nSL baru: ${newSl}\n\nTrade sekarang risk-free (no-loss scenario).`,
        'trader@finexfx.id',
      )
    } catch {
      // email failure is non-fatal
    }

    return NextResponse.json({
      trade: updated,
      previousSl,
      newSl,
      bufferPips,
      message: `SL dipindah ke break-even (${newSl})${bufferPips > 0 ? ` +${bufferPips}p buffer` : ''}`,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to move stop-loss to break-even' },
      { status: 500 },
    )
  }
}
