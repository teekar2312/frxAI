import { NextRequest, NextResponse } from 'next/server'
import { db, accounts, eq } from '@/lib/db'
import { logInfo, logWarn } from '@/lib/logger'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { auditAccount } from '@/lib/audit'
import { requireTrader } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  const limited = applyRateLimit(req, RATE_LIMITS.general)
  if (limited) return limited

  try {
    const { id } = await params
    const account = await db.query.accounts.findFirst({ where: eq(accounts.id, id) })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const next = !account.connected
    await db.update(accounts).set({ connected: next }).where(eq(accounts.id, id))

    const updated = await db.query.accounts.findFirst({ where: eq(accounts.id, id) })

    if (next) {
      await logInfo('mt5', `MT5 connected: ${account.name} (login ${account.login})`, {
        accountId: id,
      })
      await auditAccount.connect(id, { name: account.name, login: account.login, actor: 'system' })
    } else {
      await logWarn('mt5', `MT5 disconnected: ${account.name} (login ${account.login})`, {
        accountId: id,
      })
    }

    return NextResponse.json({ account: updated, connected: next })
  } catch (e) {
    return apiCatch(e, 'accounts', 'POST', req)
  }
}