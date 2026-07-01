import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// GET /api/economic-calendar?days=7&impact=&country=&status=&limit=50
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '7')
    const impact = searchParams.get('impact') || undefined
    const country = searchParams.get('country') || undefined
    const status = searchParams.get('status') || undefined
    const category = searchParams.get('category') || undefined
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200)

    const from = new Date()
    from.setUTCDate(from.getUTCDate() - 2) // include recent past
    const to = new Date()
    to.setUTCDate(to.getUTCDate() + days)

    const where: any = {
      eventTime: { gte: from, lte: to },
    }
    if (impact) where.impact = impact
    if (country) where.country = country
    if (status) where.status = status
    if (category) where.category = category

    const events = await db.economicEvent.findMany({
      where,
      orderBy: { eventTime: 'asc' },
      take: limit,
    })

    return NextResponse.json({ events, total: events.length })
  } catch (e) {
    return apiCatch(e, 'economic-calendar', 'GET', req)
  }
}