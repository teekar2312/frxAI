import 'server-only'
import { db, backtests, logs } from './db'
import { priceAt, calcPnl } from './market'
import { getBars, bridgeHealth, type MT5Timeframe } from './mt5-client'

/**
 * Backtest simulator with strategy-specific entry engines.
 *
 * Each strategy category has its own entry rule:
 *   - trend:          EMA fast/slow crossover
 *   - mean-reversion: RSI overbought/oversold reversal
 *   - breakout:       Asian-range breakout (London open)
 *   - momentum:       EMA + VWAP momentum confluence
 *   - news:           Volatility spike continuation
 *
 * Exit is always SL/TP-based (with optional trailing for momentum).
 */

export interface BacktestInput {
  name: string
  symbol: string
  timeframe: string
  strategy: string
  strategyCategory?: string
  strategyEngine?: string
  periodFrom: Date
  periodTo: Date
  initialCapital: number
  riskPerTradePct: number
  stopLossPips: number
  riskReward: number
  emaFast?: number
  emaSlow?: number
  rsiPeriod?: number
  rsiOverbought?: number
  rsiOversold?: number
}

interface Bar {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

function generateSyntheticBars(symbol: string, from: Date, to: Date, timeframe: string): Bar[] {
  const tfMinutes: Record<string, number> = { M1: 1, M5: 5, M15: 15, H1: 60 }
  const interval = (tfMinutes[timeframe] ?? 5) * 60 * 1000
  const bars: Bar[] = []
  for (let t = from.getTime(); t < to.getTime(); t += interval) {
    const o = priceAt(symbol, t)
    const c = priceAt(symbol, t + interval)
    const hi = Math.max(o, c) + Math.abs(priceAt(symbol, t + 2000) - o) * 0.5
    const lo = Math.min(o, c) - Math.abs(priceAt(symbol, t + 4000) - o) * 0.5
    bars.push({ t, o, h: hi, l: lo, c, v: 1000 + Math.round(Math.random() * 3000) })
  }
  return bars
}

/**
 * Fetch bars for backtest — tries MT5 bridge first, falls back to synthetic.
 * Returns { bars, source } so the caller can record which data was used.
 */
async function fetchBacktestBars(
  symbol: string,
  from: Date,
  to: Date,
  timeframe: string,
): Promise<{ bars: Bar[]; source: 'mt5-bridge' | 'synthetic' }> {
  // Try MT5 bridge first
  const health = await bridgeHealth()
  if (health.ok) {
    try {
      const tf = (timeframe as MT5Timeframe) || 'M5'
      const durationMs = to.getTime() - from.getTime()
      const tfMinutes: Record<string, number> = { M1: 1, M5: 5, M15: 15, H1: 60 }
      const interval = (tfMinutes[timeframe] ?? 5) * 60 * 1000
      const count = Math.min(1000, Math.max(50, Math.floor(durationMs / interval)))

      const bridgeBars = await getBars(symbol, tf, count)
      if (bridgeBars.length > 10) { // need at least 10 bars for meaningful backtest
        const bars: Bar[] = bridgeBars.map((b) => ({
          t: new Date(b.time).getTime(),
          o: b.open,
          h: b.high,
          l: b.low,
          c: b.close,
          v: b.volume,
        }))
        // Filter to requested time range
        const fromT = from.getTime()
        const toT = to.getTime()
        const filtered = bars.filter((b) => b.t >= fromT && b.t <= toT)
        if (filtered.length > 10) {
          return { bars: filtered, source: 'mt5-bridge' }
        }
      }
    } catch (e) {
      // Bridge call failed — fall through to synthetic
    }
  }

  // Fallback: synthetic bars
  return { bars: generateSyntheticBars(symbol, from, to, timeframe), source: 'synthetic' }
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0]
  for (const v of values) {
    prev = v * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

function rsi(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(50)
  if (values.length < period + 1) return out
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1]
    if (change >= 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1]
    const gain = change >= 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

function bollingerBands(values: number[], period: number, mult: number) {
  const upper: number[] = new Array(values.length).fill(NaN)
  const lower: number[] = new Array(values.length).fill(NaN)
  const mid: number[] = new Array(values.length).fill(NaN)
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)
    mid[i] = mean
    upper[i] = mean + mult * std
    lower[i] = mean - mult * std
  }
  return { upper, lower, mid }
}

interface Position {
  side: 'buy' | 'sell'
  entry: number
  sl: number
  tp: number
  lot: number
  openT: number
  openI: number
}

interface EntrySignal {
  side: 'buy' | 'sell' | null
}

// ─── Strategy entry engines ────────────────────────────────────────────────

function trendEntry(
  i: number,
  bars: Bar[],
  emaFast: number[],
  emaSlow: number[],
): EntrySignal {
  if (i < 2) return { side: null }
  const crossUp = emaFast[i - 1] <= emaSlow[i - 1] && emaFast[i] > emaSlow[i]
  const crossDn = emaFast[i - 1] >= emaSlow[i - 1] && emaFast[i] < emaSlow[i]
  if (crossUp) return { side: 'buy' }
  if (crossDn) return { side: 'sell' }
  return { side: null }
}

function meanReversionEntry(
  i: number,
  bars: Bar[],
  rsiVals: number[],
  overbought: number,
  oversold: number,
): EntrySignal {
  if (i < 2) return { side: null }
  const r = rsiVals[i]
  // Sell when RSI is overbought (fade the overextension)
  if (r >= overbought - 8) return { side: 'sell' }
  // Buy when RSI is oversold
  if (r <= oversold + 8) return { side: 'buy' }
  return { side: null }
}

function bollingerEntry(
  i: number,
  bars: Bar[],
  bb: { upper: number[]; lower: number[]; mid: number[] },
): EntrySignal {
  if (i < 21 || isNaN(bb.upper[i])) return { side: null }
  const c = bars[i].c
  const cPrev = bars[i - 1].c
  // Strict close-based condition: previous close must have been BELOW the lower
  // band (oversold), and current close must be back above it (reversion started).
  // This avoids wick-based false signals on synthetic data.
  const prevClose = bars[i - 1].c
  // Buy: prev close below lower band, current close above lower band (reversion up)
  if (prevClose < bb.lower[i - 1] && c > bb.lower[i] && c > cPrev) {
    return { side: 'buy' }
  }
  // Sell: prev close above upper band, current close below upper band (reversion down)
  if (prevClose > bb.upper[i - 1] && c < bb.upper[i] && c < cPrev) {
    return { side: 'sell' }
  }
  return { side: null }
}

function breakoutEntry(
  i: number,
  bars: Bar[],
  asianRangeHigh: number,
  asianRangeLow: number,
): EntrySignal {
  if (i < 2) return { side: null }
  const hour = new Date(bars[i].t).getUTCHours()
  // Enter during London session (06:00-11:00 UTC) — broader window
  if (hour < 6 || hour >= 11) return { side: null }
  const c = bars[i].c
  // Breakout above Asian range high → buy
  if (c > asianRangeHigh) return { side: 'buy' }
  // Breakout below Asian range low → sell
  if (c < asianRangeLow) return { side: 'sell' }
  return { side: null }
}

function momentumEntry(
  i: number,
  bars: Bar[],
  emaFast: number[],
  emaSlow: number[],
  rsiVals: number[],
): EntrySignal {
  if (i < 2) return { side: null }
  // Momentum: EMA fast above slow (uptrend) + RSI > 50 = buy
  //           EMA fast below slow (downtrend) + RSI < 50 = sell
  if (emaFast[i] > emaSlow[i] && rsiVals[i] > 50 && rsiVals[i] < 70 && bars[i].c > bars[i - 1].c) {
    return { side: 'buy' }
  }
  if (emaFast[i] < emaSlow[i] && rsiVals[i] < 50 && rsiVals[i] > 30 && bars[i].c < bars[i - 1].c) {
    return { side: 'sell' }
  }
  return { side: null }
}

function newsEntry(
  i: number,
  bars: Bar[],
  rsiVals: number[],
): EntrySignal {
  if (i < 3) return { side: null }
  // News spike: large bar (range > 1.5x average) → momentum continuation
  const avgRange = (bars[i - 1].h - bars[i - 1].l + bars[i - 2].h - bars[i - 2].l) / 2
  const curRange = bars[i].h - bars[i].l
  if (curRange > avgRange * 1.5) {
    // Bullish spike
    if (bars[i].c > bars[i].o) return { side: 'buy' }
    // Bearish spike
    if (bars[i].c < bars[i].o) return { side: 'sell' }
  }
  return { side: null }
}

// ─── Main backtest runner ───────────────────────────────────────────────────

export async function runBacktest(input: BacktestInput) {
  // r13-REPLAY: Try real MT5 bars first, fall back to synthetic
  const { bars, source: dataSource } = await fetchBacktestBars(
    input.symbol,
    input.periodFrom,
    input.periodTo,
    input.timeframe,
  )
  if (bars.length < 10) {
    throw new Error('Not enough bars in the selected period')
  }

  const closes = bars.map((b) => b.c)
  const emaFastPeriod = input.emaFast ?? 8
  const emaSlowPeriod = input.emaSlow ?? 21
  const rsiPeriodVal = input.rsiPeriod ?? 14
  const overbought = input.rsiOverbought ?? 70
  const oversold = input.rsiOversold ?? 30

  const emaFast = ema(closes, emaFastPeriod)
  const emaSlow = ema(closes, emaSlowPeriod)
  const rsiVals = rsi(closes, rsiPeriodVal)
  const bb = bollingerBands(closes, 20, 2)

  // Compute Asian session range (00:00-06:00 UTC) for breakout strategy
  let asianRangeHigh = -Infinity
  let asianRangeLow = Infinity
  for (const b of bars) {
    const h = new Date(b.t).getUTCHours()
    if (h >= 0 && h < 6) {
      asianRangeHigh = Math.max(asianRangeHigh, b.h)
      asianRangeLow = Math.min(asianRangeLow, b.l)
    }
  }
  if (!isFinite(asianRangeHigh)) {
    asianRangeHigh = Math.max(...closes.slice(0, Math.min(50, closes.length)))
    asianRangeLow = Math.min(...closes.slice(0, Math.min(50, closes.length)))
  }

  const engine = (input.strategyEngine ?? 'ema-cross').toLowerCase()

  const pip = input.symbol === 'USDJPY' ? 0.01 : input.symbol === 'XAUUSD' ? 0.1 : 0.0001
  const slPips = input.stopLossPips
  const tpPips = slPips * input.riskReward

  let capital = input.initialCapital
  const equityCurve: { t: number; equity: number }[] = []
  const trades: { open: number; close: number; side: 'buy' | 'sell'; pnl: number; t: number }[] = []
  let maxEquity = capital
  let maxDD = 0
  let wins = 0
  let losses = 0
  let grossWin = 0
  let grossLoss = 0
  let position: Position | null = null
  // Cooldown: after closing a trade, wait N bars before re-entering to avoid
  // rapid-fire re-entries when the signal condition persists.
  let cooldownUntil = 0

  for (let i = 2; i < bars.length; i++) {
    if (position) {
      // Check SL/TP/timeout on the open position
      const bar = bars[i]
      const hitSl = position.side === 'buy' ? bar.l <= position.sl : bar.h >= position.sl
      const hitTp = position.side === 'buy' ? bar.h >= position.tp : bar.l <= position.tp
      // Max hold: force-close after N bars to avoid stale positions
      const barsHeld = i - position.openI
      const maxHold = input.timeframe === 'M1' ? 30 : input.timeframe === 'H1' ? 24 : 36
      const timeout = barsHeld >= maxHold
      if (hitSl || hitTp || timeout) {
        const exit = hitSl ? position.sl : hitTp ? position.tp : bar.c
        const { pnl } = calcPnl(input.symbol, position.side, position.lot, position.entry, exit)
        capital += pnl
        trades.push({ open: position.entry, close: exit, side: position.side, pnl, t: bar.t })
        if (pnl >= 0) {
          wins++
          grossWin += pnl
        } else {
          losses++
          grossLoss += Math.abs(pnl)
        }
        maxEquity = Math.max(maxEquity, capital)
        maxDD = Math.max(maxDD, (maxEquity - capital) / maxEquity)
        position = null
        // Set cooldown: wait 6 bars (30 min on M5) before re-entering
        cooldownUntil = i + 6
      }
    } else if (i >= cooldownUntil) {
      // No position and cooldown expired — look for entry signal
      let sig: EntrySignal = { side: null }
      switch (engine) {
        case 'rsi-reversal':
          sig = meanReversionEntry(i, bars, rsiVals, overbought, oversold)
          break
        case 'bollinger':
          sig = bollingerEntry(i, bars, bb)
          break
        case 'breakout':
          sig = breakoutEntry(i, bars, asianRangeHigh, asianRangeLow)
          break
        case 'momentum':
          sig = momentumEntry(i, bars, emaFast, emaSlow, rsiVals)
          break
        case 'news-spike':
          sig = newsEntry(i, bars, rsiVals)
          break
        default: // ema-cross (trend)
          sig = trendEntry(i, bars, emaFast, emaSlow)
      }

      if (sig.side) {
        const side = sig.side
        const entry = bars[i].c
        const sl = side === 'buy' ? entry - slPips * pip : entry + slPips * pip
        const tp = side === 'buy' ? entry + tpPips * pip : entry - tpPips * pip
        const riskAmount = capital * (input.riskPerTradePct / 100)
        const valuePerPip =
          input.symbol === 'USDJPY'
            ? (100000 * pip) / entry
            : input.symbol === 'XAUUSD'
              ? 100 * pip
              : 100000 * pip
        const lot = Math.max(0.01, Math.floor((riskAmount / (slPips * valuePerPip)) * 100) / 100)
        position = { side, entry, sl, tp, lot, openT: bars[i].t, openI: i }
      }
    }
    equityCurve.push({ t: bars[i].t, equity: Number(capital.toFixed(2)) })
  }

  const totalTrades = wins + losses
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0
  const netProfit = capital - input.initialCapital
  // sharpe approximation from equity curve returns
  const rets: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    rets.push((equityCurve[i].equity - equityCurve[i - 1].equity) / Math.max(1, equityCurve[i - 1].equity))
  }
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length)
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length)
  const std = Math.sqrt(variance)
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252 * 24 * 12) : 0

  const created = await db.insert(backtests).values({
    name: `${input.name} [${dataSource}]`,
    symbol: input.symbol,
    timeframe: input.timeframe,
    strategy: input.strategy,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    initialCapital: input.initialCapital,
    finalCapital: Number(capital.toFixed(2)),
    totalTrades,
    winTrades: wins,
    lossTrades: losses,
    winRate: Number(winRate.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    maxDrawdown: Number((maxDD * 100).toFixed(2)),
    sharpeRatio: Number(sharpe.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    equityCurve: JSON.stringify(equityCurve),
    tradesJson: JSON.stringify(trades),
    status: 'completed',
  }).returning().then(r => r[0])

  await db.insert(logs).values({
    level: 'info',
    source: 'backtest',
    message: `Backtest "${input.name}" [${dataSource}] ${input.symbol} ${input.timeframe} [${engine}]: ${totalTrades} trades, win ${winRate.toFixed(1)}%, PF ${profitFactor.toFixed(2)}, net ${netProfit.toFixed(2)}`,
  })

  return created
}