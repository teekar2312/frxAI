import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { reconcileAccountPositions, reconcileAllAccounts } from '@/lib/reconciliation'
import { db } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mt5/reconcile
 *
 * Triggers position reconciliation — syncs local Trade records with MT5 bridge
 * positions. Detects trades that were closed externally on MT5 (e.g., SL hit on
 * broker side, or user closed manually in MT5 terminal) and updates the local DB.
 *
 * Body (optional): { accountId?: string }
 *   - If accountId provided: reconcile that account only
 *   - If no accountId: reconcile ALL accounts with MT5 login
 *
 * Returns: ReconciliationReport { checked, synced, updated, orphaned, errors, details }
 *
 * Available to all authenticated users (read-only reconciliation is safe).
 */
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  try {
    const body = await req.json().catch(() => ({}))
    const accountId = body?.accountId

    if (accountId) {
      // Reconcile single account
      const account = await db.account.findUnique({ where: { id: accountId } })
      if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      }
      const mt5Login = Number(account.login)
      if (!mt5Login || mt5Login <= 0) {
        return NextResponse.json({
          error: 'Account has no MT5 login configured',
          accountId,
          login: account.login,
        }, { status: 400 })
      }

      const report = await reconcileAccountPositions(accountId, mt5Login)
      return NextResponse.json({ report, accountId })
    }

    // Reconcile all accounts
    const report = await reconcileAllAccounts()
    return NextResponse.json({ report })
  } catch (e) {
    return apiCatch(e, 'mt5', 'POST', req)
  }
}