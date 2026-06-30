// Typed API client for the FinexFX backend.
import type {
  Account, Trade, PendingOrder, Indicator, NewsItem, Alert, Log,
  Backtest, AiSignal, RiskUsage, Notification, DashboardData,
  TradingSession, SymbolQuote, EconomicEvent, TradeAnalytics,
  MT5AccountInfo, SafeUser,
} from './types'

async function j<T>(resOrPromise: Response | Promise<Response>): Promise<T> {
  const res = await resOrPromise
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} ${txt}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  // dashboard
  dashboard: (accountId?: string) => j<DashboardData>(fetch(`/api/dashboard${accountId ? `?accountId=${accountId}` : ''}`)),
  sessions: () => j<{ sessions: TradingSession[]; overlap: TradingSession; scalpingWindow: boolean }>(fetch('/api/sessions')),
  symbols: () => j<{ symbols: SymbolQuote[] }>(fetch('/api/symbols')),
  strategies: () => fetch('/api/strategies').then((r) => r.json()) as Promise<{ strategies: any[] }>,

  // accounts
  accounts: () => j<{ accounts: Account[] }>(fetch('/api/accounts')),
  createAccount: (body: Partial<Account>) => j<{ account: Account }>(fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  updateAccount: (id: string, body: Partial<Account>) => j<{ account: Account }>(fetch(`/api/accounts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  toggleConnect: (id: string) => j<{ account: Account; connected: boolean }>(fetch(`/api/accounts/${id}/connect`, { method: 'POST' })),
  deleteAccount: (id: string) => j<{ ok: boolean }>(fetch(`/api/accounts/${id}`, { method: 'DELETE' })),

  // trades
  trades: (params: { status?: string; accountId?: string; symbol?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.accountId) q.set('accountId', params.accountId)
    if (params.symbol) q.set('symbol', params.symbol)
    if (params.limit) q.set('limit', String(params.limit))
    return j<{ trades: Trade[] }>(fetch(`/api/trades?${q}`))
  },
  openTrade: (body: any) => j<{ trade: Trade }>(fetch('/api/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  closeTrade: (id: string) => j<{ trade: Trade }>(fetch(`/api/trades/${id}/close`, { method: 'POST' })),
  partialCloseTrade: (id: string, percent: number) => j<{ closedTrade: Trade; remainingLot: number; netPnl: number; pips: number; closePrice: number }>(fetch(`/api/trades/${id}/partial-close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ percent }) })),
  moveToBreakEven: (id: string, bufferPips = 0) => j<{ trade: Trade; previousSl: number | null; newSl: number; bufferPips: number; message: string }>(fetch(`/api/trades/${id}/move-to-be`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bufferPips }) })),
  updateTrade: (id: string, body: any) => j<{ trade: Trade }>(fetch(`/api/trades/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  updateTradeNotes: (id: string, comment: string | null) => j<{ trade: Trade }>(fetch(`/api/trades/${id}/notes`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) })),

  // r13-REPLAY: trade replay with real MT5 bars (fallback to synthetic)
  getTradeReplay: (id: string) => j<{
    source: 'mt5-bridge' | 'synthetic-fallback'
    bars: Array<{ time: string; t: number; price: number; open?: number; high?: number; low?: number; close?: number }>
    trade: { id: string; symbol: string; side: string; openPrice: number; closePrice: number | null; stopLoss: number | null; takeProfit: number | null; openTime: string; closeTime: string | null; lotSize: number; pnl: number; pips: number; source: string; mt5Ticket: number | null }
  }>(fetch(`/api/trades/${id}/replay`)),

  // r12-SAFETY: emergency close-all + kill switch
  closeAllTrades: (body: { accountId?: string; reason?: string } = {}) =>
    j<{ closed: any[]; failed: any[]; totalPnl: number; count: number; message: string }>(
      fetch('/api/trades/close-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    ),
  killSwitch: (body: { accountId?: string; reason?: string } = {}) =>
    j<{ halted: boolean; autoTradingDisabled: boolean; closed: any[]; failed: any[]; totalPnl: number; count: number; message: string }>(
      fetch('/api/system/kill-switch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    ),

  // trades export (CSV)
  exportTrades: async (params: { status?: string; accountId?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.accountId) q.set('accountId', params.accountId)
    const res = await fetch(`/api/trades/export?${q}`)
    if (!res.ok) throw new Error(`Export failed: ${res.status}`)
    return res.text()
  },
  downloadTradesCsv: async (params: { status?: string; accountId?: string } = {}) => {
    const csv = await api.exportTrades(params)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finexfx-trades-${params.status || 'closed'}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  // orders
  orders: (accountId?: string) => j<{ orders: PendingOrder[] }>(fetch(`/api/orders${accountId ? `?accountId=${accountId}` : ''}`)),
  createOrder: (body: any) => j<{ order: PendingOrder }>(fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  cancelOrder: (id: string) => j<{ ok: boolean }>(fetch(`/api/orders/${id}`, { method: 'DELETE' })),

  // indicators
  indicators: () => j<{ indicators: Indicator[] }>(fetch('/api/indicators')),
  updateIndicator: (id: string, body: Partial<Indicator>) => j<{ indicator: Indicator }>(fetch(`/api/indicators/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  aiSelectIndicators: () => j<{ indicators: Indicator[] }>(fetch('/api/indicators/ai-select', { method: 'POST' })),

  // news
  news: (params: { category?: string; impact?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.category) q.set('category', params.category)
    if (params.impact) q.set('impact', params.impact)
    if (params.limit) q.set('limit', String(params.limit))
    return j<{ news: NewsItem[] }>(fetch(`/api/news?${q}`))
  },
  refreshNews: () => j<{ news: NewsItem[] }>(fetch('/api/news/refresh', { method: 'POST' })),

  // ai
  aiSignals: (symbol?: string, limit = 20) => j<{ signals: AiSignal[] }>(fetch(`/api/ai/signals?${symbol ? `symbol=${symbol}&` : ''}limit=${limit}`)),
  aiAnalyze: (symbol: string, timeframe?: 'M1' | 'M5' | 'M15' | 'H1') => j<{ signal: AiSignal }>(fetch('/api/ai/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, timeframe }) })),
  aiAutoTrade: () => j<{ enabled: boolean; message: string; executed: any[]; openPositions?: number; maxOpen?: number; todayPnlPct?: number }>(fetch('/api/ai/auto-trade', { method: 'POST' })),
  aiQuality: () => j<{ overall: any; bySymbol: Record<string, any> }>(fetch('/api/ai/quality')),
  aiEvaluate: (signalId?: string) => j<{ evaluated: number; correct: number; wrong: number; skipped: number }>(fetch('/api/ai/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signalId ? { signalId } : {}) })),

  // alerts
  alerts: () => j<{ alerts: Alert[] }>(fetch('/api/alerts')),
  createAlert: (body: any) => j<{ alert: Alert }>(fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  updateAlert: (id: string, body: any) => j<{ alert: Alert }>(fetch(`/api/alerts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  deleteAlert: (id: string) => j<{ ok: boolean }>(fetch(`/api/alerts/${id}`, { method: 'DELETE' })),

  // logs
  logs: (params: { level?: string; source?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.level) q.set('level', params.level)
    if (params.source) q.set('source', params.source)
    if (params.limit) q.set('limit', String(params.limit))
    return j<{ logs: Log[] }>(fetch(`/api/logs?${q}`))
  },
  clearLogs: () => j<{ ok: boolean }>(fetch('/api/logs', { method: 'DELETE' })),

  // backtest
  backtests: (symbol?: string, limit = 20) => j<{ backtests: Backtest[] }>(fetch(`/api/backtest?${symbol ? `symbol=${symbol}&` : ''}limit=${limit}`)),
  runBacktest: (body: any) => j<{ backtest: Backtest }>(fetch('/api/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  optimizeStrategies: (body: any) => j<{ results: any[]; best: any; worst: any; summary: any }>(fetch('/api/backtest/optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),

  // risk
  risk: () => j<{ settings: Record<string, string> }>(fetch('/api/risk')),
  updateRisk: (settings: Record<string, string>) => j<{ settings: Record<string, string> }>(fetch('/api/risk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) })),
  riskUsage: () => j<RiskUsage>(fetch('/api/risk/usage')),

  // notifications
  notifications: (limit = 50) => j<{ notifications: Notification[] }>(fetch(`/api/notifications?limit=${limit}`)),
  testNotification: (recipient?: string) => j<{ notification: Notification }>(fetch('/api/notifications/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient }) })),

  // system
  systemConfig: () => j<{ config: Record<string, string> }>(fetch('/api/system/config')),
  updateSystemConfig: (config: Record<string, string>) => j<{ config: Record<string, string> }>(fetch('/api/system/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) })),

  // r14-MONITOR: error monitoring + database backup
  errorStats: (hours = 24) => j<{ window: string; stats: any; spike: any }>(fetch(`/api/system/errors?hours=${hours}`)),
  backupStats: () => j<{ stats: any; backups: any[] }>(fetch('/api/system/backup')),
  createBackup: () => j<{ ok: boolean; backup?: any; message: string }>(fetch('/api/system/backup', { method: 'POST' })),
  deleteBackup: (filename: string) => j<{ ok: boolean; message: string }>(fetch(`/api/system/backup?filename=${encodeURIComponent(filename)}`, { method: 'DELETE' })),

  // economic calendar
  economicCalendar: (params: { days?: number; impact?: string; country?: string; status?: string; category?: string; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.days) q.set('days', String(params.days))
    if (params.impact) q.set('impact', params.impact)
    if (params.country) q.set('country', params.country)
    if (params.status) q.set('status', params.status)
    if (params.category) q.set('category', params.category)
    if (params.limit) q.set('limit', String(params.limit))
    return j<{ events: EconomicEvent[]; total: number }>(fetch(`/api/economic-calendar?${q}`))
  },
  refreshEconomicCalendar: () => j<{ events: EconomicEvent[]; added: number }>(fetch('/api/economic-calendar/refresh', { method: 'POST' })),

  // analytics
  analytics: (params: { accountId?: string; days?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.accountId) q.set('accountId', params.accountId)
    if (params.days) q.set('days', String(params.days))
    return j<{ analytics: TradeAnalytics }>(fetch(`/api/analytics?${q}`))
  },

  // analytics export — returns a self-contained HTML report (print-to-PDF friendly)
  exportAnalyticsPdf: async (params: { days?: number; accountId?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.days) q.set('days', String(params.days))
    if (params.accountId) q.set('accountId', params.accountId)
    const res = await fetch(`/api/analytics/export?${q}`)
    if (!res.ok) throw new Error(`Export failed: ${res.status}`)
    return res.blob()
  },
  downloadAnalyticsPdf: async (params: { days?: number; accountId?: string } = {}) => {
    const blob = await api.exportAnalyticsPdf(params)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finexfx-report-${new Date().toISOString().slice(0, 10)}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  // mt5 bridge — health / connect / account / disconnect
  mt5Health: () => j<{ ok: boolean; adapter: string; isLive: boolean; message: string }>(fetch('/api/mt5/health')),
  mt5Connect: (body: { login: number; server: string; password: string; accountId?: string }) =>
    j<{ account: MT5AccountInfo }>(fetch('/api/mt5/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })),
  mt5AccountInfo: (login: number) =>
    j<{ account: MT5AccountInfo }>(fetch(`/api/mt5/account?login=${login}`)),
  mt5Disconnect: (login: number) =>
    j<{ ok: boolean }>(fetch(`/api/mt5/connect?login=${login}`, { method: 'DELETE' })),

  // ===== Auth / User management =====
  /** GET /api/users — list all users (admin only). */
  users: () => j<{ users: SafeUser[] }>(fetch('/api/users')),
  /** POST /api/users — create a new user (admin only). */
  createUser: (body: { email: string; name: string; password: string; role: 'admin' | 'trader' | 'viewer' }) =>
    j<{ user: SafeUser }>(fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })),
  /** PATCH /api/users/[id] — update user role/active/name (admin only). */
  updateUser: (id: string, body: { role?: 'admin' | 'trader' | 'viewer'; active?: boolean; name?: string }) =>
    j<{ user: SafeUser }>(fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })),
  /** POST /api/users/[id] — reset password (admin only). */
  resetUserPassword: (id: string, password: string) =>
    j<{ ok: boolean }>(fetch(`/api/users/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })),
  /** DELETE /api/users/[id] — delete user (admin only, cannot delete self). */
  deleteUser: (id: string) =>
    j<{ ok: boolean }>(fetch(`/api/users/${id}`, { method: 'DELETE' })),
  /** POST /api/auth/me/password — change own password (any authenticated user). */
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    j<{ ok: boolean }>(fetch('/api/auth/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })),
  /** GET /api/auth/me — current user profile. */
  me: () => j<{ user: SafeUser | null }>(fetch('/api/auth/me')),
}
