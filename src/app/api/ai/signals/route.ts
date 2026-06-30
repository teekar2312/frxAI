import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || undefined
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const where: any = {}
    if (symbol) where.symbol = symbol

    const signals = await db.aiSignal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(200, limit)),
    })

    return NextResponse.json({ signals })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch signals' }, { status: 500 })
  }
}
