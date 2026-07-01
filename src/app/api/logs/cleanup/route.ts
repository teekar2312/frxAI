import { NextResponse } from 'next/server'
import { cleanupOldLogs, cleanupOldSignals } from '@/lib/log-cleanup'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

// POST /api/logs/cleanup
// Deletes logs older than the retention period (info: 7d, warn: 14d, error: 30d, debug: 3d).
// Also cleans up old AI signals (evaluated: 30d, unevaluated: 7d).
// Called by the SL/TP monitor background service every 6 hours.
export async function POST() {
  try {
    const [logs, signals] = await Promise.all([
      cleanupOldLogs(),
      cleanupOldSignals(),
    ])
    return NextResponse.json({ ok: true, logs, signals })
  } catch (e) {
    return apiCatch(e, 'logs', 'POST')
  }
}