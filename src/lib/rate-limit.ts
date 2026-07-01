// Rate Limiter — in-memory, per-key rate limiting for API routes.
// Prevents brute-force attacks (login) and abuse (trade spam, kill switch spam).
//
// Uses a Map to track request timestamps per key (IP address or user ID).
// Auto-cleans expired entries every 60 seconds to prevent memory leaks.
//
// Usage in API routes:
//   import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
//
//   const result = rateLimit(req, { key: 'login', max: 5, windowSec: 60 })
//   if (!result.allowed) {
//     return NextResponse.json(
//       { error: 'Too many requests. Try again in X seconds.' },
//       { status: 429, headers: getRateLimitHeaders(result) },
//     )
//   }

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'

interface RateLimitEntry {
  timestamps: number[]
  lastCleaned: number
}

interface RateLimitConfig {
  /** Unique key namespace for this limit (e.g., 'login', 'trade-open', 'kill-switch') */
  key: string
  /** Max requests allowed in the window */
  max: number
  /** Time window in seconds */
  windowSec: number
  /** Optional: custom identifier (defaults to IP address). Use 'user:${userId}' for per-user limits */
  identifier?: string
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: number // epoch ms when the oldest request expires
  retryAfter: number // seconds until reset (for 429 responses)
}

// In-memory store: Map<compositeKey, RateLimitEntry>
const store = new Map<string, RateLimitEntry>()
const CLEANUP_INTERVAL_MS = 60_000 // clean expired entries every 60s
let lastGlobalCleanup = Date.now()

/** Extract client IP from request (handles proxies via X-Forwarded-For). */
function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    // Take the first IP (original client)
    return forwarded.split(',')[0].trim()
  }
  const realIP = req.headers.get('x-real-ip')
  if (realIP) return realIP.trim()
  return 'unknown'
}

/** Clean expired entries from the store to prevent memory leaks. */
function cleanupStore(now: number) {
  if (now - lastGlobalCleanup < CLEANUP_INTERVAL_MS) return
  lastGlobalCleanup = now
  // Remove entries where all timestamps are older than 5 minutes
  const fiveMinAgo = now - 5 * 60 * 1000
  for (const [k, entry] of store.entries()) {
    const hasRecent = entry.timestamps.some((t) => t > fiveMinAgo)
    if (!hasRecent) {
      store.delete(k)
    }
  }
}

/**
 * Check rate limit for a request. Returns { allowed, remaining, resetAt, retryAfter }.
 * If allowed, records the timestamp. If not allowed, returns 429-ready info.
 *
 * @param req NextRequest object (used to extract IP)
 * @param config { key, max, windowSec, identifier? }
 * @returns RateLimitResult
 */
export function rateLimit(req: NextRequest, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  cleanupStore(now)

  // Build composite key: namespace:identifier
  const identifier = config.identifier || getClientIP(req)
  const compositeKey = `${config.key}:${identifier}`

  // Get or create entry
  let entry = store.get(compositeKey)
  if (!entry) {
    entry = { timestamps: [], lastCleaned: now }
    store.set(compositeKey, entry)
  }

  // Clean old timestamps (older than windowSec)
  const windowMs = config.windowSec * 1000
  const cutoff = now - windowMs
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  // Check if limit exceeded
  if (entry.timestamps.length >= config.max) {
    // Find when the oldest request in the window will expire
    const oldestInWindow = entry.timestamps[0]
    const resetAt = oldestInWindow + windowMs
    const retryAfter = Math.ceil((resetAt - now) / 1000)
    return {
      allowed: false,
      remaining: 0,
      limit: config.max,
      resetAt,
      retryAfter: Math.max(1, retryAfter),
    }
  }

  // Record this request
  entry.timestamps.push(now)

  // Calculate remaining
  const remaining = config.max - entry.timestamps.length
  const resetAt = entry.timestamps[0] + windowMs

  return {
    allowed: true,
    remaining,
    limit: config.max,
    resetAt,
    retryAfter: 0,
  }
}

/**
 * Generate standard rate limit headers for HTTP responses.
 * Follows the draft IETF rate limit headers spec.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    ...(result.retryAfter > 0 ? { 'Retry-After': String(result.retryAfter) } : {}),
  }
}

/**
 * Convenience: apply rate limit and return a 429 NextResponse if exceeded.
 * Returns null if allowed (caller continues with the request).
 *
 * Usage:
 *   const limited = applyRateLimit(req, { key: 'login', max: 5, windowSec: 60 })
 *   if (limited) return limited  // 429 response
 *   // ... continue with normal logic
 */
export function applyRateLimit(
  req: NextRequest,
  config: RateLimitConfig,
): NextResponse | null {
  const result = rateLimit(req, config)
  if (!result.allowed) {
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: getRateLimitHeaders(result),
      },
    )
  }
  return null
}

// ─── Preset configurations for common use cases ──────────────────────────────

export const RATE_LIMITS = {
  /** Login: 5 attempts per minute per IP (brute force protection) */
  login: { key: 'login', max: 5, windowSec: 60 },
  /** Trade open: 10 per minute per IP */
  tradeOpen: { key: 'trade-open', max: 10, windowSec: 60 },
  /** Trade close: 20 per minute per IP */
  tradeClose: { key: 'trade-close', max: 20, windowSec: 60 },
  /** Close all: 3 per minute per IP */
  closeAll: { key: 'close-all', max: 3, windowSec: 60 },
  /** Kill switch: 2 per 30 seconds per IP (emergency, but prevent spam) */
  killSwitch: { key: 'kill-switch', max: 2, windowSec: 30 },
  /** Password change: 3 per hour per IP */
  passwordChange: { key: 'password-change', max: 3, windowSec: 3600 },
  /** User create: 5 per hour per IP */
  userCreate: { key: 'user-create', max: 5, windowSec: 3600 },
  /** General API: 100 per minute per IP */
  general: { key: 'general-api', max: 100, windowSec: 60 },
  /** AI analyze: 5 per minute per IP (calls LLM — expensive) */
  aiAnalyze: { key: 'ai-analyze', max: 5, windowSec: 60 },
  /** AI auto-trade: 3 per minute per IP */
  aiAutoTrade: { key: 'ai-auto-trade', max: 3, windowSec: 60 },
  /** AI evaluate: 10 per minute per IP */
  aiEvaluate: { key: 'ai-evaluate', max: 10, windowSec: 60 },
  /** Backtest run: 3 per minute per IP (computationally expensive) */
  backtestRun: { key: 'backtest-run', max: 3, windowSec: 60 },
  /** Backtest optimize: 2 per minute per IP (very expensive) */
  backtestOptimize: { key: 'backtest-optimize', max: 2, windowSec: 60 },
  /** Alert create: 10 per minute per IP */
  alertCreate: { key: 'alert-create', max: 10, windowSec: 60 },
  /** Risk update: 10 per minute per IP */
  riskUpdate: { key: 'risk-update', max: 10, windowSec: 60 },
  /** System config update: 10 per minute per IP */
  systemConfigUpdate: { key: 'system-config-update', max: 10, windowSec: 60 },
  /** News refresh: 3 per minute per IP (calls LLM) */
  newsRefresh: { key: 'news-refresh', max: 3, windowSec: 60 },
  /** Calendar refresh: 3 per minute per IP (calls LLM) */
  calendarRefresh: { key: 'calendar-refresh', max: 3, windowSec: 60 },
  /** AI indicator select: 5 per minute per IP */
  aiIndicatorSelect: { key: 'ai-indicator-select', max: 5, windowSec: 60 },
  /** Account create: 5 per minute per IP */
  accountCreate: { key: 'account-create', max: 5, windowSec: 60 },
  /** Trade partial close: 20 per minute per IP */
  tradePartialClose: { key: 'trade-partial-close', max: 20, windowSec: 60 },
  /** Trade move to BE: 20 per minute per IP */
  tradeMoveToBE: { key: 'trade-move-to-be', max: 20, windowSec: 60 },
  /** User update/delete: 10 per minute per IP */
  userManage: { key: 'user-manage', max: 10, windowSec: 60 },
  /** Log create: 30 per minute per IP */
  logCreate: { key: 'log-create', max: 30, windowSec: 60 },
  /** Log purge (DELETE all): 2 per hour per IP */
  logPurge: { key: 'log-purge', max: 2, windowSec: 3600 },
  /** MT5 connect: 5 per minute per IP (sends credentials) */
  mt5Connect: { key: 'mt5-connect', max: 5, windowSec: 60 },
  /** MT5 disconnect: 10 per minute per IP */
  mt5Disconnect: { key: 'mt5-disconnect', max: 10, windowSec: 60 },
  /** Alert update/delete: 20 per minute per IP */
  alertManage: { key: 'alert-manage', max: 20, windowSec: 60 },
  /** Trade note update: 20 per minute per IP */
  tradeNote: { key: 'trade-note', max: 20, windowSec: 60 },
  /** Indicator update: 30 per minute per IP */
  indicatorUpdate: { key: 'indicator-update', max: 30, windowSec: 60 },
  /** Order cancel: 20 per minute per IP */
  orderCancel: { key: 'order-cancel', max: 20, windowSec: 60 },
  /** Webhook test: 5 per minute per IP */
  webhookTest: { key: 'webhook-test', max: 5, windowSec: 60 },
  /** Backup delete: 5 per minute per IP */
  backupDelete: { key: 'backup-delete', max: 5, windowSec: 60 },
  /** MT5 reconcile: 10 per minute per IP */
  reconcile: { key: 'reconcile', max: 10, windowSec: 60 },
} as const
