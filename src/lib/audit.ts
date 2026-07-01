import 'server-only'
import { db, logs } from './db'
import { logInfo, logWarn, logError } from './logger'

export type AuditAction =
  | 'trade.open' | 'trade.close' | 'trade.close-all' | 'trade.partial-close'
  | 'trade.move-be' | 'order.create' | 'order.cancel' | 'order.trigger'
  | 'account.create' | 'account.update' | 'account.delete' | 'account.connect' | 'account.disconnect'
  | 'alert.create' | 'alert.trigger' | 'alert.update' | 'alert.delete'
  | 'ai.signal' | 'ai.auto-trade' | 'ai.evaluate'
  | 'risk.setting-change' | 'risk.kill-switch'
  | 'user.create' | 'user.update' | 'user.delete' | 'user.login' | 'user.logout'
  | 'backtest.run'
  | 'system.config-change' | 'system.backup' | 'system.webhook'

interface AuditEntry {
  action: AuditAction
  actor?: string // user email or 'system'
  resource: string // e.g. trade ID, account ID
  resourceType: string // e.g. 'trade', 'account'
  details: Record<string, unknown>
  level?: 'info' | 'warn' | 'error'
}

/**
 * Log a structured audit entry to both:
 * 1. The Log table (for in-app viewing)
 * 2. Console (for server logs)
 *
 * Audit entries provide a complete, queryable trail of all system actions.
 * Use this instead of raw logInfo() for trade/account operations.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const level = entry.level || (entry.action.includes('kill-switch') || entry.action.includes('error') ? 'warn' : 'info')
  const source = entry.action.split('.')[0] // e.g. 'trade', 'ai', 'risk'

  // Log to database
  await db.insert(logs).values({
    level,
    source,
    message: `[AUDIT] ${entry.action}: ${entry.resourceType}=${entry.resource}${entry.actor ? ` by ${entry.actor}` : ''}`,
    context: JSON.stringify({
      action: entry.action,
      resource: entry.resource,
      resourceType: entry.resourceType,
      actor: entry.actor,
      ...entry.details,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // If DB write fails, still log to console
    console.error(`[AUDIT-DB-FAIL] ${entry.action} ${entry.resourceType}=${entry.resource}`)
  })

  // Also log to console for server log visibility
  const logFn = level === 'error' ? logError : level === 'warn' ? logWarn : logInfo
  await logFn(source, `${entry.action}: ${entry.resourceType}=${entry.resource}`, entry.details).catch(() => {})
}

// Convenience helpers for common actions
export const auditTrade = {
  open: (tradeId: string, details: Record<string, unknown>) =>
    audit({ action: 'trade.open', resource: tradeId, resourceType: 'trade', ...details }),
  close: (tradeId: string, details: Record<string, unknown>) =>
    audit({ action: 'trade.close', resource: tradeId, resourceType: 'trade', ...details }),
  closeAll: (details: Record<string, unknown>) =>
    audit({ action: 'trade.close-all', resource: 'all', resourceType: 'trade', level: 'warn', ...details }),
  partialClose: (tradeId: string, details: Record<string, unknown>) =>
    audit({ action: 'trade.partial-close', resource: tradeId, resourceType: 'trade', ...details }),
  moveToBE: (tradeId: string, details: Record<string, unknown>) =>
    audit({ action: 'trade.move-be', resource: tradeId, resourceType: 'trade', ...details }),
}

export const auditAccount = {
  create: (accountId: string, details: Record<string, unknown>) =>
    audit({ action: 'account.create', resource: accountId, resourceType: 'account', ...details }),
  connect: (accountId: string, details: Record<string, unknown>) =>
    audit({ action: 'account.connect', resource: accountId, resourceType: 'account', ...details }),
}

export const auditRisk = {
  settingChange: (key: string, oldValue: string, newValue: string, actor: string) =>
    audit({ action: 'risk.setting-change', resource: key, resourceType: 'risk-setting', actor, details: { key, oldValue, newValue } }),
  killSwitch: (actor: string, reason: string) =>
    audit({ action: 'risk.kill-switch', resource: 'system', resourceType: 'system', actor, level: 'warn', details: { reason } }),
}

export const auditUser = {
  login: (email: string) =>
    audit({ action: 'user.login', resource: email, resourceType: 'user', actor: email }),
  create: (userId: string, actor: string, details: Record<string, unknown>) =>
    audit({ action: 'user.create', resource: userId, resourceType: 'user', actor, ...details }),
}