import { NextRequest, NextResponse } from 'next/server'
import { db, trades, eq } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { tradeNotesSchema, validateBody } from '@/lib/validations'
import { requireAuth } from '@/lib/auth-server'

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
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  const limited = applyRateLimit(req, RATE_LIMITS.tradeNote)
  if (limited) return limited

  try {
    const { id } = await params
    const body = await req.json()
    const result = validateBody(tradeNotesSchema, body)
    if (!result.success) return result.error
    const comment = result.data.comment

    const existing = await db.query.trades.findFirst({ where: eq(trades.id, id) })
    if (!existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    const trade = await db.update(trades).set({ comment }).where(eq(trades.id, id)).returning().then(r => r[0]!)

    await logInfo(
      'mt5',
      `Trade note updated: ${existing.symbol} ${existing.side.toUpperCase()} — "${comment ?? '(cleared)'}"`,
      { tradeId: id, previousComment: existing.comment, newComment: comment },
    )

    return NextResponse.json({ trade })
  } catch (e) {
    return apiCatch(e, 'trades', 'PATCH', req)
  }
}