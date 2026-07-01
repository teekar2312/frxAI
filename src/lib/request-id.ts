// Request ID Generation — assigns a unique ID to every API request for
// end-to-end tracing through logs, error monitoring, and response headers.
//
// Usage in API routes:
//   import { getRequestId } from '@/lib/request-id'
//   const requestId = getRequestId(req)

import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

// In-memory store for request timing (optional, for latency tracking)
const requestTimings = new Map<string, { start: number; path: string }>()
const MAX_TIMINGS = 10000

/**
 * Get or generate a request ID from the request.
 * Prefers the incoming X-Request-ID header (set by Caddy/load balancer).
 * Falls back to a generated UUID.
 */
export function getRequestId(req: NextRequest): string {
  const incoming = req.headers.get('x-request-id')
  const id = incoming || randomUUID()

  // Track timing (bounded map to prevent memory leaks)
  if (requestTimings.size >= MAX_TIMINGS) {
    // Delete oldest 1000 entries
    const keys = Array.from(requestTimings.keys()).slice(0, 1000)
    for (const k of keys) requestTimings.delete(k)
  }
  requestTimings.set(id, { start: Date.now(), path: req.nextUrl?.pathname || 'unknown' })

  return id
}

/**
 * Get the elapsed time for a request (call at the end of the handler).
 */
export function getRequestTiming(requestId: string): number | null {
  const entry = requestTimings.get(requestId)
  if (!entry) return null
  const elapsed = Date.now() - entry.start
  requestTimings.delete(requestId)
  return elapsed
}

/**
 * Create response headers with request ID.
 * Call this when creating the response to include the ID in the response.
 */
export function requestIdHeaders(requestId: string): Record<string, string> {
  return {
    'X-Request-ID': requestId,
  }
}