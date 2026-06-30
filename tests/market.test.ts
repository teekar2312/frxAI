// Unit tests for market.ts — P&L calculation, pip distance, lot sizing.
// These are the most critical business logic: incorrect P&L = wrong money.

import { test, describe, expect } from 'bun:test'
import {
  priceAt,
  bidAsk,
  calcPnl,
  calcLotSize,
  sparkline,
  dayHighLow,
  changePct24h,
} from '../src/lib/market'

describe('priceAt', () => {
  test('returns a positive number for valid symbols', () => {
    const price = priceAt('EURUSD', Date.now())
    expect(price).toBeGreaterThan(1.0)
    expect(price).toBeLessThan(1.1)
  })

  test('USDJPY price is around 156', () => {
    const price = priceAt('USDJPY', Date.now())
    expect(price).toBeGreaterThan(155)
    expect(price).toBeLessThan(158)
  })

  test('XAUUSD price is around 2335', () => {
    const price = priceAt('XAUUSD', Date.now())
    expect(price).toBeGreaterThan(2330)
    expect(price).toBeLessThan(2340)
  })

  test('returns 0 for unknown symbol', () => {
    expect(priceAt('UNKNOWN', Date.now())).toBe(0)
  })

  test('is deterministic — same time = same price', () => {
    const t = 1700000000000
    expect(priceAt('EURUSD', t)).toBe(priceAt('EURUSD', t))
  })
})

describe('bidAsk', () => {
  test('bid < ask (spread is positive)', () => {
    const { bid, ask, spread } = bidAsk('EURUSD', Date.now())
    expect(bid).toBeLessThan(ask)
    expect(spread).toBeGreaterThan(0)
  })

  test('XAUUSD has wider spread than EURUSD', () => {
    const t = Date.now()
    const fx = bidAsk('EURUSD', t)
    const gold = bidAsk('XAUUSD', t)
    expect(gold.spread).toBeGreaterThan(fx.spread)
  })

  test('mid price = (bid + ask) / 2', () => {
    const { bid, ask } = bidAsk('GBPUSD', Date.now())
    const mid = (bid + ask) / 2
    expect(mid).toBeGreaterThan(1.26)
    expect(mid).toBeLessThan(1.28)
  })
})

describe('calcPnl', () => {
  test('BUY profit when price goes up', () => {
    // EURUSD buy 0.10 lot, open 1.0850, close 1.0860 → +10 pips
    // valuePerPip = 0.10 × 100000 × 0.0001 = $1/pip → 10 pips = $10
    const { pnl, pips } = calcPnl('EURUSD', 'buy', 0.10, 1.0850, 1.0860)
    expect(pips).toBe(10)
    expect(pnl).toBeGreaterThan(0)
    expect(pnl).toBe(10)
  })

  test('BUY loss when price goes down', () => {
    const { pnl, pips } = calcPnl('EURUSD', 'buy', 0.10, 1.0850, 1.0840)
    expect(pips).toBe(-10)
    expect(pnl).toBe(-10)
  })

  test('SELL profit when price goes down', () => {
    const { pnl, pips } = calcPnl('EURUSD', 'sell', 0.10, 1.0850, 1.0840)
    expect(pips).toBe(10)
    expect(pnl).toBe(10)
  })

  test('SELL loss when price goes up', () => {
    const { pnl, pips } = calcPnl('EURUSD', 'sell', 0.10, 1.0850, 1.0860)
    expect(pips).toBe(-10)
    expect(pnl).toBe(-10)
  })

  test('zero P&L when open == close', () => {
    const { pnl, pips } = calcPnl('EURUSD', 'buy', 0.50, 1.0850, 1.0850)
    expect(pips).toBe(0)
    expect(pnl).toBe(0)
  })

  test('XAUUSD P&L uses 100 oz contract size', () => {
    // XAUUSD buy 1.0 lot, open 2335, close 2345 → +100 pips (pip=0.1)
    const { pnl, pips } = calcPnl('XAUUSD', 'buy', 1.0, 2335.0, 2345.0)
    expect(pips).toBe(100)
    // valuePerPip = 1.0 lot × 100 oz × 0.1 pip = $10 per pip → 100 pips = $1000
    expect(pnl).toBe(1000)
  })

  test('larger lot = proportionally larger P&L', () => {
    const small = calcPnl('EURUSD', 'buy', 0.10, 1.0850, 1.0860)
    const large = calcPnl('EURUSD', 'buy', 1.00, 1.0850, 1.0860)
    expect(large.pnl).toBe(small.pnl * 10)
  })
})

describe('calcLotSize', () => {
  test('calculates lot from risk %, balance, SL pips', () => {
    // Balance $10000, risk 1% = $100, SL 10 pips
    // EURUSD: valuePerPipPerLot = 100000 × 0.0001 = $10
    // lot = 100 / (10 × 10) = 1.0
    const lot = calcLotSize('EURUSD', 10000, 1.0, 10)
    expect(lot).toBeGreaterThan(0)
    expect(lot).toBeLessThanOrEqual(1.0)
  })

  test('returns minimum 0.01 lot', () => {
    // Very small risk + very wide SL → should floor at 0.01
    const lot = calcLotSize('EURUSD', 100, 0.1, 500)
    expect(lot).toBeGreaterThanOrEqual(0.01)
  })

  test('larger balance allows larger lot', () => {
    const small = calcLotSize('EURUSD', 1000, 1.0, 10)
    const large = calcLotSize('EURUSD', 100000, 1.0, 10)
    expect(large).toBeGreaterThan(small)
  })
})

describe('sparkline', () => {
  test('returns array of specified length', () => {
    const spark = sparkline('EURUSD', 40, Date.now())
    expect(spark).toHaveLength(40)
  })

  test('values are positive and near base price', () => {
    const spark = sparkline('EURUSD', 10, Date.now())
    for (const p of spark) {
      expect(p).toBeGreaterThan(1.0)
      expect(p).toBeLessThan(1.1)
    }
  })
})

describe('dayHighLow', () => {
  test('high > low', () => {
    const { high, low } = dayHighLow('EURUSD', Date.now())
    expect(high).toBeGreaterThan(low)
  })
})

describe('changePct24h', () => {
  test('returns a finite number', () => {
    const pct = changePct24h('EURUSD', Date.now())
    expect(Number.isFinite(pct)).toBe(true)
    expect(Math.abs(pct)).toBeLessThan(5) // less than 5% daily change
  })
})
