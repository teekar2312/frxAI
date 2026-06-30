'use client'

import {
  LayoutDashboard, CandlestickChart, Brain, Newspaper, Gauge,
  FlaskConical, ShieldAlert, BellRing, ScrollText, Settings,
  CalendarClock, BarChart3,
} from 'lucide-react'

export type SectionId =
  | 'dashboard' | 'trading' | 'ai' | 'news' | 'indicators'
  | 'backtest' | 'risk' | 'alerts' | 'logs' | 'settings'
  | 'calendar' | 'analytics'

export interface NavItem {
  id: SectionId
  label: string
  short: string
  icon: any
  description: string
  group: 'monitor' | 'trade' | 'system'
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, description: 'Ringkasan ekuitas, P&L harian, sesi, AI signal', group: 'monitor' },
  { id: 'trading', label: 'Live Trading', short: 'Trade', icon: CandlestickChart, description: 'Eksekusi order, posisi terbuka, trailing stop', group: 'trade' },
  { id: 'ai', label: 'AI Analysis', short: 'AI', icon: Brain, description: 'Sinyal ML, auto-select pair & indikator, self-learning', group: 'trade' },
  { id: 'calendar', label: 'Economic Calendar', short: 'Kalender', icon: CalendarClock, description: 'Event makro: NFP, CPI, GDP, Bank Sentral', group: 'monitor' },
  { id: 'news', label: 'News Feed', short: 'News', icon: Newspaper, description: 'Finnhub & MARKETAUX, 7 dimensi analisa', group: 'monitor' },
  { id: 'analytics', label: 'Trade Analytics', short: 'Analytics', icon: BarChart3, description: 'Jurnal performa: win rate, P&L per pair/sesi', group: 'trade' },
  { id: 'indicators', label: 'Indikator Pool', short: 'Indikator', icon: Gauge, description: '30 indikator teknikal + preset scalping', group: 'trade' },
  { id: 'backtest', label: 'Backtesting', short: 'Backtest', icon: FlaskConical, description: 'Simulasi strategi & equity curve', group: 'trade' },
  { id: 'risk', label: 'Risk Management', short: 'Risk', icon: ShieldAlert, description: 'Risk per trade, SL, RR, daily limit', group: 'system' },
  { id: 'alerts', label: 'Price Alerts', short: 'Alerts', icon: BellRing, description: 'Notifikasi harga & email', group: 'system' },
  { id: 'logs', label: 'Error Logs', short: 'Logs', icon: ScrollText, description: 'Log MT5, AI, risk, API, websocket', group: 'system' },
  { id: 'settings', label: 'Settings', short: 'Setup', icon: Settings, description: 'Akun MT5, broker, API keys, email', group: 'system' },
]
