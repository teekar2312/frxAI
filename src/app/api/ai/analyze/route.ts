import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyzeSymbol } from '@/lib/ai'

export const dynamic = 'force-dynamic'

const VALID_TIMEFRAMES = ['M1', 'M5', 'M15', 'H1'] as const
type Timeframe = (typeof VALID_TIMEFRAMES)[number]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const symbol = body?.symbol
    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 })
    }
    const timeframe: Timeframe = VALID_TIMEFRAMES.includes(body?.timeframe) ? body.timeframe : 'M5'

    const recentNewsRows = await db.newsItem.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 15,
    })
    const recentNews = recentNewsRows.map((n) => ({
      title: n.title,
      summary: n.summary,
      category: n.category,
      sentiment: n.sentiment,
      impact: n.impact,
    }))

    const enabledRows = await db.indicator.findMany({
      where: { enabled: true },
      select: { name: true },
    })
    const enabledIndicators = enabledRows.map((r) => r.name)

    const signal = await analyzeSymbol({ symbol, recentNews, enabledIndicators, timeframe })

    return NextResponse.json({ signal })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI analyze failed' }, { status: 500 })
  }
}
