// Middleware — protects all routes except auth + public assets.
// Redirects unauthenticated users to /login.
// For API routes, returns 401 JSON instead of redirecting.

import { withAuth } from 'next-auth/middleware'
export default withAuth

export const config = {
  // Protect everything EXCEPT:
  // - /api/auth/* (NextAuth handlers — must be public)
  // - /api/mt5/health (MT5 bridge status — public)
  // - /api/health (system health check — public for monitoring)
  // - /api/trades/check-sl-tp (called by SL/TP monitor background service)
  // - /api/ai/auto-trade (called by background service, has own role guard)
  // - /api/mt5/reconcile (called by background service, has own auth)
  // - /api/ai/evaluate (called by background service, has own auth)
  // - /api/system/backup (called by background service for auto-backup)
  // - /api/logs/cleanup (called by background service for log retention)
  // - /login (the login page itself)
  // - /_next/* (Next.js static assets)
  // - /favicon.ico, /logo.svg (public assets)
  matcher: [
    '/((?!api/auth|api/mt5/health|api/health|api/trades/check-sl-tp|api/ai/auto-trade|api/mt5/reconcile|api/ai/evaluate|api/system/backup|api/logs/cleanup|login|_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
