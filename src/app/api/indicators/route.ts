import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const indicators = await db.indicator.findMany({ orderBy: { weight: 'desc' } })
    return NextResponse.json({ indicators })
  } catch (e) {
    return apiCatch(e, 'indicators', 'GET')
  }
}