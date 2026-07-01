import { NextRequest, NextResponse } from 'next/server'
import { db, indicators, eq, desc } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { requireTrader } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

// Simple heuristic for AI indicator re-selection:
// - Top 12 by weight get autoManaged=true & enabled
// - Plus always enable: ATR, Bollinger, VWAP
// - Enable trend+oscillator with weight > 0.7
// - Disable the rest but keep autoManaged flag for future re-pick
export async function POST(req: NextRequest) {
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.aiIndicatorSelect)
  if (limited) return limited

  try {
    const all = await db.query.indicators.findMany({ orderBy: desc(indicators.weight) })
    const alwaysOn = new Set(['ATR', 'Bollinger Bands', 'Bollinger', 'VWAP'])

    const top12Ids = new Set(all.slice(0, 12).map((i) => i.id))

    const updates = all.map((ind) => {
      const nameLower = ind.name.toLowerCase()
      const isAlwaysOn =
        alwaysOn.has(ind.name) ||
        nameLower.includes('atr') ||
        nameLower.includes('bollinger') ||
        nameLower.includes('vwap')
      const isStrongTrendOrOsc =
        (ind.category === 'trend' || ind.category === 'oscillator') && ind.weight > 0.7
      const inTop = top12Ids.has(ind.id)
      const shouldEnable = isAlwaysOn || isStrongTrendOrOsc || inTop
      const autoManaged = true

      return db.update(indicators).set({ enabled: shouldEnable, autoManaged }).where(eq(indicators.id, ind.id))
    })

    await Promise.all(updates)

    // Re-fetch all indicators after updates
    const updatedIndicators = await db.query.indicators.findMany({ orderBy: desc(indicators.weight) })

    await logInfo('ai', 'AI re-selected indicator pool', {
      total: updatedIndicators.length,
      enabled: updatedIndicators.filter((i) => i.enabled).length,
    })

    return NextResponse.json({ indicators: updatedIndicators })
  } catch (e) {
    return apiCatch(e, 'indicators', 'POST', req)
  }
}