import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// GET /api/trades/export?status=closed&accountId=&format=csv
// Exports closed trades as CSV for journal/analytics use.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'closed'
    const accountId = searchParams.get('accountId') || undefined

    const where: any = { status }
    if (accountId) where.accountId = accountId

    const trades = await db.trade.findMany({
      where,
      orderBy: { openTime: 'desc' },
      take: 1000,
    })

    const header = [
      'ID',
      'Symbol',
      'Side',
      'Lot',
      'OpenPrice',
      'ClosePrice',
      'StopLoss',
      'TakeProfit',
      'TrailingStop',
      'TrailingPips',
      'Pips',
      'PnL',
      'Commission',
      'Swap',
      'NetPnL',
      'Source',
      'Strategy',
      'Timeframe',
      'Comment',
      'OpenTime',
      'CloseTime',
      'DurationMin',
    ]

    const rows = trades.map((t) => {
      const open = new Date(t.openTime)
      const close = t.closeTime ? new Date(t.closeTime) : null
      const durationMin = close ? Math.round((close.getTime() - open.getTime()) / 60000) : ''
      const net = t.pnl - t.commission - t.swap
      return [
        t.id,
        t.symbol,
        t.side,
        t.lotSize,
        t.openPrice,
        t.closePrice ?? '',
        t.stopLoss ?? '',
        t.takeProfit ?? '',
        t.trailingStop ? 'YES' : 'NO',
        t.trailingPips,
        t.pips,
        t.pnl,
        t.commission,
        t.swap,
        Number(net.toFixed(2)),
        t.source,
        t.strategy,
        t.timeframe,
        (t.comment || '').replace(/,/g, ';').replace(/\n/g, ' '),
        open.toISOString(),
        close ? close.toISOString() : '',
        durationMin,
      ].join(',')
    })

    const csv = [header.join(','), ...rows].join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="finexfx-trades-${status}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  } catch (e) {
    return apiCatch(e, 'trades', 'GET', req)
  }
}
