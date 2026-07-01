// Error Monitoring — structured error capture for production error tracking.
//
// Instead of requiring an external service (Sentry/GlitchTip), this module
// captures errors directly to the database (Log table) with full context,
// plus sends webhook notifications for critical errors.
//
// This gives us:
//   - Error aggregation (count by message/source)
//   - Error history with stack traces
//   - Real-time webhook alerts for critical errors
//   - Error statistics dashboard
//   - No external dependency (works offline)

import 'server-only'
import { db, logs, eq, and, inArray, gte, desc, countAll } from './db'
import { logInfo } from './logger'
import { sendWebhook } from './webhook'

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface CapturedError {
  message: string
  stack?: string
  source: string // 'api' | 'mt5' | 'ai' | 'risk' | 'system' | etc.
  severity: ErrorSeverity
  context?: Record<string, any>
  userId?: string
  requestId?: string
  url?: string
  method?: string
}

/**
 * Capture an error — logs it to DB + sends webhook for critical errors.
 * Never throws (safe to call from catch blocks).
 */
export async function captureError(error: CapturedError): Promise<void> {
  try {
    // 1. Always log to DB
    await db.insert(logs).values({
      level: error.severity === 'critical' || error.severity === 'high' ? 'error' : 'warn',
      source: error.source,
      message: error.message,
      stack: error.stack || null,
      context: JSON.stringify({
        severity: error.severity,
        userId: error.userId,
        requestId: error.requestId,
        url: error.url,
        method: error.method,
        ...error.context,
      }),
    })

    // 2. Send webhook for high/critical errors (best-effort)
    if (error.severity === 'high' || error.severity === 'critical') {
      const emoji = error.severity === 'critical' ? '🚨' : '⚠️'
      const color = error.severity === 'critical' ? 0xef4444 : 0xf59e0b

      await sendWebhook({
        type: 'system',
        title: `${emoji} ${error.severity.toUpperCase()} Error: ${error.source}`,
        message: error.message.slice(0, 500),
        color,
        fields: [
          { name: 'Source', value: error.source },
          { name: 'Severity', value: error.severity },
          { name: 'URL', value: error.url || 'N/A' },
          { name: 'Method', value: error.method || 'N/A' },
          { name: 'User', value: error.userId || 'anonymous' },
          { name: 'Time', value: new Date().toISOString() },
        ],
      }).catch(() => null) // webhook failure should never crash
    }

    // 3. Console log for dev visibility
    if (error.severity === 'critical' || error.severity === 'high') {
      console.error(`[${error.severity.toUpperCase()}] [${error.source}] ${error.message}`, error.stack || '')
    }
  } catch (e) {
    // If error capture itself fails, just console.error (don't infinite loop)
    console.error('captureError failed:', e)
  }
}

/**
 * Capture from an Error object + request context.
 * Convenience wrapper for API route catch blocks.
 */
export async function captureApiError(
  error: Error | unknown,
  options: {
    source?: string
    severity?: ErrorSeverity
    url?: string
    method?: string
    userId?: string
    context?: Record<string, any>
  } = {},
): Promise<void> {
  const err = error as Error
  await captureError({
    message: err?.message || 'Unknown error',
    stack: err?.stack,
    source: options.source || 'api',
    severity: options.severity || 'medium',
    url: options.url,
    method: options.method,
    userId: options.userId,
    context: options.context,
  })
}

/**
 * Get error statistics for the dashboard.
 * Aggregates errors by source + severity over a time window.
 */
export async function getErrorStats(hoursBack = 24): Promise<{
  total: number
  bySeverity: Record<ErrorSeverity, number>
  bySource: Record<string, number>
  recent: Array<{
    id: string
    message: string
    source: string
    severity: string
    createdAt: Date
  }>
}> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  const errors = await db.query.logs.findMany({
    where: and(inArray(logs.level, ['error', 'warn']), gte(logs.createdAt, since)),
    orderBy: desc(logs.createdAt),
    limit: 100,
  })

  const bySeverity: Record<ErrorSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  }
  const bySource: Record<string, number> = {}

  for (const e of errors) {
    // Parse severity from context JSON
    let severity: ErrorSeverity = 'medium'
    try {
      const ctx = JSON.parse(e.context || '{}')
      if (ctx.severity) severity = ctx.severity
    } catch {}

    if (severity === 'error' || e.level === 'error') {
      bySeverity.high++ // errors logged before r14 don't have severity, treat as high
    } else {
      bySeverity[severity]++
    }

    bySource[e.source] = (bySource[e.source] || 0) + 1
  }

  return {
    total: errors.length,
    bySeverity,
    bySource,
    recent: errors.slice(0, 10).map((e) => ({
      id: e.id,
      message: e.message,
      source: e.source,
      severity: e.level,
      createdAt: e.createdAt,
    })),
  }
}

/**
 * Check if an error rate has spiked (for proactive alerting).
 * Returns true if error count in the last N minutes exceeds threshold.
 */
export async function checkErrorRateSpike(
  threshold = 10,
  windowMinutes = 5,
): Promise<{ spiked: boolean; count: number; threshold: number }> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)
  const count = await db.select({ count: countAll }).from(logs)
    .where(and(eq(logs.level, 'error'), gte(logs.createdAt, since)))
    .then(r => r[0].count)

  if (count >= threshold) {
    await logInfo('system', `Error rate spike detected: ${count} errors in ${windowMinutes} min (threshold: ${threshold})`)
  }

  return { spiked: count >= threshold, count, threshold }
}