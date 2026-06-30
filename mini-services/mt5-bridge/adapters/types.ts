// MT5 Bridge Service — adapter interface.
// Defines the contract that any MT5 adapter (mock, real-python, real-grpc) must implement.
// The bridge service routes all calls through this interface, so the adapter can be
// swapped without touching the Next.js app.

export type Timeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1'

export interface MT5AccountInfo {
  login: number
  server: string
  currency: string
  leverage: number
  balance: number
  equity: number
  margin: number
  freeMargin: number
  marginLevel: number
  name: string
  company: string
  connectedAt: string
}

export interface MT5Tick {
  symbol: string
  bid: number
  ask: number
  spread: number
  time: string
}

export interface MT5Bar {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MT5Position {
  ticket: number
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  priceOpen: number
  priceCurrent: number
  sl: number | null
  tp: number | null
  profit: number
  swap: number
  commission: number
  time: string
  comment: string
}

export interface MT5OrderResult {
  ticket: number
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  price: number
  sl: number | null
  tp: number | null
  comment: string
  retcode: number
  retcodeExternal: string
}

export interface MT5ConnectParams {
  login: number
  server: string
  password: string
}

export interface MT5Adapter {
  /** Adapter identifier — e.g. 'mock', 'real-python' */
  readonly name: string

  /** True if this adapter talks to a real MT5 terminal (vs simulation) */
  readonly isLive: boolean

  /** Initialize the adapter (called once on bridge startup) */
  init(): Promise<void>

  /** Connect to MT5 with credentials. Returns account info on success. */
  connect(params: MT5ConnectParams): Promise<MT5AccountInfo>

  /** Disconnect from MT5 */
  disconnect(login: number): Promise<void>

  /** Get current account info */
  accountInfo(login: number): Promise<MT5AccountInfo | null>

  /** Get current bid/ask tick for a symbol */
  tick(symbol: string): Promise<MT5Tick | null>

  /** Get historical bars (OHLCV) for a symbol */
  bars(symbol: string, timeframe: Timeframe, count: number): Promise<MT5Bar[]>

  /** Get all open positions for the connected account */
  positions(login: number): Promise<MT5Position[]>

  /** Open a market order. Returns ticket + fill price. */
  marketOrder(params: {
    login: number
    symbol: string
    side: 'buy' | 'sell'
    volume: number
    sl?: number | null
    tp?: number | null
    comment?: string
  }): Promise<MT5OrderResult>

  /** Close an open position by ticket. Returns realized close price. */
  closePosition(ticket: number): Promise<{ ticket: number; price: number; profit: number; retcode: number }>

  /** Modify SL/TP of an open position */
  modifyPosition(ticket: number, sl: number | null, tp: number | null): Promise<{ ticket: number; sl: number | null; tp: number | null; retcode: number }>

  /** Shutdown the adapter (cleanup on bridge stop) */
  shutdown(): Promise<void>
}
