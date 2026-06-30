import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { computeOverallAccuracy, computeRealAccuracy } from '@/lib/ai-evaluation'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/quality
 *
 * Returns AI signal quality metrics:
 * - Overall accuracy across all symbols
 * - Per-symbol accuracy breakdown
 * - Total signals evaluated
 * - Average pips moved per signal
 * - Confidence calibration stats
 *
 * Query params:
 *   symbol=EURUSD — get accuracy for a specific symbol only
 */
export async function GET(req: Request) {
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol')

    if (symbol) {
      const stats = await computeRealAccuracy(symbol, 100)
      return NextResponse.json({ symbol, stats })
    }

    const overall = await computeOverallAccuracy()
    return NextResponse.json(overall)
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to fetch AI quality metrics' },
      { status: 500 },
    )
  }
}
