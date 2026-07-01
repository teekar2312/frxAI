import { NextRequest, NextResponse } from 'next/server'
import { db, economicEvents, gte, lte, eq, and, asc } from '@/lib/db'
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

    const conditions = [gte(economicEvents.eventTime, from), lte(economicEvents.eventTime, to)]
    if (impact) conditions.push(eq(economicEvents.impact, impact))
    if (country) conditions.push(eq(economicEvents.country, country))
    if (status) conditions.push(eq(economicEvents.status, status))
    if (category) conditions.push(eq(economicEvents.category, category))

    const events = await db.query.economicEvents.findMany({
      where: and(...conditions),
      orderBy: asc(economicEvents.eventTime),
      limit,
    })

    return NextResponse.json({ events, total: events.length })
  } catch (e) {
    return apiCatch(e, 'economic-calendar', 'GET', req)
  }
}