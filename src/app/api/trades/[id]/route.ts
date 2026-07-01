import { NextRequest, NextResponse } from 'next/server'
import { db, trades, eq } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { tradeUpdateSchema, validateBody } from '@/lib/validations'
import { requireTrader } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  const limited = applyRateLimit(req, RATE_LIMITS.general)
  if (limited) return limited

  try {
    const { id } = await params
    const body = await req.json()

    const existing = await db.query.trades.findFirst({ where: eq(trades.id, id) })
    if (!existing) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (existing.status !== 'open') {
      return NextResponse.json(
        { error: 'Only open trades can be modified' },
        { status: 400 },
      )
    }

    const result = validateBody(tradeUpdateSchema, body)
    if (!result.success) return result.error
    const data = result.data

    const trade = await db.update(trades).set(data).where(eq(trades.id, id)).returning().then(r => r[0]!)
    return NextResponse.json({ trade })
  } catch (e) {
    return apiCatch(e, 'trades', 'PATCH', req)
  }
}