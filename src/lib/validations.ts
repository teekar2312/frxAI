import { z } from 'zod'

// Trade creation
export const tradeCreateSchema = z.object({
  accountId: z.string().min(1),
  symbol: z.enum(['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']),
  side: z.enum(['buy', 'sell']),
  lotSize: z.number().positive().max(100),
  stopLoss: z.number().positive().optional().nullable(),
  takeProfit: z.number().positive().optional().nullable(),
  source: z.enum(['manual', 'auto', 'ai']).optional().default('manual'),
  trailingStop: z.boolean().optional().default(false),
  trailingPips: z.number().min(0).optional().default(0),
  comment: z.string().max(500).optional().nullable(),
})

// Order creation
export const orderCreateSchema = z.object({
  accountId: z.string().min(1),
  symbol: z.enum(['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']),
  side: z.enum(['buy', 'sell']),
  orderType: z.enum(['limit', 'stop']),
  lotSize: z.number().positive().max(100),
  price: z.number().positive(),
  stopLoss: z.number().positive().optional().nullable(),
  takeProfit: z.number().positive().optional().nullable(),
})

// Account creation
export const accountCreateSchema = z.object({
  name: z.string().min(1).max(100),
  broker: z.string().max(100).optional().default('FINEX Indonesia'),
  server: z.string().max(200).optional().default(''),
  login: z.string().min(1).max(50),
  accountType: z.enum(['demo', 'live']).optional().default('demo'),
  currency: z.string().max(10).optional().default('USD'),
  leverage: z.string().max(20).optional().default('1:100'),
  balance: z.number().min(0).optional().default(10000),
  isDefault: z.boolean().optional().default(false),
})

// Alert creation
export const alertCreateSchema = z.object({
  symbol: z.enum(['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']),
  condition: z.enum(['above', 'below', 'cross_up', 'cross_down']),
  price: z.number().positive(),
  notifyEmail: z.boolean().optional().default(true),
  message: z.string().max(500).optional().nullable(),
})

// AI analyze
export const aiAnalyzeSchema = z.object({
  symbol: z.enum(['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']),
  timeframe: z.enum(['M1', 'M5', 'M15', 'H1']).optional().default('M5'),
})

// Backtest
export const backtestCreateSchema = z.object({
  name: z.string().min(1).max(200),
  symbol: z.enum(['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']),
  timeframe: z.enum(['M1', 'M5', 'M15', 'H1']).optional(),
  strategy: z.string().min(1),
  periodFrom: z.string().datetime().optional(),
  periodTo: z.string().datetime().optional(),
  initialCapital: z.number().min(100).optional().default(10000),
  riskPerTradePct: z.number().min(0.1).max(10).optional(),
  stopLossPips: z.number().min(1).max(100).optional(),
  riskReward: z.number().min(0.5).max(10).optional(),
})

// User creation
export const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6).max(128),
  role: z.enum(['admin', 'trader', 'viewer']).default('trader'),
})

// Password change
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6).max(128),
})

// Partial close
export const partialCloseSchema = z.object({
  percent: z.number().min(1).max(100).default(50),
})

// Move to break-even
export const moveToBESchema = z.object({
  bufferPips: z.number().min(0).max(50).default(0),
})

// System config
export const systemConfigSchema = z.object({
  config: z.record(z.string(), z.string().max(2000)),
})

// Risk settings
export const riskSettingsSchema = z.object({
  settings: z.record(z.string(), z.string().max(2000)),
})

// Close all
export const closeAllSchema = z.object({
  accountId: z.string().optional(),
  reason: z.string().max(200).optional(),
})

// Kill switch
export const killSwitchSchema = z.object({
  accountId: z.string().optional(),
  reason: z.string().max(200).optional(),
})

// MT5 connect
export const mt5ConnectSchema = z.object({
  login: z.number().int().positive(),
  server: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
  accountId: z.string().optional(),
})

// Log creation
export const logCreateSchema = z.object({
  level: z.enum(['info', 'warn', 'error']),
  source: z.string().min(1).max(50),
  message: z.string().min(1).max(5000),
  stack: z.string().max(10000).optional().nullable(),
  context: z.unknown().optional().nullable(),
})

// User update (admin — role/active/name)
export const userUpdateSchema = z.object({
  role: z.enum(['admin', 'trader', 'viewer']).optional(),
  active: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
})

// Password reset (admin resets another user's password)
export const passwordResetSchema = z.object({
  password: z.string().min(6).max(128),
})

// Trade update (SL/TP/trailing/comment on open trade)
export const tradeUpdateSchema = z.object({
  stopLoss: z.number().positive().optional().nullable(),
  takeProfit: z.number().positive().optional().nullable(),
  trailingStop: z.boolean().optional(),
  trailingPips: z.number().min(0).max(500).optional(),
  comment: z.string().max(500).optional().nullable(),
})

// Trade notes (journal comment)
export const tradeNotesSchema = z.object({
  comment: z.string().max(500).optional().nullable(),
})

// Alert update (active/triggered/triggeredAt)
export const alertUpdateSchema = z.object({
  active: z.boolean().optional(),
  triggered: z.boolean().optional(),
  triggeredAt: z.string().datetime().optional().nullable(),
})

// Indicator update (enabled/autoManaged/weight)
export const indicatorUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  autoManaged: z.boolean().optional(),
  weight: z.number().min(0).max(100).optional(),
})

// Backtest optimize
export const backtestOptimizeSchema = z.object({
  periodFrom: z.string().datetime().optional(),
  periodTo: z.string().datetime().optional(),
  initialCapital: z.number().min(100).max(10_000_000).optional().default(10000),
})

// MT5 reconcile
export const reconcileSchema = z.object({
  accountId: z.string().optional(),
})

// AI evaluate
export const aiEvaluateSchema = z.object({
  signalId: z.string().optional(),
})

// Helper to validate and return parsed data or error response
export function validateBody<T>(schema: z.ZodType<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; error: { error: string; status: 400 } } {
  const result = schema.safeParse(body)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const firstError = result.error.issues?.[0]
  const message = firstError
    ? `${firstError.path.join('.')}: ${firstError.message}`
    : 'Invalid input'
  return { success: false, error: { error: message, status: 400 } }
}