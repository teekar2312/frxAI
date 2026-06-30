// Shared domain types for FinexFX AI Trading System

export type AccountType = 'demo' | 'live'
export type TradeSide = 'buy' | 'sell'
export type TradeStatus = 'open' | 'closed'
export type TradeSource = 'manual' | 'auto' | 'ai'

export interface Account {
  id: string
  name: string
  broker: string
  server: string
  login: string
  accountType: AccountType
  currency: string
  leverage: string
  balance: number
  equity: number
  margin: number
  freeMargin: number
  marginLevel: number
  connected: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface Trade {
  id: string
  accountId: string
  symbol: string
  side: TradeSide
  lotSize: number
  openPrice: number
  closePrice: number | null
  stopLoss: number | null
  takeProfit: number | null
  trailingStop: boolean
  trailingPips: number
  status: TradeStatus
  pnl: number
  pips: number
  commission: number
  swap: number
  strategy: string
  timeframe: string
  source: TradeSource
  comment: string | null
  openTime: string
  closeTime: string | null
  createdAt: string
  updatedAt: string
}

export interface PendingOrder {
  id: string
  accountId: string
  symbol: string
  side: TradeSide
  orderType: 'limit' | 'stop'
  lotSize: number
  price: number
  stopLoss: number | null
  takeProfit: number | null
  status: 'pending' | 'triggered' | 'cancelled'
  openTime: string
  createdAt: string
  updatedAt: string
}

export interface Indicator {
  id: string
  name: string
  category: 'trend' | 'oscillator' | 'volume' | 'volatility' | 'channel' | 'regression'
  description: string
  defaultParams: string // JSON
  scalpingPreset: string | null // JSON
  enabled: boolean
  autoManaged: boolean
  weight: number
  createdAt: string
  updatedAt: string
}

export type NewsCategory =
  | 'central_bank' | 'nfp' | 'cpi' | 'ppi' | 'gdp' | 'unemployment'
  | 'retail' | 'pmi' | 'geopolitical' | 'fiscal' | 'commodity'
  | 'sentiment' | 'breaking'

export interface NewsItem {
  id: string
  source: string
  title: string
  summary: string
  url: string | null
  category: NewsCategory
  impact: 'low' | 'medium' | 'high'
  sentiment: 'bullish' | 'bearish' | 'neutral'
  symbols: string
  publishedAt: string
  createdAt: string
}

export interface Alert {
  id: string
  symbol: string
  condition: 'above' | 'below' | 'cross_up' | 'cross_down'
  price: number
  active: boolean
  triggered: boolean
  triggeredAt: string | null
  notifyEmail: boolean
  message: string | null
  createdAt: string
  updatedAt: string
}

export interface Log {
  id: string
  level: 'info' | 'warn' | 'error' | 'debug'
  source: 'mt5' | 'ai' | 'risk' | 'api' | 'ws' | 'backtest' | 'system'
  message: string
  stack: string | null
  context: string | null
  createdAt: string
}

export interface Backtest {
  id: string
  name: string
  symbol: string
  timeframe: string
  strategy: string
  periodFrom: string
  periodTo: string
  initialCapital: number
  finalCapital: number
  totalTrades: number
  winTrades: number
  lossTrades: number
  winRate: number
  profitFactor: number
  maxDrawdown: number
  sharpeRatio: number
  netProfit: number
  equityCurve: string // JSON array
  tradesJson: string // JSON array
  status: 'running' | 'completed' | 'failed'
  createdAt: string
}

export interface AiSignal {
  id: string
  symbol: string
  direction: 'long' | 'short' | 'neutral'
  confidence: number
  timeframe: string
  reasoning: string
  selectedIndicators: string // JSON array
  factors: string // JSON object
  action: 'buy' | 'sell' | 'wait'
  modelVersion: string
  accuracy: number
  createdAt: string
}

export interface TradingSession {
  name: string
  city: string
  openUtc: number // hour
  closeUtc: number
  active: boolean
  progress: number // 0..1
  nextOpen: string // ISO
}

export interface SymbolQuote {
  symbol: string
  price: number
  bid: number
  ask: number
  spread: number
  changePct: number
  high: number
  low: number
  pip: number
  spark: number[]
  updatedAt: string
}

export interface RiskUsage {
  usedPct: number
  limitPct: number
  openRiskPct: number
  dailyPnlPct: number
  openPositions: number
  maxPositions: number
  dailyPnl: number
  balance: number
}

export interface Notification {
  id: string
  type: 'trade_open' | 'trade_close' | 'alert' | 'risk' | 'system' | 'news'
  subject: string
  body: string
  recipient: string
  sent: boolean
  sentAt: string | null
  createdAt: string
}

export interface DashboardData {
  accounts: Account[]
  defaultAccount: Account | null
  openTrades: Trade[]
  todayClosedTrades: Trade[]
  todayPnl: number
  todayPnlPct: number
  riskUsage: RiskUsage
  sessions: TradingSession[]
  topNews: NewsItem[]
  latestSignals: AiSignal[]
  equitySpark: number[]
  symbols: SymbolQuote[]
}

// ===== Economic Calendar =====
export interface EconomicEvent {
  id: string
  title: string
  country: string // US | EU | GB | JP
  currency: string // USD | EUR | GBP | JPY
  category: 'interest_rate' | 'nfp' | 'cpi' | 'ppi' | 'gdp' | 'unemployment' | 'retail' | 'pmi' | 'speech' | 'other'
  impact: 'low' | 'medium' | 'high'
  eventTime: string
  actual: string | null
  forecast: string | null
  previous: string | null
  surprise: string | null
  symbols: string
  status: 'upcoming' | 'released' | 'cancelled'
  source: string
  createdAt: string
  updatedAt: string
}

// ===== Trade Analytics =====
export interface TradeAnalytics {
  totalTrades: number
  totalClosed: number
  wins: number
  losses: number
  winRate: number
  netProfit: number
  grossProfit: number
  grossLoss: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  bestTrade: number
  worstTrade: number
  avgHoldMinutes: number
  byPair: { symbol: string; trades: number; winRate: number; netPnl: number }[]
  bySource: { source: string; trades: number; winRate: number; netPnl: number }[]
  bySession: { session: string; trades: number; winRate: number; netPnl: number }[]
  byDay: { day: string; trades: number; netPnl: number }[]
  equityCurve: { t: string; equity: number }[]
  pnlDistribution: { range: string; count: number }[]
  consecutiveWins: number
  consecutiveLosses: number
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
  // Advanced metrics (r7)
  expectancy?: number
  avgRR?: number
  maxDrawdown?: number
  maxDrawdownPct?: number
  sharpeRatio?: number
  sortinoRatio?: number
  largestWin?: number
  largestLoss?: number
}

// ===== Auth / Users =====
export interface SafeUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'trader' | 'viewer'
  active: boolean
  lastLoginAt: string | null
  createdAt: string
}

// ===== MT5 Bridge =====
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

export const SUPPORTED_SYMBOLS = ['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD'] as const
export type SupportedSymbol = typeof SUPPORTED_SYMBOLS[number]

export const SYMBOL_BASE: Record<string, { price: number; pip: number; digits: number; contractSize: number }> = {
  EURUSD: { price: 1.085, pip: 0.0001, digits: 5, contractSize: 100000 },
  USDJPY: { price: 156.4, pip: 0.01, digits: 3, contractSize: 100000 },
  GBPUSD: { price: 1.272, pip: 0.0001, digits: 5, contractSize: 100000 },
  XAUUSD: { price: 2335.5, pip: 0.1, digits: 2, contractSize: 100 },
}

export const SYMBOL_LABEL: Record<string, string> = {
  EURUSD: 'EUR/USD',
  USDJPY: 'USD/JPY',
  GBPUSD: 'GBP/USD',
  XAUUSD: 'XAU/USD (Gold)',
}

export const NEWS_CATEGORIES: { value: NewsCategory; label: string }[] = [
  { value: 'central_bank', label: 'Kebijakan Bank Sentral' },
  { value: 'nfp', label: 'Non-Farm Payroll (NFP)' },
  { value: 'cpi', label: 'Inflasi (CPI)' },
  { value: 'ppi', label: 'Inflasi (PPI)' },
  { value: 'gdp', label: 'GDP' },
  { value: 'unemployment', label: 'Unemployment Rate' },
  { value: 'retail', label: 'Retail Sales' },
  { value: 'pmi', label: 'PMI' },
  { value: 'geopolitical', label: 'Politik & Geopolitik' },
  { value: 'fiscal', label: 'Kebijakan Fiskal' },
  { value: 'commodity', label: 'Harga Komoditas' },
  { value: 'sentiment', label: 'Sentimen Pasar' },
  { value: 'breaking', label: 'Breaking News' },
]
