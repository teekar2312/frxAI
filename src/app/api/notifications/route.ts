import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const notifications = await db.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(500, limit)),
    })
    return NextResponse.json({ notifications })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to fetch notifications' },
      { status: 500 },
    )
  }
}
