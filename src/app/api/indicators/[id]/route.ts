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

    const existing = await db.indicator.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Indicator not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.enabled != null) data.enabled = Boolean(body.enabled)
    if (body.autoManaged != null) data.autoManaged = Boolean(body.autoManaged)
    if (body.weight != null) data.weight = Number(body.weight)

    const indicator = await db.indicator.update({ where: { id }, data })
    return NextResponse.json({ indicator })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
