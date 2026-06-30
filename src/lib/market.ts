// Deterministic market simulation engine.
// Same formula is replicated in the mini-service price-feed so live ticks & API
// open/close prices stay consistent.

import { SYMBOL_BASE } from './types'

// Deterministic pseudo-random in [-1,1] from a seed
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/**
 * Current simulated mid price for a symbol at a given time (ms epoch).
 * Combines slow drift + intraday sine waves + tick noise.
 */
export function priceAt(symbol: string, t: number = Date.now()): number {
  const base = SYMBOL_BASE[symbol]
  if (!base) return 0
  const sec = t / 1000
  // multi-frequency waves
  const wave =
    Math.sin(sec / 90) * (base.pip * 6) +
    Math.sin(sec / 37) * (base.pip * 3) +
    Math.sin(sec / 13) * (base.pip * 1.5)
  // slow trend (per-hour)
  const trend = Math.sin(sec / 3600) * (base.pip * 25)
  // tick noise
  const tick = noise(t / 1000) * (base.pip * 1.2)
  const p = base.price + trend + wave + tick
  return Number(p.toFixed(base.digits))
}

export function bidAsk(symbol: string, t: number = Date.now()): { bid: number; ask: number; spread: number } {
  const mid = priceAt(symbol, t)
  const base = SYMBOL_BASE[symbol]
  // FINEX major spread from 0.0 pip; simulate ~0.4 pip typical, gold ~2 pip
  const spreadPips = symbol === 'XAUUSD' ? 2 : 0.4
  const spread = spreadPips * base.pip
  const bid = mid - spread / 2
  const ask = mid + spread / 2
  return {
    bid: Number(bid.toFixed(base.digits)),
    ask: Number(ask.toFixed(base.digits)),
    spread: Number(spread.toFixed(base.digits)),
  }
}

/**
 * P&L in account currency for a position.
 * For quote-currency pairs (XXX/USD) pnl = (exit-entry) * sideMultiplier * lot * contractSize.
 * USDJPY handled by dividing by exit. XAUUSD contract 100oz.
 */
export function calcPnl(
  symbol: string,
  side: 'buy' | 'sell',
  lot: number,
  openPrice: number,
  closePrice: number,
): { pnl: number; pips: number } {
  const base = SYMBOL_BASE[symbol]
  const dir = side === 'buy' ? 1 : -1
  const diff = (closePrice - openPrice) * dir
  const pips = diff / base.pip
  let valuePerPip: number
  if (symbol === 'USDJPY') {
    valuePerPip = (lot * 100000 * base.pip) / closePrice
  } else if (symbol === 'XAUUSD') {
    valuePerPip = lot * 100 * base.pip
  } else {
    valuePerPip = lot * 100000 * base.pip
  }
  const pnl = pips * valuePerPip
  return { pnl: Number(pnl.toFixed(2)), pips: Number(pips.toFixed(1)) }
}

/**
 * Lot size from risk % of balance, stop-loss pips, and value-per-pip.
 * lot = riskAmount / (slPips * valuePerPipPerLot)
 */
export function calcLotSize(
  symbol: string,
  balance: number,
  riskPct: number,
  slPips: number,
): number {
  const base = SYMBOL_BASE[symbol]
  const riskAmount = balance * (riskPct / 100)
  let valuePerPipPerLot: number
  const refPrice = base.price
  if (symbol === 'USDJPY') {
    valuePerPipPerLot = (100000 * base.pip) / refPrice
  } else if (symbol === 'XAUUSD') {
    valuePerPipPerLot = 100 * base.pip
  } else {
    valuePerPipPerLot = 100000 * base.pip
  }
  const lot = riskAmount / (slPips * valuePerPipPerLot)
  // round to 0.01
  return Number(Math.max(0.01, Math.floor(lot * 100) / 100).toFixed(2))
}

/**
 * Build a spark array of N price points ending now.
 */
export function sparkline(symbol: string, points: number = 40, t: number = Date.now()): number[] {
  const out: number[] = []
  const step = 5000 // 5s between points
  for (let i = points - 1; i >= 0; i--) {
    out.push(priceAt(symbol, t - i * step))
  }
  return out
}

export function dayHighLow(symbol: string, t: number = Date.now()): { high: number; low: number } {
  let hi = -Infinity
  let lo = Infinity
  // sample last 24h hourly
  for (let h = 0; h < 24; h++) {
    const p = priceAt(symbol, t - h * 3600 * 1000)
    hi = Math.max(hi, p)
    lo = Math.min(lo, p)
  }
  return { high: hi, low: lo }
}

/**
 * 24h change % vs 24h-ago price.
 */
export function changePct24h(symbol: string, t: number = Date.now()): number {
  const now = priceAt(symbol, t)
  const past = priceAt(symbol, t - 24 * 3600 * 1000)
  return Number((((now - past) / past) * 100).toFixed(2))
}
