import { NextRequest, NextResponse } from 'next/server'
import { db, notifications, desc } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const notifs = await db.query.notifications.findMany({
      orderBy: desc(notifications.createdAt),
      limit: Math.max(1, Math.min(500, limit)),
    })
    return NextResponse.json({ notifications: notifs })
  } catch (e) {
    return apiCatch(e, 'notifications', 'GET', req)
  }
}