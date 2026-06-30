import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const indicators = await db.indicator.findMany({ orderBy: { weight: 'desc' } })
    return NextResponse.json({ indicators })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
