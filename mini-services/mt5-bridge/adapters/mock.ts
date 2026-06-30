// MockMT5Adapter — realistic simulation for sandbox/dev without a real MT5 terminal.
// Mirrors the deterministic priceAt formula from src/lib/market.ts so prices stay
// consistent with the existing dashboard. Maintains in-memory positions per login.
//
// For production, swap this with RealPythonMT5Adapter (calls a Python subprocess
// running MetaTrader5 on Windows) — see ./python/mt5_bridge.py for reference.

import type {
  MT5Adapter, MT5AccountInfo, MT5Tick, MT5Bar, MT5Position,
  MT5OrderResult, MT5ConnectParams, Timeframe,
} from './types'

const SYMBOL_BASE: Record<string, { price: number; pip: number; digits: number; contractSize: number }> = {
  EURUSD: { price: 1.085, pip: 0.0001, digits: 5, contractSize: 100000 },
  USDJPY: { price: 156.4, pip: 0.01, digits: 3, contractSize: 100000 },
  GBPUSD: { price: 1.272, pip: 0.0001, digits: 5, contractSize: 100000 },
  XAUUSD: { price: 2335.5, pip: 0.1, digits: 2, contractSize: 100 },
}

function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

function priceAt(symbol: string, t: number): number {
  const base = SYMBOL_BASE[symbol]
  if (!base) return 0
  const sec = t / 1000
  const wave = Math.sin(sec / 90) * (base.pip * 6) + Math.sin(sec / 37) * (base.pip * 3) + Math.sin(sec / 13) * (base.pip * 1.5)
  const trend = Math.sin(sec / 3600) * (base.pip * 25)
  const tick = noise(t / 1000) * (base.pip * 1.2)
  return Number((base.price + trend + wave + tick).toFixed(base.digits))
}

function bidAsk(symbol: string, t: number): { bid: number; ask: number; spread: number } {
  const mid = priceAt(symbol, t)
  const base = SYMBOL_BASE[symbol]
  const spreadPips = symbol === 'XAUUSD' ? 2 : 0.4
  const spread = spreadPips * base.pip
  return {
    bid: Number((mid - spread / 2).toFixed(base.digits)),
    ask: Number((mid + spread / 2).toFixed(base.digits)),
    spread: Number(spread.toFixed(base.digits)),
  }
}

function calcPnl(symbol: string, side: 'buy' | 'sell', lot: number, openPrice: number, closePrice: number): { pnl: number; pips: number } {
  const base = SYMBOL_BASE[symbol]
  const dir = side === 'buy' ? 1 : -1
  const diff = (closePrice - openPrice) * dir
  const pips = diff / base.pip
  let valuePerPip: number
  if (symbol === 'USDJPY') valuePerPip = (lot * base.contractSize * base.pip) / closePrice
  else if (symbol === 'XAUUSD') valuePerPip = lot * base.contractSize * base.pip
  else valuePerPip = lot * base.contractSize * base.pip
  return { pnl: Number((pips * valuePerPip).toFixed(2)), pips: Number(pips.toFixed(1)) }
}

interface MockPosition extends MT5Position {
  login: number
}

interface MockAccount {
  info: MT5AccountInfo
  positions: Map<number, MockPosition>
  nextTicket: number
}

const TF_SECONDS: Record<Timeframe, number> = {
  M1: 60, M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400,
}

export class MockMT5Adapter implements MT5Adapter {
  readonly name = 'mock'
  readonly isLive = false

  private accounts = new Map<number, MockAccount>()
  private nextTicketGlobal = 500000000

  async init(): Promise<void> {
    console.log('[MockMT5Adapter] initialized — simulation mode')
  }

  async connect(params: MT5ConnectParams): Promise<MT5AccountInfo> {
    const { login, server } = params
    // Default demo balance — in real MT5 this comes from the broker
    const info: MT5AccountInfo = {
      login,
      server,
      currency: 'USD',
      leverage: 100,
      balance: 10000,
      equity: 10000,
      margin: 0,
      freeMargin: 10000,
      marginLevel: 0,
      name: `Demo ${login}`,
      company: 'FINEX Indonesia',
      connectedAt: new Date().toISOString(),
    }
    this.accounts.set(login, { info, positions: new Map(), nextTicket: this.nextTicketGlobal })
    console.log(`[MockMT5Adapter] connected: login=${login} server=${server}`)
    return info
  }

  async disconnect(login: number): Promise<void> {
    this.accounts.delete(login)
    console.log(`[MockMT5Adapter] disconnected: login=${login}`)
  }

  async accountInfo(login: number): Promise<MT5AccountInfo | null> {
    const acc = this.accounts.get(login)
    if (!acc) return null
    // Recompute equity from open positions
    let floating = 0
    for (const pos of acc.positions.values()) {
      const { bid, ask } = bidAsk(pos.symbol, Date.now())
      const cur = pos.type === 'buy' ? bid : ask
      const { pnl } = calcPnl(pos.symbol, pos.type, pos.volume, pos.priceOpen, cur)
      floating += pnl
    }
    return {
      ...acc.info,
      equity: Number((acc.info.balance + floating).toFixed(2)),
      margin: acc.positions.size * 100, // simplified margin per position
      freeMargin: Number((acc.info.balance + floating - acc.positions.size * 100).toFixed(2)),
      marginLevel: acc.positions.size > 0 ? Number((((acc.info.balance + floating) / (acc.positions.size * 100)) * 100).toFixed(2)) : 0,
    }
  }

  async tick(symbol: string): Promise<MT5Tick | null> {
    if (!SYMBOL_BASE[symbol]) return null
    const t = Date.now()
    const { bid, ask, spread } = bidAsk(symbol, t)
    return { symbol, bid, ask, spread, time: new Date(t).toISOString() }
  }

  async bars(symbol: string, timeframe: Timeframe, count: number): Promise<MT5Bar[]> {
    if (!SYMBOL_BASE[symbol]) return []
    const tf = TF_SECONDS[timeframe]
    const now = Date.now()
    const bars: MT5Bar[] = []
    for (let i = count - 1; i >= 0; i--) {
      const barStart = now - i * tf * 1000
      const open = priceAt(symbol, barStart)
      const close = priceAt(symbol, barStart + tf * 1000 - 1)
      // sample high/low within the bar window
      let hi = Math.max(open, close)
      let lo = Math.min(open, close)
      for (let s = 0; s < tf; s += Math.max(1, Math.floor(tf / 10))) {
        const p = priceAt(symbol, barStart + s * 1000)
        hi = Math.max(hi, p)
        lo = Math.min(lo, p)
      }
      bars.push({
        time: new Date(barStart).toISOString(),
        open, high: hi, low: lo, close,
        volume: Math.floor(100 + Math.abs(noise(barStart / 1000)) * 900),
      })
    }
    return bars
  }

  async positions(login: number): Promise<MT5Position[]> {
    const acc = this.accounts.get(login)
    if (!acc) return []
    const out: MT5Position[] = []
    for (const pos of acc.positions.values()) {
      const { bid, ask } = bidAsk(pos.symbol, Date.now())
      const cur = pos.type === 'buy' ? bid : ask
      const { pnl } = calcPnl(pos.symbol, pos.type, pos.volume, pos.priceOpen, cur)
      out.push({ ...pos, priceCurrent: cur, profit: pnl })
    }
    return out
  }

  async marketOrder(params: {
    login: number; symbol: string; side: 'buy' | 'sell'; volume: number;
    sl?: number | null; tp?: number | null; comment?: string
  }): Promise<MT5OrderResult> {
    const acc = this.accounts.get(params.login)
    if (!acc) throw new Error(`Account ${params.login} not connected`)
    if (!SYMBOL_BASE[params.symbol]) throw new Error(`Unknown symbol: ${params.symbol}`)

    const t = Date.now()
    const { bid, ask } = bidAsk(params.symbol, t)
    const fillPrice = params.side === 'buy' ? ask : bid
    const ticket = acc.nextTicket++

    const pos: MockPosition = {
      ticket,
      login: params.login,
      symbol: params.symbol,
      type: params.side,
      volume: params.volume,
      priceOpen: fillPrice,
      priceCurrent: fillPrice,
      sl: params.sl ?? null,
      tp: params.tp ?? null,
      profit: 0,
      swap: 0,
      commission: Number((params.volume * 2.5 * 2).toFixed(2)),
      time: new Date(t).toISOString(),
      comment: params.comment || '',
    }
    acc.positions.set(ticket, pos)

    console.log(`[MockMT5Adapter] marketOrder: ${params.side} ${params.volume} ${params.symbol} @ ${fillPrice} ticket=${ticket}`)

    return {
      ticket,
      symbol: params.symbol,
      type: params.side,
      volume: params.volume,
      price: fillPrice,
      sl: pos.sl,
      tp: pos.tp,
      comment: pos.comment,
      retcode: 10009, // MT5 TRADE_RETCODE_DONE
      retcodeExternal: 'DONE',
    }
  }

  async closePosition(ticket: number): Promise<{ ticket: number; price: number; profit: number; retcode: number }> {
    // Search all accounts for this ticket
    for (const acc of this.accounts.values()) {
      const pos = acc.positions.get(ticket)
      if (!pos) continue
      const { bid, ask } = bidAsk(pos.symbol, Date.now())
      const closePrice = pos.type === 'buy' ? bid : ask
      const { pnl } = calcPnl(pos.symbol, pos.type, pos.volume, pos.priceOpen, closePrice)
      // Update balance
      acc.info.balance = Number((acc.info.balance + pnl - pos.commission).toFixed(2))
      acc.positions.delete(ticket)
      console.log(`[MockMT5Adapter] closePosition: ticket=${ticket} @ ${closePrice} pnl=${pnl}`)
      return { ticket, price: closePrice, profit: pnl, retcode: 10009 }
    }
    throw new Error(`Position ${ticket} not found`)
  }

  async modifyPosition(ticket: number, sl: number | null, tp: number | null): Promise<{ ticket: number; sl: number | null; tp: number | null; retcode: number }> {
    for (const acc of this.accounts.values()) {
      const pos = acc.positions.get(ticket)
      if (!pos) continue
      pos.sl = sl
      pos.tp = tp
      console.log(`[MockMT5Adapter] modifyPosition: ticket=${ticket} sl=${sl} tp=${tp}`)
      return { ticket, sl, tp, retcode: 10009 }
    }
    throw new Error(`Position ${ticket} not found`)
  }

  async shutdown(): Promise<void> {
    console.log(`[MockMT5Adapter] shutdown — ${this.accounts.size} accounts disconnected`)
    this.accounts.clear()
  }
}
