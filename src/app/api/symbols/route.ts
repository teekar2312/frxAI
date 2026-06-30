import { NextResponse } from 'next/server'
import { bidAsk, priceAt, sparkline, dayHighLow, changePct24h } from '@/lib/market'
import { SUPPORTED_SYMBOLS, SYMBOL_BASE, type SymbolQuote } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const symbols: SymbolQuote[] = SUPPORTED_SYMBOLS.map((sym) => {
      const { bid, ask, spread } = bidAsk(sym)
      const price = priceAt(sym)
      const spark = sparkline(sym, 40)
      const { high, low } = dayHighLow(sym)
      const changePct = changePct24h(sym)
      return {
        symbol: sym,
        price,
        bid,
        ask,
        spread,
        changePct,
        high,
        low,
        pip: SYMBOL_BASE[sym].pip,
        spark,
        updatedAt: new Date().toISOString(),
      }
    })

    return NextResponse.json({ symbols })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
