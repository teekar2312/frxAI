import { NextRequest, NextResponse } from 'next/server'
import { db, aiSignals, eq, desc } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || undefined
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const signals = await db.query.aiSignals.findMany({
      where: symbol ? eq(aiSignals.symbol, symbol) : undefined,
      orderBy: desc(aiSignals.createdAt),
      limit: Math.max(1, Math.min(200, limit)),
    })

    return NextResponse.json({ signals })
  } catch (e) {
    return apiCatch(e, 'ai', 'GET', req)
  }
}