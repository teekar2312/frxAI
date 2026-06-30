// Comprehensive unit tests for trading math: PnL, pip, lot size, bid/ask, edge cases.
// Tests the core financial calculations that determine profit/loss and position sizing.

import { describe, test, expect, beforeAll } from 'bun:test'
import { calcPnl, bidAsk, calcLotSize } from '../src/lib/market'
import { SYMBOL_BASE, SUPPORTED_SYMBOLS } from '../src/lib/types'

// ---------------------------------------------------------------------------
// Re-implementation reference (for documentation & comparison when needed)
// ---------------------------------------------------------------------------
// The project's actual functions are imported above.  The logic below mirrors
// them so that each test can document the EXPECTED formula even if the import
// were to fail in some environments.
//
// calcPnl(symbol, side, lot, openPrice, closePrice):
//   dir     = side === 'buy' ? 1 : -1
//   diff    = (closePrice - openPrice) * dir
//   pips    = diff / SYMBOL_BASE[symbol].pip
//   EURUSD / GBPUSD:  valuePerPip = lot * 100_000 * pip
//   USDJPY:          valuePerPip = (lot * 100_000 * pip) / closePrice
//   XAUUSD:          valuePerPip = lot * 100 * pip
//   pnl     = pips * valuePerPip   (rounded to 2 dp; pips rounded to 1 dp)
//
// calcLotSize(symbol, balance, riskPct, slPips):
//   riskAmount       = balance * (riskPct / 100)
//   valuePerPipPerLot:
//     EURUSD / GBPUSD:  100_000 * pip
//     USDJPY:          (100_000 * pip) / SYMBOL_BASE[symbol].price
//     XAUUSD:          100 * pip
//   lot = riskAmount / (slPips * valuePerPipPerLot)
//   return Math.max(0.01, Math.floor(lot * 100) / 100)  → toFixed(2)
// ---------------------------------------------------------------------------

describe('Trading Math — PnL Calculations', () => {
  test('Buy EURUSD: open 1.1000, close 1.1050 → +50 pips, +$500 (1.0 lot)', () => {
    const { pnl, pips } = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.105)
    // diff = (1.105 - 1.1) * 1 = 0.005; pips = 0.005/0.0001 = 50
    // valuePerPip = 1.0 * 100000 * 0.0001 = $10; pnl = 50 * $10 = $500
    expect(pips).toBe(50)
    expect(pnl).toBe(500)
  })

  test('Sell EURUSD: open 1.1050, close 1.1000 → +50 pips, +$500 (1.0 lot)', () => {
    const { pnl, pips } = calcPnl('EURUSD', 'sell', 1.0, 1.105, 1.1)
    // diff = (1.1 - 1.105) * -1 = 0.005; pips = 50; pnl = 50 * 10 = 500
    expect(pips).toBe(50)
    expect(pnl).toBe(500)
  })

  test('Buy EURUSD: open 1.1000, close 1.0950 → -50 pips, -$500 (1.0 lot)', () => {
    const { pnl, pips } = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.095)
    // diff = (1.095 - 1.1) * 1 = -0.005; pips = -50; pnl = -50 * 10 = -500
    expect(pips).toBe(-50)
    expect(pnl).toBe(-500)
  })

  test('Sell USDJPY: open 150.00, close 149.50 → +50 pips profit', () => {
    const { pnl, pips } = calcPnl('USDJPY', 'sell', 1.0, 150.0, 149.5)
    // diff = (149.5 - 150.0) * -1 = 0.50; pips = 0.50/0.01 = 50
    // valuePerPip = (1.0 * 100000 * 0.01) / 149.5 = 1000/149.5 ≈ 6.68896
    // pnl = 50 * 6.68896 ≈ 334.45
    expect(pips).toBe(50)
    expect(pnl).toBe(334.45)
  })

  test('Buy XAUUSD: open 2000.00, close 2010.00 → +100 pips, +$1000 (1.0 lot)', () => {
    const { pnl, pips } = calcPnl('XAUUSD', 'buy', 1.0, 2000.0, 2010.0)
    // diff = 10; pips = 10/0.1 = 100
    // valuePerPip = 1.0 * 100 * 0.1 = $10; pnl = 100 * 10 = $1000
    expect(pips).toBe(100)
    expect(pnl).toBe(1000)
  })

  test('Sell XAUUSD: open 2010.00, close 2000.00 → +100 pips, +$1000 (1.0 lot)', () => {
    const { pnl, pips } = calcPnl('XAUUSD', 'sell', 1.0, 2010.0, 2000.0)
    // diff = (2000 - 2010) * -1 = 10; pips = 100; pnl = 1000
    expect(pips).toBe(100)
    expect(pnl).toBe(1000)
  })

  test('Zero PnL when close price equals open price', () => {
    const buy = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.1)
    expect(buy.pips).toBe(0)
    expect(buy.pnl).toBe(0)

    const sell = calcPnl('XAUUSD', 'sell', 2.5, 2000.0, 2000.0)
    expect(sell.pips).toBe(0)
    expect(sell.pnl).toBe(0)
  })

  test('Multi-lot PnL: 0.5 lot vs 1.0 lot with same pips produce different $ amounts', () => {
    const half = calcPnl('EURUSD', 'buy', 0.5, 1.1, 1.105)  // +50 pips
    const full = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.105)  // +50 pips

    // Both should be exactly 50 pips
    expect(half.pips).toBe(50)
    expect(full.pips).toBe(50)

    // PnL should double proportionally
    expect(half.pnl).toBe(250)   // 50 pips × $5/pip
    expect(full.pnl).toBe(500)   // 50 pips × $10/pip
    expect(full.pnl).toBe(half.pnl * 2)
  })

  test('Multi-lot PnL also works for XAUUSD', () => {
    const small = calcPnl('XAUUSD', 'buy', 0.1, 2000.0, 2010.0)  // +100 pips
    const big = calcPnl('XAUUSD', 'buy', 1.0, 2000.0, 2010.0)    // +100 pips

    expect(small.pips).toBe(100)
    expect(big.pips).toBe(100)
    // valuePerPip = lot * 100 * 0.1 = lot * 10
    expect(small.pnl).toBe(100)   // 100 pips × $1/pip
    expect(big.pnl).toBe(1000)    // 100 pips × $10/pip
  })

  test('GBPUSD PnL follows same math as EURUSD (XXX/USD pairs)', () => {
    // GBPUSD buy 0.5 lot, open 1.2700, close 1.2750 → +50 pips
    const { pnl, pips } = calcPnl('GBPUSD', 'buy', 0.5, 1.27, 1.275)
    expect(pips).toBe(50)
    // valuePerPip = 0.5 * 100000 * 0.0001 = $5
    expect(pnl).toBe(250)
  })
})

// ---------------------------------------------------------------------------
describe('Trading Math — Pip Calculations', () => {
  test('EURUSD pip size is 0.0001', () => {
    expect(SYMBOL_BASE['EURUSD'].pip).toBe(0.0001)
  })

  test('USDJPY pip size is 0.01', () => {
    expect(SYMBOL_BASE['USDJPY'].pip).toBe(0.01)
  })

  test('XAUUSD pip size is 0.1', () => {
    expect(SYMBOL_BASE['XAUUSD'].pip).toBe(0.1)
  })

  test('GBPUSD pip size is 0.0001 (same as EURUSD)', () => {
    expect(SYMBOL_BASE['GBPUSD'].pip).toBe(0.0001)
  })

  test('Correct pip count for 10-pip EURUSD movement', () => {
    const { pips } = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.101)
    expect(pips).toBe(10)  // 0.001 / 0.0001 = 10
  })

  test('Correct pip count for 10-pip USDJPY movement', () => {
    const { pips } = calcPnl('USDJPY', 'buy', 1.0, 150.0, 150.1)
    expect(pips).toBe(10)  // 0.10 / 0.01 = 10
  })

  test('Correct pip count for 10-pip XAUUSD movement', () => {
    const { pips } = calcPnl('XAUUSD', 'buy', 1.0, 2000.0, 2001.0)
    expect(pips).toBe(10)  // 1.0 / 0.1 = 10
  })

  test('Fractional pip (0.5 pip) is correctly computed', () => {
    const { pips } = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.10005)
    // diff = 0.00005; pips = 0.00005 / 0.0001 = 0.5
    expect(pips).toBe(0.5)
  })

  test('Negative pip count for losing buy trade', () => {
    const { pips } = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.099)
    // diff = -0.001; pips = -0.001 / 0.0001 = -10
    expect(pips).toBe(-10)
  })

  test('Large pip movement (1000 pips) computes correctly', () => {
    const { pips, pnl } = calcPnl('EURUSD', 'buy', 1.0, 1.0, 1.1)
    // diff = 0.1; pips = 0.1 / 0.0001 = 1000
    expect(pips).toBe(1000)
    expect(pnl).toBe(10000)  // 1000 pips × $10/pip
  })
})

// ---------------------------------------------------------------------------
describe('Trading Math — Lot Size Calculations', () => {
  test('Standard risk per trade: $10k balance, 2% risk, 50-pip SL → 0.40 lot EURUSD', () => {
    // riskAmount = 10000 * 0.02 = $200
    // valuePerPipPerLot = 100000 * 0.0001 = $10
    // lot = 200 / (50 * 10) = 0.4
    const lot = calcLotSize('EURUSD', 10000, 2, 50)
    expect(lot).toBe(0.4)
  })

  test('Lot size has minimum floor of 0.01 for typical inputs', () => {
    // Small account, moderate risk
    const small = calcLotSize('EURUSD', 1000, 1, 20)
    expect(small).toBeGreaterThanOrEqual(0.01)
    // riskAmount = 1000 * 0.01 = $10; lot = 10 / (20 * 10) = 0.05
    expect(small).toBe(0.05)
  })

  test('Lot size is NOT capped at an upper bound (large accounts can exceed 10 lots)', () => {
    // The function only enforces a floor (0.01), no ceiling.
    // $100k at 5% risk with 20-pip SL → riskAmount = $5000; lot = 5000/200 = 25
    const large = calcLotSize('EURUSD', 100000, 5, 20)
    expect(large).toBe(25)
    // Upper-bound enforcement (if desired) is the caller's responsibility.
  })

  test('Higher risk % produces larger lot size', () => {
    const conservative = calcLotSize('EURUSD', 10000, 1, 50)
    const aggressive = calcLotSize('EURUSD', 10000, 5, 50)
    expect(aggressive).toBeGreaterThan(conservative)
  })

  test('Higher SL pips produces smaller lot size', () => {
    const tightSL = calcLotSize('EURUSD', 10000, 2, 20)
    const wideSL = calcLotSize('EURUSD', 10000, 2, 100)
    expect(wideSL).toBeLessThan(tightSL)
  })

  test('Larger balance produces larger lot size', () => {
    const small = calcLotSize('EURUSD', 1000, 2, 50)
    const large = calcLotSize('EURUSD', 100000, 2, 50)
    expect(large).toBeGreaterThan(small)
  })

  test('Lot size is floored to 0.01 (never a fraction smaller than 0.01)', () => {
    // Very small account → tiny risk amount → should clamp to 0.01
    const lot = calcLotSize('EURUSD', 10, 1, 50)
    // riskAmount = 10 * 0.01 = $0.10; lot = 0.10 / 500 = 0.0002 → floor → 0.00 → clamped to 0.01
    expect(lot).toBe(0.01)
  })

  test('USDJPY lot size accounts for JPY conversion rate', () => {
    // EURUSD and USDJPY at same balance/risk/SL should differ because
    // USDJPY valuePerPipPerLot = 1000 / 156.4 ≈ 6.394 vs EURUSD = 10
    const eurLot = calcLotSize('EURUSD', 10000, 2, 50)
    const jpyLot = calcLotSize('USDJPY', 10000, 2, 50)
    // Since JPY valuePerPipPerLot is smaller, the lot should be larger
    expect(jpyLot).toBeGreaterThan(eurLot)
  })

  test('XAUUSD lot size uses 100 oz contract (same valuePerPipPerLot as EURUSD = $10)', () => {
    // valuePerPipPerLot = 100 * 0.1 = $10  (same as EURUSD)
    const eurLot = calcLotSize('EURUSD', 10000, 2, 50)
    const goldLot = calcLotSize('XAUUSD', 10000, 2, 50)
    expect(goldLot).toBe(eurLot)
  })

  // --- Edge cases ---
  test('Zero balance → riskAmount is $0 → lot clamped to 0.01', () => {
    const lot = calcLotSize('EURUSD', 0, 2, 50)
    expect(lot).toBe(0.01)
  })

  test('Zero risk % → riskAmount is $0 → lot clamped to 0.01', () => {
    const lot = calcLotSize('EURUSD', 10000, 0, 50)
    expect(lot).toBe(0.01)
  })

  test('Zero SL pips → division by zero → returns Infinity (documented behavior)', () => {
    // riskAmount = 200; lot = 200 / (0 * 10) = Infinity
    // Math.max(0.01, Infinity) = Infinity
    // This is the current behavior — caller should guard against 0 SL pips
    const lot = calcLotSize('EURUSD', 10000, 2, 0)
    expect(lot).toBe(Infinity)
  })
})

// ---------------------------------------------------------------------------
describe('Trading Math — Bid/Ask Spread', () => {
  test('Ask is always greater than Bid for EURUSD', () => {
    const { bid, ask } = bidAsk('EURUSD', Date.now())
    expect(ask).toBeGreaterThan(bid)
  })

  test('Ask is always greater than Bid for USDJPY', () => {
    const { bid, ask } = bidAsk('USDJPY', Date.now())
    expect(ask).toBeGreaterThan(bid)
  })

  test('Ask is always greater than Bid for GBPUSD', () => {
    const { bid, ask } = bidAsk('GBPUSD', Date.now())
    expect(ask).toBeGreaterThan(bid)
  })

  test('Ask is always greater than Bid for XAUUSD', () => {
    const { bid, ask } = bidAsk('XAUUSD', Date.now())
    expect(ask).toBeGreaterThan(bid)
  })

  test('Major pair spread is reasonable (0.5–3 pips typical range)', () => {
    const t = Date.now()
    for (const sym of ['EURUSD', 'USDJPY', 'GBPUSD'] as const) {
      const { spread } = bidAsk(sym, t)
      const pip = SYMBOL_BASE[sym].pip
      const spreadPips = spread / pip
      // Major spread: 0.4 pips per the code → should be between 0.1 and 3 pips
      expect(spreadPips).toBeGreaterThanOrEqual(0.1)
      expect(spreadPips).toBeLessThan(3)
    }
  })

  test('XAUUSD spread is wider than major FX pairs', () => {
    const t = Date.now()
    const eurSpread = bidAsk('EURUSD', t).spread / SYMBOL_BASE['EURUSD'].pip
    const goldSpread = bidAsk('XAUUSD', t).spread / SYMBOL_BASE['XAUUSD'].pip
    // XAUUSD uses 2 pips spread vs 0.4 for majors
    expect(goldSpread).toBeGreaterThan(eurSpread)
  })

  test('All supported symbols have valid (positive finite) bid and ask prices', () => {
    const t = Date.now()
    for (const sym of SUPPORTED_SYMBOLS) {
      const { bid, ask, spread } = bidAsk(sym, t)
      expect(bid).toBeGreaterThan(0)
      expect(ask).toBeGreaterThan(0)
      expect(spread).toBeGreaterThan(0)
      expect(Number.isFinite(bid)).toBe(true)
      expect(Number.isFinite(ask)).toBe(true)
      expect(Number.isFinite(spread)).toBe(true)
    }
  })

  test('Spread = ask - bid', () => {
    const t = Date.now()
    for (const sym of SUPPORTED_SYMBOLS) {
      const { bid, ask, spread } = bidAsk(sym, t)
      expect(spread).toBeCloseTo(ask - bid, 5)
    }
  })

  test('Mid price sits between bid and ask', () => {
    const t = Date.now()
    for (const sym of SUPPORTED_SYMBOLS) {
      const { bid, ask } = bidAsk(sym, t)
      const mid = (bid + ask) / 2
      expect(mid).toBeGreaterThan(bid)
      expect(mid).toBeLessThan(ask)
    }
  })
})

// ---------------------------------------------------------------------------
describe('Trading Math — Edge Cases', () => {
  test('Negative lot size should not be possible (calcLotSize always ≥ 0.01)', () => {
    // Even with absurdly small inputs, result is clamped to 0.01
    const lot = calcLotSize('EURUSD', 1, 0.01, 10000)
    expect(lot).toBeGreaterThanOrEqual(0.01)
  })

  test('Very large price movement (1000 pips) computes correctly for buy', () => {
    // EURUSD buy 1.0 lot, open 1.0, close 1.1
    const { pips, pnl } = calcPnl('EURUSD', 'buy', 1.0, 1.0, 1.1)
    expect(pips).toBe(1000)
    expect(pnl).toBe(10000)
  })

  test('Very large price movement (1000 pips) computes correctly for sell', () => {
    // EURUSD sell 1.0 lot, open 1.1, close 1.0
    const { pips, pnl } = calcPnl('EURUSD', 'sell', 1.0, 1.1, 1.0)
    expect(pips).toBe(1000)
    expect(pnl).toBe(10000)
  })

  test('Very small price movement (< 1 pip) produces fractional pip count', () => {
    // EURUSD buy 1.0 lot, open 1.1, close 1.10003 → 0.3 pips
    const { pips, pnl } = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.10003)
    expect(pips).toBe(0.3)
    // valuePerPip = $10; pnl = 0.3 * 10 = $3.00
    expect(pnl).toBe(3)
  })

  test('Very small price movement (0.1 pip) on XAUUSD', () => {
    // XAUUSD buy 1.0 lot, open 2000.0, close 2000.01 → 0.1 pips
    const { pips, pnl } = calcPnl('XAUUSD', 'buy', 1.0, 2000.0, 2000.01)
    expect(pips).toBe(0.1)
    expect(pnl).toBe(1)
  })

  test('Zero close price for USDJPY causes non-finite result (documented limitation)', () => {
    // valuePerPip = (1.0 * 100000 * 0.01) / 0 = Infinity
    // pnl = 0 * Infinity = NaN (pips = 0 because open == close)
    const { pnl, pips } = calcPnl('USDJPY', 'buy', 1.0, 150.0, 0)
    // Since diff = (0 - 150) * 1 = -150, pips = -150/0.01 = -15000
    // valuePerPip = Infinity, pnl = -15000 * Infinity = -Infinity
    expect(pips).toBe(-15000)
    expect(pnl).toBe(-Infinity)
  })

  test('Symmetry: buy profit = sell profit for same absolute movement', () => {
    const buy = calcPnl('EURUSD', 'buy', 1.0, 1.1, 1.11)
    const sell = calcPnl('EURUSD', 'sell', 1.0, 1.11, 1.1)
    expect(buy.pips).toBe(sell.pips)
    expect(buy.pnl).toBe(sell.pnl)
  })

  test('Symmetry: buy loss = sell loss for same absolute movement', () => {
    const buy = calcPnl('EURUSD', 'buy', 1.0, 1.11, 1.1)
    const sell = calcPnl('EURUSD', 'sell', 1.0, 1.1, 1.11)
    expect(buy.pips).toBe(sell.pips)
    expect(buy.pnl).toBe(sell.pnl)
  })

  test('PnL scales linearly with lot size across all symbols', () => {
    const lots = [0.01, 0.1, 0.5, 1.0, 2.0, 5.0]
    for (const sym of ['EURUSD', 'USDJPY', 'XAUUSD'] as const) {
      const ref = calcPnl(sym, 'buy', 1.0, 1.1, 1.101)
      for (const lot of lots) {
        const result = calcPnl(sym, 'buy', lot, 1.1, 1.101)
        // Pips must be identical regardless of lot
        expect(result.pips).toBe(ref.pips)
        // PnL must scale proportionally
        if (lot > 0) {
          expect(result.pnl).toBeCloseTo(ref.pnl * lot, 1)
        }
      }
    }
  })
})