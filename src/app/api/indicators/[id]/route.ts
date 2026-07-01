import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { indicatorUpdateSchema, validateBody } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = applyRateLimit(req, RATE_LIMITS.indicatorUpdate)
  if (limited) return limited

  try {
    const { id } = await params
    const body = await req.json()

    const existing = await db.indicator.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Indicator not found' }, { status: 404 })
    }

    const result = validateBody(indicatorUpdateSchema, body)
    if (!result.success) return result.error
    const data = result.data

    const indicator = await db.indicator.update({ where: { id }, data })
    return NextResponse.json({ indicator })
  } catch (e) {
    return apiCatch(e, 'indicators', 'PATCH', req)
  }
}