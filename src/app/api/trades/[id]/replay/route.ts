import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'
import { getBars, bridgeHealth, type MT5Bar, type MT5Timeframe } from '@/lib/mt5-client'
import { priceAt, SYMBOL_BASE } from '@/lib/market'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trades/[id]/replay
 *
 * Returns price history for a trade's open→close period, suitable for
 * charting in the Trade Replay dialog.
 *
 * Tries to fetch REAL bars from the MT5 bridge first. If the bridge is
 * offline or doesn't have data for the period, falls back to the synthetic
 * priceAt formula (same as before, but now clearly marked as fallback).
 *
 * Returns: {
 *   source: 'mt5-bridge' | 'synthetic-fallback',
 *   bars: Array<{ time, price, open?, high?, low?, close? }>,
 *   trade: { openPrice, closePrice, stopLoss, takeProfit, openTime, closeTime, side, pnl, pips }
 * }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  try {
    const { id } = await params
    const trade = await db.trade.findUnique({ where: { id } })
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }

    const openT = new Date(trade.openTime).getTime()
    const closeT = trade.closeTime ? new Date(trade.closeTime).getTime() : Date.now()
    const startT = openT - 10 * 60 * 1000 // 10 min before entry
    const endT = closeT + 10 * 60 * 1000 // 10 min after exit

    // Determine how many bars we need (1-min candles)
    const durationMs = endT - startT
    const barCount = Math.min(500, Math.max(20, Math.floor(durationMs / 60_000)))

    let bars: Array<{ time: string; t: number; price: number; open?: number; high?: number; low?: number; close?: number }> = []
    let source: 'mt5-bridge' | 'synthetic-fallback' = 'synthetic-fallback'

    // ── 1. Try MT5 bridge first ────────────────────────────────────────────────
    const health = await bridgeHealth()
    if (health.ok) {
      try {
        const timeframe: MT5Timeframe = (trade.timeframe as MT5Timeframe) || 'M1'
        const bridgeBars = await getBars(trade.symbol, timeframe, barCount)

        if (bridgeBars.length > 0) {
          // Filter bars to our time window + map to chart format
          bars = bridgeBars
            .filter((b: MT5Bar) => {
              const bt = new Date(b.time).getTime()
              return bt >= startT && bt <= endT
            })
            .map((b: MT5Bar) => ({
              time: new Date(b.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              t: new Date(b.time).getTime(),
              price: b.close,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
            }))
          source = 'mt5-bridge'
        }
      } catch (e) {
        // Bridge call failed — fall through to synthetic
        console.error('Replay: bridge bars fetch failed:', e)
      }
    }

    // ── 2. Fallback: synthetic priceAt formula ─────────────────────────────────
    if (bars.length === 0) {
      const base = SYMBOL_BASE[trade.symbol]
      if (base) {
        const interval = 60 * 1000 // 1-min candles
        for (let t = startT; t <= endT; t += interval) {
          const price = priceAt(trade.symbol, t)
          bars.push({
            time: new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            t,
            price: Number(price.toFixed(base.digits)),
          })
        }
        source = 'synthetic-fallback'
      }
    }

    return NextResponse.json({
      source,
      bars,
      trade: {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        openPrice: trade.openPrice,
        closePrice: trade.closePrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit,
        openTime: trade.openTime,
        closeTime: trade.closeTime,
        lotSize: trade.lotSize,
        pnl: trade.pnl,
        pips: trade.pips,
        source: trade.source,
        mt5Ticket: trade.mt5Ticket,
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to fetch replay data' },
      { status: 500 },
    )
  }
}
