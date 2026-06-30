// Shared strategy library for FinexFX backtesting.
// This is imported by both the strategies API route and the backtest API route.

export interface Strategy {
  id: string
  name: string
  timeframe: string
  description: string
  active: boolean
  category: 'trend' | 'mean-reversion' | 'breakout' | 'momentum' | 'news'
  engine: 'ema-cross' | 'rsi-reversal' | 'bollinger' | 'breakout' | 'momentum' | 'news-spike'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  preset: {
    riskPerTradePct: number
    stopLossPips: number
    riskReward: number
    emaFast: number
    emaSlow: number
    rsiPeriod: number
    rsiOverbought: number
    rsiOversold: number
  }
  expectedWinRate: string
  bestSession: string
  bestPairs: string[]
  pros: string[]
  cons: string[]
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'scalping-m5',
    name: 'Scalping M5 (EMA Crossover)',
    timeframe: 'M5',
    description: 'EMA 8/21 crossover + RSI 14 filter. Classic scalping confluence with tight stops.',
    active: true,
    category: 'trend',
    engine: 'ema-cross',
    difficulty: 'beginner',
    preset: {
      riskPerTradePct: 0.75,
      stopLossPips: 10,
      riskReward: 1.5,
      emaFast: 8,
      emaSlow: 21,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
    },
    expectedWinRate: '55-62%',
    bestSession: 'London / NY Overlap',
    bestPairs: ['EURUSD', 'GBPUSD', 'USDJPY'],
    pros: ['Sederhana & cepat', 'Banyak sinyal per hari', 'Risk kecil per trade'],
    cons: ['False signal di Asian session', 'Spread-sensitive'],
  },
  {
    id: 'rsi-reversal',
    name: 'RSI Reversal (Overbought/Oversold)',
    timeframe: 'M5',
    description: 'Fade extreme RSI readings (≥70 sell, ≤30 buy) with mean-reversion confirmation.',
    active: false,
    category: 'mean-reversion',
    engine: 'rsi-reversal',
    difficulty: 'intermediate',
    preset: {
      riskPerTradePct: 0.5,
      stopLossPips: 8,
      riskReward: 2.0,
      emaFast: 5,
      emaSlow: 13,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
    },
    expectedWinRate: '60-68%',
    bestSession: 'Asian Range',
    bestPairs: ['EURUSD', 'GBPUSD'],
    pros: ['Win rate tinggi di range', 'TP cepat', 'Cocok untuk Asian session'],
    cons: ['Trending market = rugi', 'Perlu konfirmasi support/resistance'],
  },
  {
    id: 'bollinger-bounce',
    name: 'Bollinger Band Bounce',
    timeframe: 'M5',
    description: 'Trade bounces off outer Bollinger Bands (2σ) back to the mean. Range-fading strategy.',
    active: false,
    category: 'mean-reversion',
    engine: 'bollinger',
    difficulty: 'intermediate',
    preset: {
      riskPerTradePct: 0.5,
      stopLossPips: 20,
      riskReward: 1.5,
      emaFast: 20,
      emaSlow: 50,
      rsiPeriod: 14,
      rsiOverbought: 75,
      rsiOversold: 25,
    },
    expectedWinRate: '58-65%',
    bestSession: 'Asian / Late NY',
    bestPairs: ['EURUSD', 'USDJPY', 'XAUUSD'],
    pros: ['Clear entry rules', 'Target = middle band', 'Baik di sideways market'],
    cons: ['Loss besar saat breakout', 'Tidak cocok London open'],
  },
  {
    id: 'london-breakout',
    name: 'London Open Breakout',
    timeframe: 'M5',
    description: 'Trade the breakout of the Asian session range at London open (07:00-08:00 UTC).',
    active: false,
    category: 'breakout',
    engine: 'breakout',
    difficulty: 'advanced',
    preset: {
      riskPerTradePct: 1.0,
      stopLossPips: 15,
      riskReward: 2.5,
      emaFast: 13,
      emaSlow: 34,
      rsiPeriod: 14,
      rsiOverbought: 65,
      rsiOversold: 35,
    },
    expectedWinRate: '50-58%',
    bestSession: 'London Open',
    bestPairs: ['GBPUSD', 'EURUSD'],
    pros: ['Move besar (50-100p)', 'Win rate moderat tapi R:R tinggi', 'Waktu terprediksi'],
    cons: ['False breakout sering', 'Hanya 1-2 setup per hari', 'Spread melebar saat open'],
  },
  {
    id: 'news-spike',
    name: 'News Spike Scalper',
    timeframe: 'M1',
    description: 'Trade post-news volatility spikes with tight SL. Enter on momentum continuation.',
    active: false,
    category: 'news',
    engine: 'news-spike',
    difficulty: 'advanced',
    preset: {
      riskPerTradePct: 1.0,
      stopLossPips: 6,
      riskReward: 2.0,
      emaFast: 5,
      emaSlow: 13,
      rsiPeriod: 7,
      rsiOverbought: 80,
      rsiOversold: 20,
    },
    expectedWinRate: '45-55%',
    bestSession: 'NFP / CPI / FOMC releases',
    bestPairs: ['XAUUSD', 'EURUSD', 'USDJPY'],
    pros: ['Move ekstrem (100p+)', 'Sangat cepat (detik-menit)', 'High R:R potensial'],
    cons: ['Slippage tinggi', 'Spread melebar 5-20x', 'Butuh eksekusi kilat'],
  },
  {
    id: 'overlap-momentum',
    name: 'London-NY Overlap Momentum',
    timeframe: 'M5',
    description: 'Ride the momentum during London-NY overlap (13:00-16:00 UTC) with VWAP + EMA.',
    active: false,
    category: 'momentum',
    engine: 'momentum',
    difficulty: 'intermediate',
    preset: {
      riskPerTradePct: 0.75,
      stopLossPips: 12,
      riskReward: 2.0,
      emaFast: 13,
      emaSlow: 34,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
    },
    expectedWinRate: '52-60%',
    bestSession: 'London-NY Overlap',
    bestPairs: ['EURUSD', 'GBPUSD', 'USDJPY'],
    pros: ['Likuiditas tertinggi', 'Trend jelas', 'Spread paling ketat'],
    cons: ['Hanya aktif 3 jam/hari', 'Whipsaw di overlap open'],
  },
  {
    id: 'ema-cross-m15',
    name: 'EMA Crossover Swing (M15)',
    timeframe: 'M15',
    description: 'Slower EMA 21/55 crossover on M15 for swing entries. Lower noise, bigger targets.',
    active: false,
    category: 'trend',
    engine: 'ema-cross',
    difficulty: 'beginner',
    preset: {
      riskPerTradePct: 1.0,
      stopLossPips: 20,
      riskReward: 2.5,
      emaFast: 21,
      emaSlow: 55,
      rsiPeriod: 14,
      rsiOverbought: 70,
      rsiOversold: 30,
    },
    expectedWinRate: '50-57%',
    bestSession: 'London / NY',
    bestPairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'],
    pros: ['Sinyal lebih reliable', 'Hold lebih lama (1-2 jam)', 'Less screen time'],
    cons: ['Sinyal lebih sedikit', 'Butuh patience', 'SL lebih lebar'],
  },
]

export function findStrategy(id: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.id === id)
}
