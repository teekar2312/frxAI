// Drizzle ORM Schema — MySQL
// Equivalent to the previous Prisma schema (16 models, same table/column names).
// Table names match Prisma's defaults (PascalCase) so existing MySQL data is preserved.

import {
  mysqlTable,
  varchar,
  text,
  longtext,
  double,
  int,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/mysql-core'
import { relations } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

// ─── Helper ────────────────────────────────────────────────────────────────────
export function generateId(): string {
  return crypto.randomUUID()
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLES
// ═══════════════════════════════════════════════════════════════════════════════

export const accounts = mysqlTable('Account', {
  id:          varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  name:        varchar('name', { length: 255 }).notNull(),
  broker:      varchar('broker', { length: 255 }).default('FINEX Indonesia'),
  server:      varchar('server', { length: 255 }).notNull(),
  login:       varchar('login', { length: 255 }).notNull(),
  accountType: varchar('accountType', { length: 50 }).default('demo'),
  currency:    varchar('currency', { length: 10 }).default('USD'),
  leverage:    varchar('leverage', { length: 20 }).default('1:100'),
  balance:     double('balance', { precision: 53 }).default(10000),
  equity:      double('equity', { precision: 53 }).default(10000),
  margin:      double('margin', { precision: 53 }).default(0),
  freeMargin:  double('freeMargin', { precision: 53 }).default(10000),
  marginLevel: double('marginLevel', { precision: 53 }).default(0),
  connected:   boolean('connected').default(false),
  isDefault:   boolean('isDefault').default(false),
  createdAt:   timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt:   timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [])

export const trades = mysqlTable('Trade', {
  id:           varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  accountId:    varchar('accountId', { length: 30 }).notNull(),
  symbol:       varchar('symbol', { length: 20 }).notNull(),
  side:         varchar('side', { length: 10 }).notNull(),
  lotSize:      double('lotSize', { precision: 53 }).notNull(),
  openPrice:    double('openPrice', { precision: 53 }).notNull(),
  closePrice:   double('closePrice', { precision: 53 }),
  stopLoss:     double('stopLoss', { precision: 53 }),
  takeProfit:   double('takeProfit', { precision: 53 }),
  trailingStop: boolean('trailingStop').default(false),
  trailingPips: double('trailingPips', { precision: 53 }).default(0),
  status:       varchar('status', { length: 20 }).default('open'),
  pnl:          double('pnl', { precision: 53 }).default(0),
  pips:         double('pips', { precision: 53 }).default(0),
  commission:   double('commission', { precision: 53 }).default(0),
  swap:         double('swap', { precision: 53 }).default(0),
  strategy:     varchar('strategy', { length: 100 }).default('scalping-m5'),
  timeframe:    varchar('timeframe', { length: 10 }).default('M5'),
  source:       varchar('source', { length: 20 }).default('manual'),
  comment:      text('comment'),
  mt5Ticket:    int('mt5Ticket'),
  mt5Server:    varchar('mt5Server', { length: 255 }),
  openTime:     timestamp('openTime', { mode: 'date' }).defaultNow().notNull(),
  closeTime:    timestamp('closeTime', { mode: 'date' }),
  createdAt:    timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt:    timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index('idx_trade_accountId').on(table.accountId),
  index('idx_trade_symbol').on(table.symbol),
  index('idx_trade_status').on(table.status),
  index('idx_trade_mt5Ticket').on(table.mt5Ticket),
  index('idx_trade_source').on(table.source),
  index('idx_trade_openTime').on(table.openTime),
  index('idx_trade_accountId_status').on(table.accountId, table.status),
])

export const orders = mysqlTable('Order', {
  id:         varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  accountId:  varchar('accountId', { length: 30 }).notNull(),
  symbol:     varchar('symbol', { length: 20 }).notNull(),
  side:       varchar('side', { length: 10 }).notNull(),
  orderType:  varchar('orderType', { length: 10 }).notNull(),
  lotSize:    double('lotSize', { precision: 53 }).notNull(),
  price:      double('price', { precision: 53 }).notNull(),
  stopLoss:   double('stopLoss', { precision: 53 }),
  takeProfit: double('takeProfit', { precision: 53 }),
  status:     varchar('status', { length: 20 }).default('pending'),
  openTime:   timestamp('openTime', { mode: 'date' }).defaultNow().notNull(),
  createdAt:  timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt:  timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index('idx_order_accountId').on(table.accountId),
])

export const indicators = mysqlTable('Indicator', {
  id:             varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  name:           varchar('name', { length: 255 }).notNull().unique(),
  category:       varchar('category', { length: 50 }).notNull(),
  description:    text('description').notNull(),
  defaultParams:  text('defaultParams').notNull(),
  scalpingPreset: text('scalpingPreset'),
  enabled:        boolean('enabled').default(true),
  autoManaged:    boolean('autoManaged').default(false),
  weight:         double('weight', { precision: 53 }).default(1),
  createdAt:      timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt:      timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
})

export const newsItems = mysqlTable('NewsItem', {
  id:         varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  source:     varchar('source', { length: 50 }).notNull(),
  title:      text('title').notNull(),
  summary:    text('summary').notNull(),
  url:        text('url'),
  category:   varchar('category', { length: 50 }).notNull(),
  impact:     varchar('impact', { length: 10 }).default('medium'),
  sentiment:  varchar('sentiment', { length: 10 }).default('neutral'),
  symbols:    varchar('symbols', { length: 500 }).default(''),
  publishedAt: timestamp('publishedAt', { mode: 'date' }).defaultNow().notNull(),
  createdAt:  timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_newsItem_category').on(table.category),
  index('idx_newsItem_impact').on(table.impact),
  index('idx_newsItem_publishedAt').on(table.publishedAt),
])

export const alerts = mysqlTable('Alert', {
  id:          varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  symbol:      varchar('symbol', { length: 20 }).notNull(),
  condition:   varchar('condition', { length: 20 }).notNull(),
  price:       double('price', { precision: 53 }).notNull(),
  active:      boolean('active').default(true),
  triggered:   boolean('triggered').default(false),
  triggeredAt: timestamp('triggeredAt', { mode: 'date' }),
  notifyEmail: boolean('notifyEmail').default(true),
  message:     text('message'),
  createdAt:   timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt:   timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index('idx_alert_symbol').on(table.symbol),
  index('idx_alert_active').on(table.active),
])

export const logs = mysqlTable('Log', {
  id:        varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  level:     varchar('level', { length: 10 }).notNull(),
  source:    varchar('source', { length: 50 }).default('system'),
  message:   text('message').notNull(),
  stack:     longtext('stack'),
  context:   longtext('context'),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_log_source').on(table.source),
  index('idx_log_level_createdAt').on(table.level, table.createdAt),
])

export const backtests = mysqlTable('Backtest', {
  id:             varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  name:           varchar('name', { length: 255 }).notNull(),
  symbol:         varchar('symbol', { length: 20 }).notNull(),
  timeframe:      varchar('timeframe', { length: 10 }).default('M5'),
  strategy:       varchar('strategy', { length: 100 }).notNull(),
  periodFrom:     timestamp('periodFrom', { mode: 'date' }).notNull(),
  periodTo:       timestamp('periodTo', { mode: 'date' }).notNull(),
  initialCapital: double('initialCapital', { precision: 53 }).notNull(),
  finalCapital:   double('finalCapital', { precision: 53 }).notNull(),
  totalTrades:    int('totalTrades').notNull(),
  winTrades:      int('winTrades').notNull(),
  lossTrades:     int('lossTrades').notNull(),
  winRate:        double('winRate', { precision: 53 }).notNull(),
  profitFactor:   double('profitFactor', { precision: 53 }).notNull(),
  maxDrawdown:    double('maxDrawdown', { precision: 53 }).notNull(),
  sharpeRatio:    double('sharpeRatio', { precision: 53 }).notNull(),
  netProfit:      double('netProfit', { precision: 53 }).notNull(),
  equityCurve:    longtext('equityCurve').notNull(),
  tradesJson:     longtext('tradesJson').notNull(),
  status:         varchar('status', { length: 20 }).default('completed'),
  createdAt:      timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_backtest_symbol').on(table.symbol),
])

export const aiSignals = mysqlTable('AiSignal', {
  id:                varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  symbol:            varchar('symbol', { length: 20 }).notNull(),
  direction:         varchar('direction', { length: 10 }).notNull(),
  confidence:        double('confidence', { precision: 53 }).notNull(),
  timeframe:         varchar('timeframe', { length: 10 }).default('M5'),
  reasoning:         longtext('reasoning').notNull(),
  selectedIndicators: text('selectedIndicators').notNull(),
  factors:           text('factors').notNull(),
  action:            varchar('action', { length: 10 }).default('wait'),
  modelVersion:      varchar('modelVersion', { length: 50 }).default('fx-scalper-v1'),
  accuracy:          double('accuracy', { precision: 53 }).default(0),
  priceAtSignal:     double('priceAtSignal', { precision: 53 }),
  createdAt:         timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_aiSignal_symbol').on(table.symbol),
  index('idx_aiSignal_createdAt').on(table.createdAt),
  index('idx_aiSignal_action').on(table.action),
])

export const aiSignalOutcomes = mysqlTable('AiSignalOutcome', {
  id:            varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  signalId:      varchar('signalId', { length: 30 }).notNull().unique(),
  symbol:        varchar('symbol', { length: 20 }).notNull(),
  direction:     varchar('direction', { length: 10 }).notNull(),
  action:        varchar('action', { length: 10 }).notNull(),
  confidence:    double('confidence', { precision: 53 }).notNull(),
  priceAtSignal: double('priceAtSignal', { precision: 53 }).notNull(),
  priceAtEval:   double('priceAtEval', { precision: 53 }).notNull(),
  priceChange:   double('priceChange', { precision: 53 }).notNull(),
  priceChangePct: double('priceChangePct', { precision: 53 }).notNull(),
  pipsMoved:     double('pipsMoved', { precision: 53 }).notNull(),
  correct:       boolean('correct'),
  evaluatedAt:   timestamp('evaluatedAt', { mode: 'date' }),
}, (table) => [
  index('idx_aiSignalOutcome_symbol').on(table.symbol),
  index('idx_aiSignalOutcome_correct').on(table.correct),
  index('idx_aiSignalOutcome_evaluatedAt').on(table.evaluatedAt),
])

export const riskSettings = mysqlTable('RiskSetting', {
  id:        varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  key:       varchar('key', { length: 255 }).notNull().unique(),
  value:     text('value').notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
})

export const notifications = mysqlTable('Notification', {
  id:        varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  type:      varchar('type', { length: 30 }).notNull(),
  subject:   varchar('subject', { length: 500 }).notNull(),
  body:      text('body').notNull(),
  recipient: varchar('recipient', { length: 255 }).notNull(),
  sent:      boolean('sent').default(false),
  sentAt:    timestamp('sentAt', { mode: 'date' }),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_notification_type').on(table.type),
  index('idx_notification_createdAt').on(table.createdAt),
  index('idx_notification_recipient').on(table.recipient),
])

export const systemConfigs = mysqlTable('SystemConfig', {
  id:        varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  key:       varchar('key', { length: 255 }).notNull().unique(),
  value:     text('value').notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
})

export const users = mysqlTable('User', {
  id:           varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  email:        varchar('email', { length: 255 }).notNull().unique(),
  name:         varchar('name', { length: 255 }).notNull(),
  passwordHash: varchar('passwordHash', { length: 255 }).notNull(),
  role:         varchar('role', { length: 20 }).default('trader'),
  active:       boolean('active').default(true),
  lastLoginAt:  timestamp('lastLoginAt', { mode: 'date' }),
  createdAt:    timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt:    timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index('idx_user_email').on(table.email),
  index('idx_user_role').on(table.role),
])

export const userSessions = mysqlTable('UserSession', {
  id:           varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  userId:       varchar('userId', { length: 30 }).notNull(),
  sessionToken: varchar('sessionToken', { length: 500 }).notNull().unique(),
  expiresAt:    timestamp('expiresAt', { mode: 'date' }).notNull(),
  ipAddress:    varchar('ipAddress', { length: 45 }),
  userAgent:    text('userAgent'),
  createdAt:    timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('idx_userSession_userId').on(table.userId),
  index('idx_userSession_expiresAt').on(table.expiresAt),
])

export const economicEvents = mysqlTable('EconomicEvent', {
  id:         varchar('id', { length: 30 }).primaryKey().$defaultFn(generateId),
  title:      text('title').notNull(),
  country:    varchar('country', { length: 10 }).notNull(),
  currency:   varchar('currency', { length: 10 }).notNull(),
  category:   varchar('category', { length: 50 }).notNull(),
  impact:     varchar('impact', { length: 10 }).notNull(),
  eventTime:  timestamp('eventTime', { mode: 'date' }).notNull(),
  actual:     varchar('actual', { length: 100 }),
  forecast:   varchar('forecast', { length: 100 }),
  previous:   varchar('previous', { length: 100 }),
  surprise:   text('surprise'),
  symbols:    varchar('symbols', { length: 500 }).default(''),
  status:     varchar('status', { length: 20 }).default('upcoming'),
  source:     varchar('source', { length: 50 }).default('marketaux'),
  createdAt:  timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  updatedAt:  timestamp('updatedAt', { mode: 'date' }).defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, (table) => [
  index('idx_economicEvent_eventTime').on(table.eventTime),
  index('idx_economicEvent_impact').on(table.impact),
  index('idx_economicEvent_category').on(table.category),
  index('idx_economicEvent_country').on(table.country),
])

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const accountsRelations = relations(accounts, ({ many }) => ({
  trades: many(trades),
  orders: many(orders),
}))

export const tradesRelations = relations(trades, ({ one }) => ({
  account: one(accounts, { fields: [trades.accountId], references: [accounts.id] }),
}))

export const ordersRelations = relations(orders, ({ one }) => ({
  account: one(accounts, { fields: [orders.accountId], references: [accounts.id] }),
}))

export const aiSignalsRelations = relations(aiSignals, ({ one }) => ({
  outcome: one(aiSignalOutcomes, { fields: [aiSignals.id], references: [aiSignalOutcomes.signalId] }),
}))

export const aiSignalOutcomesRelations = relations(aiSignalOutcomes, ({ one }) => ({
  signal: one(aiSignals, { fields: [aiSignalOutcomes.signalId], references: [aiSignals.id] }),
}))

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
}))

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
}))

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export const countAll = sql<number>`count(*)`

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Trade = typeof trades.$inferSelect
export type NewTrade = typeof trades.$inferInsert
export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
export type Indicator = typeof indicators.$inferSelect
export type NewsItem = typeof newsItems.$inferSelect
export type Alert = typeof alerts.$inferSelect
export type Log = typeof logs.$inferSelect
export type Backtest = typeof backtests.$inferSelect
export type AiSignal = typeof aiSignals.$inferSelect
export type AiSignalOutcome = typeof aiSignalOutcomes.$inferSelect
export type RiskSetting = typeof riskSettings.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type SystemConfig = typeof systemConfigs.$inferSelect
export type User = typeof users.$inferSelect
export type UserSession = typeof userSessions.$inferSelect
export type EconomicEvent = typeof economicEvents.$inferSelect