// Service-to-Service Authentication — protects background service endpoints
// that are excluded from NextAuth middleware (they're called by the SL/TP
// monitor mini-service, not by browser clients).
//
// These endpoints require an `X-Service-Key` header matching the
// SERVICE_API_KEY env var. In development, a default key is used.

import 'server-only'
import { NextRequest, NextResponse } from 'next/server'

const SERVICE_API_KEY = process.env.SERVICE_API_KEY || 'frxai-service-key-dev-only-change-in-prod'

/**
 * Verify a service-to-service request.
 * Call at the top of background endpoints (check-sl-tp, reconcile, evaluate, backup).
 * Returns null if auth succeeds, or a 401/403 NextResponse if it fails.
 */
export function requireServiceAuth(req: NextRequest): NextResponse | null {
  const key = req.headers.get('x-service-key')

  if (!key) {
    return NextResponse.json(
      { error: 'Missing X-Service-Key header' },
      { status: 401 }
    )
  }

  if (key !== SERVICE_API_KEY) {
    return NextResponse.json(
      { error: 'Invalid service key' },
      { status: 403 }
    )
  }

  return null // auth passed
}

/** Get the configured service key (for display in settings/admin). */
export function getServiceKeyConfig(): { isDefault: boolean; keyLength: number } {
  return {
    isDefault: SERVICE_API_KEY === 'frxai-service-key-dev-only-change-in-prod',
    keyLength: SERVICE_API_KEY.length,
  }
}