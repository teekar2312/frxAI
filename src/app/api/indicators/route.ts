import { NextResponse } from 'next/server'
import { db, indicators, desc } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const indicatorsList = await db.query.indicators.findMany({ orderBy: desc(indicators.weight) })
    return NextResponse.json({ indicators: indicatorsList })
  } catch (e) {
    return apiCatch(e, 'indicators', 'GET')
  }
}