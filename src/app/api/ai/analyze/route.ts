import { NextRequest, NextResponse } from 'next/server'
import { db, newsItems, indicators, eq, desc } from '@/lib/db'
import { analyzeSymbol } from '@/lib/ai'
import { requireAuth } from '@/lib/auth-server'
import { apiCatch } from '@/lib/api-handler'
import { audit } from '@/lib/audit'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBody, aiAnalyzeSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Auth guard
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.aiAnalyze)
  if (limited) return limited

  try {
    const body = await req.json().catch(() => ({}))

    // Zod validation
    const validated = validateBody(aiAnalyzeSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }
    const { symbol, timeframe } = validated.data

    const recentNewsRows = await db.query.newsItems.findMany({
      orderBy: desc(newsItems.publishedAt),
      limit: 15,
    })
    const recentNews = recentNewsRows.map((n) => ({
      title: n.title,
      summary: n.summary,
      category: n.category,
      sentiment: n.sentiment,
      impact: n.impact,
    }))

    const enabledRows = await db.select({ name: indicators.name }).from(indicators).where(eq(indicators.enabled, true))
    const enabledIndicators = enabledRows.map((r) => r.name)

    const signal = await analyzeSymbol({ symbol, recentNews, enabledIndicators, timeframe })

    await audit({
      action: 'ai.signal',
      actor: user.email,
      resource: symbol,
      resourceType: 'ai-signal',
      details: { timeframe, confidence: signal?.confidence, direction: signal?.direction },
    })

    return NextResponse.json({ signal })
  } catch (e) {
    return apiCatch(e, 'ai', 'POST', req)
  }
}