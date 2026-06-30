import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()

    const existing = await db.trade.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (existing.status !== 'open') {
      return NextResponse.json(
        { error: 'Only open trades can be modified' },
        { status: 400 },
      )
    }

    const data: Record<string, unknown> = {}
    if (body.stopLoss != null) data.stopLoss = Number(body.stopLoss)
    if (body.takeProfit != null) data.takeProfit = Number(body.takeProfit)
    if (body.trailingStop != null) data.trailingStop = Boolean(body.trailingStop)
    if (body.trailingPips != null) data.trailingPips = Number(body.trailingPips)
    if (body.comment !== undefined) data.comment = body.comment ? String(body.comment) : null

    const trade = await db.trade.update({ where: { id }, data })
    return NextResponse.json({ trade })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
