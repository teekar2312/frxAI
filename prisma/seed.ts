import { db } from '../src/lib/db'

const SYMBOLS = ['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']

// ===== Indicator Pool (scalping-optimized) =====
const INDICATORS = [
  { name: 'EMA', category: 'trend', description: 'Exponential Moving Average — responsive trend filter for scalping.', defaultParams: JSON.stringify({ fast: 9, medium: 21, slow: 50 }), scalpingPreset: JSON.stringify({ fast: 8, medium: 21, slow: 50 }) },
  { name: 'SMA', category: 'trend', description: 'Simple Moving Average — baseline trend reference.', defaultParams: JSON.stringify({ period: 20 }), scalpingPreset: JSON.stringify({ period: 20 }) },
  { name: 'VWAP', category: 'trend', description: 'Volume Weighted Average Price — intraday fair value anchor.', defaultParams: JSON.stringify({ anchor: 'session' }), scalpingPreset: JSON.stringify({ anchor: 'session' }) },
  { name: 'Supertrend', category: 'trend', description: 'ATR-based trend follower with clear flip signals.', defaultParams: JSON.stringify({ atrPeriod: 10, multiplier: 3 }), scalpingPreset: JSON.stringify({ atrPeriod: 10, multiplier: 2.5 }) },
  { name: 'Parabolic SAR', category: 'trend', description: 'Stop-and-reverse trailing dots for trend exits.', defaultParams: JSON.stringify({ step: 0.02, max: 0.2 }), scalpingPreset: JSON.stringify({ step: 0.02, max: 0.2 }) },
  { name: 'Ichimoku Cloud', category: 'trend', description: 'Multi-line equilibrium system for trend & support.', defaultParams: JSON.stringify({ conversion: 9, base: 26, span: 52 }), scalpingPreset: JSON.stringify({ conversion: 7, base: 22, span: 44 }) },
  { name: 'Hull Moving Average', category: 'trend', description: 'HMA — smoothed, low-lag trend line.', defaultParams: JSON.stringify({ period: 16 }), scalpingPreset: JSON.stringify({ period: 14 }) },
  { name: 'RSI', category: 'oscillator', description: 'Relative Strength Index — momentum & overbought/oversold.', defaultParams: JSON.stringify({ period: 14 }), scalpingPreset: JSON.stringify({ period: 7 }) },
  { name: 'Stochastic Oscillator', category: 'oscillator', description: '%K/%D momentum oscillator for reversals.', defaultParams: JSON.stringify({ k: 14, d: 3, smooth: 3 }), scalpingPreset: JSON.stringify({ k: 9, d: 3, smooth: 3 }) },
  { name: 'MACD', category: 'oscillator', description: 'Moving Average Convergence Divergence — momentum & trend.', defaultParams: JSON.stringify({ fast: 12, slow: 26, signal: 9 }), scalpingPreset: JSON.stringify({ fast: 8, slow: 21, signal: 5 }) },
  { name: 'CCI', category: 'oscillator', description: 'Commodity Channel Index — cyclical momentum.', defaultParams: JSON.stringify({ period: 20 }), scalpingPreset: JSON.stringify({ period: 14 }) },
  { name: 'Momentum Indicator', category: 'oscillator', description: 'Rate of price change over N bars.', defaultParams: JSON.stringify({ period: 10 }), scalpingPreset: JSON.stringify({ period: 7 }) },
  { name: "Williams %R", category: 'oscillator', description: 'Williams Percent Range — overbought/oversold.', defaultParams: JSON.stringify({ period: 14 }), scalpingPreset: JSON.stringify({ period: 7 }) },
  { name: 'TSI', category: 'oscillator', description: 'True Strength Index — double-smoothed momentum.', defaultParams: JSON.stringify({ long: 25, short: 13, signal: 13 }), scalpingPreset: JSON.stringify({ long: 20, short: 10, signal: 8 }) },
  { name: 'ROC', category: 'oscillator', description: 'Rate of Change — % change over N bars.', defaultParams: JSON.stringify({ period: 12 }), scalpingPreset: JSON.stringify({ period: 6 }) },
  { name: 'Schaff Trend Cycle', category: 'oscillator', description: 'STC — MACD + stochastic cycle fusion.', defaultParams: JSON.stringify({ cycle: 10, fast: 23, slow: 50 }), scalpingPreset: JSON.stringify({ cycle: 10, fast: 20, slow: 50 }) },
  { name: 'Ultimate Oscillator', category: 'oscillator', description: 'Multi-period weighted momentum.', defaultParams: JSON.stringify({ p1: 7, p2: 14, p3: 28 }), scalpingPreset: JSON.stringify({ p1: 5, p2: 10, p3: 20 }) },
  { name: 'Bollinger Bands', category: 'volatility', description: 'Mean-reversion bands via std-dev.', defaultParams: JSON.stringify({ period: 20, std: 2 }), scalpingPreset: JSON.stringify({ period: 20, std: 2 }) },
  { name: 'ATR', category: 'volatility', description: 'Average True Range — SL sizing & volatility gauge.', defaultParams: JSON.stringify({ period: 14 }), scalpingPreset: JSON.stringify({ period: 10 }) },
  { name: 'Standard Deviation', category: 'volatility', description: 'Price dispersion for regime detection.', defaultParams: JSON.stringify({ period: 20 }), scalpingPreset: JSON.stringify({ period: 14 }) },
  { name: 'Chaikin Volatility', category: 'volatility', description: 'EMA-based rate of volatility change.', defaultParams: JSON.stringify({ period: 10, roc: 10 }), scalpingPreset: JSON.stringify({ period: 7, roc: 5 }) },
  { name: 'Volatility Ratio', category: 'volatility', description: 'Current TR / ATR — breakout filter.', defaultParams: JSON.stringify({ period: 14 }), scalpingPreset: JSON.stringify({ period: 10 }) },
  { name: 'Keltner Channel', category: 'channel', description: 'ATR-based channel around EMA.', defaultParams: JSON.stringify({ ema: 20, atr: 10, mult: 2 }), scalpingPreset: JSON.stringify({ ema: 20, atr: 10, mult: 1.8 }) },
  { name: 'Donchian Channel', category: 'channel', description: 'N-period high/low breakout channel.', defaultParams: JSON.stringify({ period: 20 }), scalpingPreset: JSON.stringify({ period: 12 }) },
  { name: 'Linear Regression Channel', category: 'regression', description: 'Best-fit channel with std-dev bounds.', defaultParams: JSON.stringify({ period: 20, std: 2 }), scalpingPreset: JSON.stringify({ period: 14, std: 2 }) },
  { name: 'OBV', category: 'volume', description: 'On Balance Volume — cumulative volume flow.', defaultParams: JSON.stringify({}), scalpingPreset: JSON.stringify({}) },
  { name: 'Money Flow Index', category: 'volume', description: 'MFI — volume-weighted RSI.', defaultParams: JSON.stringify({ period: 14 }), scalpingPreset: JSON.stringify({ period: 10 }) },
  { name: 'Tick Volume', category: 'volume', description: 'MT5 tick volume proxy for liquidity bursts.', defaultParams: JSON.stringify({}), scalpingPreset: JSON.stringify({}) },
  { name: 'Volume Profile', category: 'volume', description: 'Horizontal volume distribution (POC/VAH/VAL).', defaultParams: JSON.stringify({ sessions: 5 }), scalpingPreset: JSON.stringify({ sessions: 3 }) },
  { name: 'Accumulation Distribution', category: 'volume', description: 'Chaikin A/D — money flow line.', defaultParams: JSON.stringify({}), scalpingPreset: JSON.stringify({}) },
]

const RISK_DEFAULTS: Record<string, string> = {
  riskPerTradePct: '0.75',        // 0.5 - 1
  stopLossPipsMin: '5',
  stopLossPipsMax: '15',
  riskRewardRatio: '1.5',          // 1:1.5
  maxOpenPositions: '3',
  dailyRiskLimitPct: '2.5',        // 2 - 3
  dailyTargetPct: '2',             // 1 - 3
  avoidHighImpactNews: 'true',
  autoSelectPair: 'true',
  autoSelectTimeframe: 'true',
  autoSelectIndicators: 'true',
  tradingSessions: 'london,overlap',
  autoTradingEnabled: 'false',
  trailingStopMode: 'auto',        // manual | auto
  trailingStopPips: '5',
  mlSelfLearning: 'true',
  brokerSpreadMajorFromPip: '0.0',
  brokerCommissionPerLot: '2.5',
  brokerMaxLeverage: '1:100',
}

const SYSTEM_CONFIG_DEFAULTS: Record<string, string> = {
  brokerName: 'FINEX Indonesia',
  brokerServer: 'Finex-Live',
  mt5Path: 'C:\\Program Files\\Finex MetaTrader 5\\terminal64.exe',
  pythonVersion: '3.14',
  finnhubApiKey: 'demo',
  marketauxApiKey: 'demo',
  emailEnabled: 'true',
  emailRecipient: 'trader@example.com',
  emailSmtpHost: 'smtp.example.com',
  emailSmtpPort: '587',
  newsRefreshMinutes: '15',
}

async function main() {
  console.log('🌱 Seeding database...')

  // Accounts
  const existingAccounts = await db.account.count()
  if (existingAccounts === 0) {
    await db.account.createMany({
      data: [
        { name: 'Demo Scalper', broker: 'FINEX Indonesia', server: 'Finex-Demo', login: '50123456', accountType: 'demo', currency: 'USD', leverage: '1:100', balance: 10000, equity: 10000, freeMargin: 10000, isDefault: true, connected: true },
        { name: 'Live Scalper', broker: 'FINEX Indonesia', server: 'Finex-Live', login: '90011223', accountType: 'live', currency: 'USD', leverage: '1:100', balance: 5000, equity: 5000, freeMargin: 5000, isDefault: false, connected: false },
      ],
    })
    console.log('  ✓ 2 accounts (demo + live)')
  }

  // Indicators
  const existingIndicators = await db.indicator.count()
  if (existingIndicators === 0) {
    await db.indicator.createMany({
      data: INDICATORS.map((i, idx) => ({
        name: i.name,
        category: i.category,
        description: i.description,
        defaultParams: i.defaultParams,
        scalpingPreset: i.scalpingPreset,
        enabled: idx < 12, // first 12 (core scalping set) enabled by default
        autoManaged: idx < 12,
        weight: 1 - idx * 0.02,
      })),
    })
    console.log(`  ✓ ${INDICATORS.length} indicators`)
  }

  // Risk settings
  const existingRisk = await db.riskSetting.count()
  if (existingRisk === 0) {
    await db.riskSetting.createMany({
      data: Object.entries(RISK_DEFAULTS).map(([key, value]) => ({ key, value })),
    })
    console.log('  ✓ risk settings')
  }

  // System config
  const existingConfig = await db.systemConfig.count()
  if (existingConfig === 0) {
    await db.systemConfig.createMany({
      data: Object.entries(SYSTEM_CONFIG_DEFAULTS).map(([key, value]) => ({ key, value })),
    })
    console.log('  ✓ system config')
  }

  // Sample news
  const existingNews = await db.newsItem.count()
  if (existingNews === 0) {
    await db.newsItem.createMany({
      data: [
        { source: 'marketaux', title: 'ECB Holds Rates, Signals Data-Dependent Path on EUR', summary: 'European Central Bank keeps policy rate unchanged, emphasizing incoming inflation data before any move. EUR crosses saw elevated volatility.', category: 'central_bank', impact: 'high', sentiment: 'bullish', symbols: 'EURUSD,GBPUSD', publishedAt: new Date(Date.now() - 1000 * 60 * 35) },
        { source: 'finnhub', title: 'US Non-Farm Payroll Beats at 256K vs 164K Expected', summary: 'Labor market resilience pressures Fed cut timeline. USD strengthened across majors, XAUUSD sold off on real-yield jump.', category: 'nfp', impact: 'high', sentiment: 'bullish', symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD', publishedAt: new Date(Date.now() - 1000 * 60 * 120) },
        { source: 'marketaux', title: 'US CPI Cools to 2.4% YoY, Core Softens', summary: 'Headline inflation eases; core CPI below consensus. Dollar index dropped, gold rallied on dovish repricing.', category: 'cpi', impact: 'high', sentiment: 'bearish', symbols: 'USDJPY,XAUUSD', publishedAt: new Date(Date.now() - 1000 * 60 * 240) },
        { source: 'finnhub', title: 'BoJ Governor Hints at Gradual Normalization', summary: 'Bank of Japan signals patience on rate hikes; JPY weakens vs USD on yield differential.', category: 'central_bank', impact: 'medium', sentiment: 'bearish', symbols: 'USDJPY', publishedAt: new Date(Date.now() - 1000 * 60 * 60) },
        { source: 'marketaux', title: 'Middle East Tensions Rise: Safe-Haven Flows to Gold', summary: 'Geopolitical risk premium lifts gold above key resistance; risk-off tone in FX.', category: 'geopolitical', impact: 'high', sentiment: 'bullish', symbols: 'XAUUSD,USDJPY', publishedAt: new Date(Date.now() - 1000 * 60 * 90) },
        { source: 'finnhub', title: 'US Retail Sales Beat Expectations at 0.6% MoM', summary: 'Consumer strength supports soft-landing narrative; USD firms modestly.', category: 'retail', impact: 'medium', sentiment: 'bullish', symbols: 'EURUSD,GBPUSD', publishedAt: new Date(Date.now() - 1000 * 60 * 180) },
        { source: 'marketaux', title: 'Manufacturing PMI Returns to Expansion at 50.9', summary: 'ISM PMI above 50 lifts risk sentiment; commodity currencies firm.', category: 'pmi', impact: 'medium', sentiment: 'bullish', symbols: 'EURUSD,GBPUSD', publishedAt: new Date(Date.now() - 1000 * 60 * 150) },
        { source: 'finnhub', title: 'BREAKING: Fed Official Hints at December Cut', summary: 'FOMC member signals openness to rate cut, sending USD lower and gold to session highs.', category: 'breaking', impact: 'high', sentiment: 'bearish', symbols: 'EURUSD,USDJPY,GBPUSD,XAUUSD', publishedAt: new Date(Date.now() - 1000 * 60 * 12) },
      ],
    })
    console.log('  ✓ 8 news items')
  }

  // Sample AI signals
  const existingSignals = await db.aiSignal.count()
  if (existingSignals === 0) {
    await db.aiSignal.createMany({
      data: [
        { symbol: 'EURUSD', direction: 'long', confidence: 78, timeframe: 'M5', reasoning: 'EMA(8>21) bullish cross + VWAP support hold + RSI(7) rebound from 38 + supertrend green + ECB hawkish hold supports EUR. Avoiding NFP window.', selectedIndicators: JSON.stringify(['EMA','VWAP','Supertrend','RSI','ATR']), factors: JSON.stringify({ centralBank: 0.8, nfp: -0.3, cpi: 0.2, geopolitical: 0.1, sentiment: 0.4 }), action: 'buy', accuracy: 64.2 },
        { symbol: 'USDJPY', direction: 'short', confidence: 71, timeframe: 'M5', reasoning: 'Price below VWAP, MACD bearish histogram, stochastic overbought reversal, BoJ normalization path caps USD upside.', selectedIndicators: JSON.stringify(['EMA','VWAP','MACD','Stochastic','Supertrend']), factors: JSON.stringify({ centralBank: -0.7, geopolitical: 0.2, sentiment: -0.3 }), action: 'sell', accuracy: 61.8 },
        { symbol: 'GBPUSD', direction: 'neutral', confidence: 54, timeframe: 'M5', reasoning: 'Mixed signals: BoE divergent from ECB/Fed, Bollinger squeeze, awaiting UK CPI. Stand aside.', selectedIndicators: JSON.stringify(['EMA','Bollinger Bands','RSI','ATR']), factors: JSON.stringify({ centralBank: 0.0, cpi: 0.0, sentiment: 0.0 }), action: 'wait', accuracy: 58.4 },
        { symbol: 'XAUUSD', direction: 'long', confidence: 83, timeframe: 'M5', reasoning: 'Geopolitical risk premium + dovish Fed repricing + USD weakness + RSI momentum not overbought + supertrend green. Strong confluence long.', selectedIndicators: JSON.stringify(['Supertrend','EMA','RSI','VWAP','ATR']), factors: JSON.stringify({ geopolitical: 0.9, centralBank: 0.6, commodity: 0.7, sentiment: 0.5 }), action: 'buy', accuracy: 67.1 },
      ],
    })
    console.log('  ✓ 4 AI signals')
  }

  // Sample logs
  const existingLogs = await db.log.count()
  if (existingLogs === 0) {
    await db.log.createMany({
      data: [
        { level: 'info', source: 'mt5', message: 'MT5 terminal connected (Demo account 50123456 @ Finex-Demo)', createdAt: new Date(Date.now() - 1000 * 60 * 30) },
        { level: 'info', source: 'ai', message: 'AI model fx-scalper-v1 loaded. Rolling accuracy 64.2% over last 120 trades.', createdAt: new Date(Date.now() - 1000 * 60 * 28) },
        { level: 'warn', source: 'risk', message: 'Daily risk usage approaching 60% (1.5% of 2.5% limit). Throttling new entries.', createdAt: new Date(Date.now() - 1000 * 60 * 18) },
        { level: 'error', source: 'api', message: 'Finnhub API rate limit (429) — falling back to cached news.', createdAt: new Date(Date.now() - 1000 * 60 * 10) },
        { level: 'info', source: 'ws', message: 'Price tick stream active for 4 symbols @ 1s interval.', createdAt: new Date(Date.now() - 1000 * 60 * 5) },
      ],
    })
    console.log('  ✓ 5 logs')
  }

  console.log('✅ Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
