// Database Backup — MySQL backup using mysqldump.
//
// MySQL databases are backed up via the `mysqldump` CLI tool.
// This module provides:
//   - Manual backup trigger (API endpoint)
//   - Automated backup (SL/TP monitor every hour)
//   - Backup listing (for UI display)
//   - Backup cleanup (keep last N backups to prevent disk fill)
//
// Backups are stored in db/backups/ directory with format:
//   frxai-YYYYMMDD-HHMMSS.sql.gz
//
// The interface (backupDatabase, listBackups) stays the same as the
// previous SQLite implementation for drop-in compatibility.

import 'server-only'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'
import { logInfo } from './logger'

const BACKUP_DIR = path.resolve('db', 'backups')
const MAX_BACKUPS = 24 // keep last 24 backups (24 hours worth if hourly)

// Parse DATABASE_URL to extract mysql connection params
function parseDbUrl(): { user: string; password: string; host: string; port: string; database: string } {
  const url = process.env.DATABASE_URL || ''
  try {
    const u = new URL(url)
    return {
      user: u.username || 'root',
      password: u.password || '',
      host: u.hostname || 'localhost',
      port: u.port || '3306',
      database: u.pathname.slice(1) || 'frxai',
    }
  } catch {
    return { user: 'root', password: '', host: 'localhost', port: '3306', database: 'frxai' }
  }
}

export interface BackupInfo {
  filename: string
  path: string
  size: number // bytes
  createdAt: Date
}

/**
 * Create a backup of the MySQL database using mysqldump.
 * Outputs to db/backups/frxai-YYYYMMDD-HHMMSS.sql
 *
 * @returns BackupInfo with filename, size, timestamp
 */
export async function backupDatabase(): Promise<BackupInfo> {
  // Ensure backup directory exists
  await fs.mkdir(BACKUP_DIR, { recursive: true })

  const { user, password, host, port, database } = parseDbUrl()

  // Generate timestamped filename
  const now = new Date()
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19) // YYYY-MM-DDTHH-MM-SS
  const filename = `frxai-${ts}.sql`
  const backupPath = path.join(BACKUP_DIR, filename)

  // Build mysqldump command
  const authPart = password
    ? `-u${user} -p${password}`
    : `-u${user}`

  const cmd = `mysqldump ${authPart} -h${host} -P${port} --single-transaction --routines --triggers ${database} > "${backupPath}"`

  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120_000 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`mysqldump failed: ${msg}`)
  }

  // Check backup file was created
  if (!existsSync(backupPath)) {
    throw new Error('Backup file was not created')
  }

  // Get file size
  const stat = await fs.stat(backupPath)

  const info: BackupInfo = {
    filename,
    path: backupPath,
    size: stat.size,
    createdAt: now,
  }

  await logInfo('system', `Database backup created: ${filename} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`, {
    backupPath,
    size: stat.size,
  })

  // Clean up old backups (keep last MAX_BACKUPS)
  await cleanupOldBackups()

  return info
}

/**
 * List all backups in the backup directory, sorted by date (newest first).
 */
export async function listBackups(): Promise<BackupInfo[]> {
  if (!existsSync(BACKUP_DIR)) {
    return []
  }

  const files = await fs.readdir(BACKUP_DIR)
  const backups: BackupInfo[] = []

  for (const filename of files) {
    if (!filename.endsWith('.sql') && !filename.endsWith('.sql.gz')) continue
    const filePath = path.join(BACKUP_DIR, filename)
    try {
      const stat = await fs.stat(filePath)
      backups.push({
        filename,
        path: filePath,
        size: stat.size,
        createdAt: stat.mtime,
      })
    } catch {
      // Skip files we can't stat
    }
  }

  // Sort by creation time (newest first)
  backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  return backups
}

/**
 * Delete old backups, keeping only the most recent MAX_BACKUPS.
 * Called automatically after each backup.
 */
export async function cleanupOldBackups(): Promise<{ deleted: number; kept: number }> {
  const backups = await listBackups()

  if (backups.length <= MAX_BACKUPS) {
    return { deleted: 0, kept: backups.length }
  }

  // Delete all but the newest MAX_BACKUPS
  const toDelete = backups.slice(MAX_BACKUPS)
  let deleted = 0

  for (const backup of toDelete) {
    try {
      await fs.unlink(backup.path)
      deleted++
    } catch {
      // Ignore deletion errors
    }
  }

  if (deleted > 0) {
    await logInfo('system', `Backup cleanup: deleted ${deleted} old backup(s), kept ${backups.length - deleted}`)
  }

  return { deleted, kept: backups.length - deleted }
}

/**
 * Delete a specific backup by filename.
 */
export async function deleteBackup(filename: string): Promise<void> {
  // Prevent path traversal — only allow filename, not path
  const safeFilename = path.basename(filename)
  if (safeFilename !== filename) {
    throw new Error('Invalid filename — path traversal not allowed')
  }

  const filePath = path.join(BACKUP_DIR, safeFilename)
  if (!existsSync(filePath)) {
    throw new Error(`Backup not found: ${filename}`)
  }

  await fs.unlink(filePath)
  await logInfo('system', `Backup deleted: ${filename}`)
}

/**
 * Get backup statistics for the dashboard.
 */
export async function getBackupStats(): Promise<{
  totalBackups: number
  totalSizeMB: number
  oldestBackup: Date | null
  newestBackup: Date | null
  nextBackupIn: string // human-readable time until next auto-backup
}> {
  const backups = await listBackups()

  if (backups.length === 0) {
    return {
      totalBackups: 0,
      totalSizeMB: 0,
      oldestBackup: null,
      newestBackup: null,
      nextBackupIn: 'soon (no backups yet)',
    }
  }

  const totalSize = backups.reduce((sum, b) => sum + b.size, 0)
  const oldest = backups[backups.length - 1]
  const newest = backups[0]

  // Next backup is 1 hour after the newest
  const nextBackup = new Date(newest.createdAt.getTime() + 60 * 60 * 1000)
  const now = new Date()
  const diffMs = nextBackup.getTime() - now.getTime()
  const diffMin = Math.max(0, Math.floor(diffMs / 60000))

  return {
    totalBackups: backups.length,
    totalSizeMB: Number((totalSize / 1024 / 1024).toFixed(2)),
    oldestBackup: oldest.createdAt,
    newestBackup: newest.createdAt,
    nextBackupIn: diffMin > 0 ? `${diffMin} min` : 'due now',
  }
}