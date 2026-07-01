import { NextRequest, NextResponse } from 'next/server'
import { getTick } from '@/lib/mt5-client'
import { bidAsk } from '@/lib/market'
import { SUPPORTED_SYMBOLS } from '@/lib/types'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mt5/tick?symbol=EURUSD
 *
 * Returns current bid/ask for a symbol. Tries MT5 bridge first; if the bridge
 * is offline or the symbol isn't found, falls back to the local synthetic price.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol')
    if (!symbol || !SUPPORTED_SYMBOLS.includes(symbol)) {
      return NextResponse.json({ error: 'Valid symbol is required' }, { status: 400 })
    }

    // Try bridge first
    const tick = await getTick(symbol)
    if (tick) {
      return NextResponse.json({
        tick,
        source: 'mt5-bridge',
      })
    }

    // Fallback to local synthetic
    const local = bidAsk(symbol)
    return NextResponse.json({
      tick: {
        symbol,
        bid: local.bid,
        ask: local.ask,
        spread: local.spread,
        time: new Date().toISOString(),
      },
      source: 'synthetic-fallback',
    })
  } catch (e) {
    return apiCatch(e, 'mt5', 'GET', req)
  }
}