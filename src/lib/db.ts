import 'server-only'
import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import * as schema from './db/schema'

let _db: ReturnType<typeof drizzle> | null = null

function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  const pool = mysql.createPool(process.env.DATABASE_URL)
  return drizzle(pool, { schema, mode: 'default' })
}

/**
 * Drizzle ORM instance — MySQL connection pool.
 *
 * All 45 consumer files import `{ db }` from here.
 * The pool is created lazily and cached in globalThis for dev HMR.
 */
export const db = _db ?? createDb()

// Cache in globalThis to survive HMR in development
if (process.env.NODE_ENV !== 'production') {
  const g = globalThis as unknown as { __frxAIDb?: typeof db }
  if (!g.__frxAIDb) g.__frxAIDb = db
}

// Re-export schema tables and helpers for convenience
export {
  accounts,
  trades,
  orders,
  indicators,
  newsItems,
  alerts,
  logs,
  backtests,
  aiSignals,
  aiSignalOutcomes,
  riskSettings,
  notifications,
  systemConfigs,
  users,
  userSessions,
  economicEvents,
  generateId,
  countAll,
  type Account,
  type NewAccount,
  type Trade,
  type NewTrade,
  type Order,
  type NewOrder,
  type Indicator,
  type NewsItem,
  type Alert,
  type Log,
  type Backtest,
  type AiSignal,
  type AiSignalOutcome,
  type RiskSetting,
  type Notification,
  type SystemConfig,
  type User,
  type UserSession,
  type EconomicEvent,
} from './db/schema'

// Re-export Drizzle operators for consumer files
export { eq, ne, and, or, not, inArray, isNull, isNotNull, sql, desc, asc, like, gte, lte, gt, lt, between, exists } from 'drizzle-orm'