import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || undefined
    const impact = searchParams.get('impact') || undefined
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const where: any = {}
    if (category) where.category = category
    if (impact) where.impact = impact

    const news = await db.newsItem.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: Math.max(1, Math.min(500, limit)),
    })

    return NextResponse.json({ news })
  } catch (e) {
    return apiCatch(e, 'news', 'GET', req)
  }
}