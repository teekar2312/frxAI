// Log Cleanup — automated retention policy for the Log table.
//
// Keeps logs for a configurable retention period (default: 7 days).
// Runs as part of the SL/TP monitor's periodic tasks or can be called
// manually via an API endpoint.
//
// Retention policy:
//   - info logs: 7 days
//   - warn logs: 14 days
//   - error logs: 30 days (longer retention for debugging)
//   - debug logs: 3 days

import 'server-only'
import { db } from './db'
import { logInfo } from './logger'

const RETENTION_DAYS: Record<string, number> = {
  debug: 3,
  info: 7,
  warn: 14,
  error: 30,
}

export interface CleanupResult {
  deleted: number
  byLevel: Record<string, number>
  durationMs: number
}

/**
 * Delete logs older than the retention period for each level.
 * Called by the SL/TP monitor or a cron job.
 */
export async function cleanupOldLogs(): Promise<CleanupResult> {
  const start = Date.now()
  const byLevel: Record<string, number> = {}
  let totalDeleted = 0

  for (const [level, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    try {
      const result = await db.log.deleteMany({
        where: {
          level,
          createdAt: { lt: cutoff },
        },
      })
      byLevel[level] = result.count
      totalDeleted += result.count
    } catch (e: any) {
      // Log but don't throw — cleanup is best-effort
      console.error(`[log-cleanup] Failed to delete ${level} logs:`, e.message)
      byLevel[level] = 0
    }
  }

  const durationMs = Date.now() - start

  if (totalDeleted > 0) {
    await logInfo('system', `Log cleanup: deleted ${totalDeleted} old log(s) (${durationMs}ms)`, {
      byLevel,
      retentionDays: RETENTION_DAYS,
    })
  }

  return { deleted: totalDeleted, byLevel, durationMs }
}

/**
 * Get log table statistics for the dashboard/admin panel.
 */
export async function getLogStats(): Promise<{
  totalLogs: number
  byLevel: Record<string, number>
  oldestLog: Date | null
  estimatedSizeKB: number
}> {
  const [totalLogs, byLevelRaw, oldest] = await Promise.all([
    db.log.count(),
    db.log.groupBy({ by: ['level'], _count: true }),
    db.log.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])

  const byLevel: Record<string, number> = {}
  for (const row of byLevelRaw) {
    byLevel[row.level] = row._count
  }

  // Rough size estimate: average log row ~500 bytes
  const estimatedSizeKB = Math.round(totalLogs * 500 / 1024)

  return {
    totalLogs,
    byLevel,
    oldestLog: oldest?.createdAt ?? null,
    estimatedSizeKB,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI Signal Cleanup — removes old evaluated signals to prevent unbounded growth.
// Keeps unevaluated signals for 7 days (they need time for outcome evaluation).
// Keeps evaluated signals for 30 days (useful for accuracy tracking).
// ═══════════════════════════════════════════════════════════════════════════════

const SIGNAL_RETENTION_DAYS = {
  unevaluated: 7,  // signals waiting for outcome evaluation
  evaluated: 30,   // signals with known outcome (for accuracy history)
}

export async function cleanupOldSignals(): Promise<{ deleted: number; durationMs: number }> {
  const start = Date.now()

  try {
    // Delete evaluated signals older than 30 days (cascade deletes outcome)
    const cutoffEvaluated = new Date(Date.now() - SIGNAL_RETENTION_DAYS.evaluated * 24 * 60 * 60 * 1000)
    const r1 = await db.aiSignal.deleteMany({
      where: {
        outcome: { isNot: null },
        createdAt: { lt: cutoffEvaluated },
      },
    })

    // Delete unevaluated signals older than 7 days (likely never will be evaluated)
    const cutoffUnevaluated = new Date(Date.now() - SIGNAL_RETENTION_DAYS.unevaluated * 24 * 60 * 60 * 1000)
    const r2 = await db.aiSignal.deleteMany({
      where: {
        outcome: { is: null },
        createdAt: { lt: cutoffUnevaluated },
      },
    })

    const totalDeleted = r1.count + r2.count
    const durationMs = Date.now() - start

    if (totalDeleted > 0) {
      await logInfo('system', `Signal cleanup: deleted ${totalDeleted} old signal(s) (${durationMs}ms)`, {
        evaluated: r1.count,
        unevaluated: r2.count,
      })
    }

    return { deleted: totalDeleted, durationMs }
  } catch (e: any) {
    console.error('[signal-cleanup] Failed:', e.message)
    return { deleted: 0, durationMs: Date.now() - start }
  }
}