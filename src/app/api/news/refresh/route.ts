import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo, logError } from '@/lib/logger'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

interface DraftNews {
  title: string
  summary: string
  category: string
  impact: string
  sentiment: string
  symbols: string
}

const FALLBACK: DraftNews[] = [
  {
    title: 'BREAKING: Fed signals patient approach amid mixed data',
    summary:
      'Federal Reserve officials struck a cautious tone in latest commentary, signaling no urgency to adjust rates while monitoring inflation trajectory and labor market strength.',
    category: 'breaking',
    impact: 'high',
    sentiment: 'neutral',
    symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD',
  },
  {
    title: 'ECB holds rates steady, hints at data-dependent path',
    summary:
      'The European Central Bank kept its key rate unchanged and reiterated a data-dependent approach, weighing disinflation progress against persistent services inflation.',
    category: 'central_bank',
    impact: 'high',
    sentiment: 'bearish',
    symbols: 'EURUSD,GBPUSD',
  },
  {
    title: 'US CPI prints softer than expected, dollar slips',
    summary:
      'Headline CPI came in below consensus at 0.2% m/m, cooling rate-hike bets and pressuring the greenback across majors. Gold gained on real-yield pullback.',
    category: 'cpi',
    impact: 'high',
    sentiment: 'bullish',
    symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD',
  },
]

export async function POST(req: NextRequest) {
  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.newsRefresh)
  if (limited) return limited

  try {
    const drafts: DraftNews[] = []

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ZAI = require('z-ai-web-dev-sdk').default
      const zai = await ZAI.create()
      const res = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'You are a forex news synthesizer. Output ONLY a valid JSON array, no markdown, no commentary.',
          },
          {
            role: 'user',
            content: `Generate 6 fresh, realistic forex/macro news headlines across the 7 analysis dimensions:
1. central_bank (Fed/ECB/BOJ/BOE policy)
2. nfp (US labor market)
3. cpi (US/EZ inflation)
4. geopolitical (wars, elections, trade tensions)
5. fiscal (govt spending, debt, tax)
6. commodity (gold/oil moves)
7. sentiment (risk-on/off positioning)

Each item MUST be a JSON object with EXACTLY these fields:
{ "title": string, "summary": string, "category": one of [central_bank,nfp,cpi,ppi,gdp,unemployment,retail,pmi,geopolitical,fiscal,commodity,sentiment,breaking], "impact": "low"|"medium"|"high", "sentiment": "bullish"|"bearish"|"neutral", "symbols": "comma-separated EURUSD,USDJPY,GBPUSD,XAUUSD" }

Return ONLY the JSON array.`,
          },
        ],
        temperature: 0.7,
      })
      const content = res.choices?.[0]?.message?.content ?? ''
      const match = content.match(/\[[\s\S]*\]/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (Array.isArray(parsed)) {
          for (const p of parsed) {
            if (p && p.title && p.category) {
              drafts.push({
                title: String(p.title),
                summary: String(p.summary ?? ''),
                category: String(p.category),
                impact: String(p.impact ?? 'medium'),
                sentiment: String(p.sentiment ?? 'neutral'),
                symbols: String(p.symbols ?? ''),
              })
            }
          }
        }
      }
    } catch (e: any) {
      await logError('ai', 'News refresh LLM call failed', e?.stack || String(e))
    }

    if (drafts.length === 0) {
      drafts.push(...FALLBACK)
    }

    const now = new Date()
    const created: any[] = []
    for (const d of drafts) {
      const item = await db.newsItem.create({
        data: {
          source: 'marketaux',
          title: d.title,
          summary: d.summary,
          url: null,
          category: d.category,
          impact: d.impact,
          sentiment: d.sentiment,
          symbols: d.symbols,
          publishedAt: now,
        },
      })
      created.push(item)
    }

    await logInfo('ai', `News refreshed: ${created.length} items`, {
      categories: drafts.map((d) => d.category),
    })

    return NextResponse.json({ news: created })
  } catch (e) {
    return apiCatch(e, 'ai', 'POST', req)
  }
}