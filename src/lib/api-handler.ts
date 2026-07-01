// Centralized API error handler — provides consistent error responses
// across all API routes. Uses captureApiError for monitoring and
// sanitizes error messages in production to prevent info leaks.
//
// Usage in API routes:
//   import { apiCatch } from '@/lib/api-handler'
//   } catch (e) {
//     return apiCatch(e, 'trades', 'GET', req)
//   }

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { captureApiError, type ErrorSeverity } from './error-monitor'

/**
 * Sanitize an error message for client response.
 * In production, hides internal details (stack traces, DB queries, file paths).
 * In development, returns the full message for debugging.
 */
function sanitizeMessage(raw: string): string {
  if (process.env.NODE_ENV !== 'production') return raw

  // Patterns that indicate internal details we don't want to expose
  const internalPatterns = [
    /prisma/i,
    /sqlite/i,
    /unique constraint/i,
    /foreign key/i,
    /\/home\//i,
    /\/usr\//i,
    /\/node_modules/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
  ]

  for (const p of internalPatterns) {
    if (p.test(raw)) return 'An internal error occurred'
  }

  // Truncate very long messages
  if (raw.length > 200) return raw.slice(0, 200) + '...'

  return raw
}

interface ApiCatchOptions {
  /** Error source tag (e.g. 'trades', 'ai', 'risk') */
  source?: string
  /** HTTP method */
  method?: string
  /** Severity override (default: 'medium') */
  severity?: ErrorSeverity
  /** HTTP status override (default: 500) */
  status?: number
  /** Additional context for error monitoring */
  context?: Record<string, unknown>
  /** Custom error message override for the response */
  message?: string
}

/**
 * Handle an error in an API route catch block.
 * - Captures the error for monitoring via captureApiError()
 * - Returns a consistent JSON error response
 * - Sanitizes error messages in production
 *
 * @param e The caught error (unknown)
 * @param source Error source tag (e.g. 'trades', 'ai')
 * @param method HTTP method (e.g. 'GET', 'POST')
 * @param req Optional NextRequest for IP extraction
 * @param options Additional options
 */
export function apiCatch(
  e: unknown,
  source: string = 'api',
  method: string = 'UNKNOWN',
  req?: NextRequest,
  options: ApiCatchOptions = {},
): NextResponse {
  const err = e as Error
  const message = options.message || err?.message || 'An unexpected error occurred'
  const sanitized = sanitizeMessage(message)
  const status = options.status || 500
  const severity = options.severity || (status >= 500 ? 'high' : 'medium')

  // Capture for monitoring (fire-and-forget, never throws)
  captureApiError(e, {
    source,
    severity,
    url: req?.url,
    method,
    context: options.context,
  }).catch(() => {})

  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${source}] ${method} error:`, message)
    if (err?.stack) console.error(err.stack)
  }

  return NextResponse.json(
    { error: sanitized },
    { status },
  )
}