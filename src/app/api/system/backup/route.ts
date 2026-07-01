import { NextRequest, NextResponse } from 'next/server'
import { requireServiceAuth } from '@/lib/service-auth'
import { requireAdmin } from '@/lib/auth-server'
import { backupDatabase, listBackups, deleteBackup, getBackupStats } from '@/lib/db-backup'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { apiCatch } from '@/lib/api-handler'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/backup
 * Returns backup statistics + list of all backups.
 *
 * POST /api/system/backup
 * Triggers a manual database backup (admin only).
 *
 * DELETE /api/system/backup?filename=frxai-2026-06-18T10-30-00.sql
 * Deletes a specific backup file (admin only).
 */

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  try {
    const [stats, backups] = await Promise.all([
      getBackupStats(),
      listBackups(),
    ])

    return NextResponse.json({
      stats,
      backups: backups.map((b) => ({
        filename: b.filename,
        size: b.size,
        sizeMB: Number((b.size / 1024 / 1024).toFixed(2)),
        createdAt: b.createdAt.toISOString(),
      })),
    })
  } catch (e) {
    return apiCatch(e, 'system', 'GET', req)
  }
}

export async function POST(req: NextRequest) {
  const authErr = requireServiceAuth(req)
  if (authErr) return authErr

  // Rate limit: max 3 manual backups per hour (prevent abuse)
  const limited = applyRateLimit(req, { key: 'manual-backup', max: 3, windowSec: 3600 })
  if (limited) return limited

  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  try {
    const info = await backupDatabase()

    await audit({
      action: 'system.backup',
      actor: user.email,
      resource: info.filename,
      resourceType: 'backup',
      details: { sizeMB: Number((info.size / 1024 / 1024).toFixed(2)) },
    })

    return NextResponse.json({
      ok: true,
      backup: {
        filename: info.filename,
        size: info.size,
        sizeMB: Number((info.size / 1024 / 1024).toFixed(2)),
        createdAt: info.createdAt.toISOString(),
      },
      message: `Backup created: ${info.filename} (${(info.size / 1024 / 1024).toFixed(2)} MB)`,
    })
  } catch (e) {
    return apiCatch(e, 'system', 'POST', req)
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const limited = applyRateLimit(req, RATE_LIMITS.backupDelete)
  if (limited) return limited

  try {
    const { searchParams } = new URL(req.url)
    const filename = searchParams.get('filename')
    if (!filename) {
      return NextResponse.json({ error: 'filename query param required' }, { status: 400 })
    }

    await deleteBackup(filename)
    return NextResponse.json({ ok: true, message: `Backup ${filename} deleted` })
  } catch (e) {
    return apiCatch(e, 'system', 'DELETE', req)
  }
}