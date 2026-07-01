import { NextRequest, NextResponse } from 'next/server'
import { db, newsItems, eq, desc } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || undefined
    const impact = searchParams.get('impact') || undefined
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const news = await db.query.newsItems.findMany({
      where: category
        ? impact
          ? and(eq(newsItems.category, category), eq(newsItems.impact, impact))
          : eq(newsItems.category, category)
        : impact
          ? eq(newsItems.impact, impact)
          : undefined,
      orderBy: desc(newsItems.publishedAt),
      limit: Math.max(1, Math.min(500, limit)),
    })

    return NextResponse.json({ news })
  } catch (e) {
    return apiCatch(e, 'news', 'GET', req)
  }
}