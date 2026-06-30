import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// PATCH /api/trades/[id]/notes
// Updates the comment (journal note) on a trade — works for BOTH open and
// closed trades (unlike the main PATCH route which only allows open trades).
// This powers the trade journal feature in the analytics panel.
// Body: { comment: string | null }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const comment = body.comment != null
      ? (typeof body.comment === 'string' ? body.comment.slice(0, 500) : null)
      : null

    const existing = await db.trade.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    const trade = await db.trade.update({
      where: { id },
      data: { comment, updatedAt: new Date() },
    })

    await logInfo(
      'mt5',
      `Trade note updated: ${existing.symbol} ${existing.side.toUpperCase()} — "${comment ?? '(cleared)'}"`,
      { tradeId: id, previousComment: existing.comment, newComment: comment },
    )

    return NextResponse.json({ trade })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to update trade note' },
      { status: 500 },
    )
  }
}
