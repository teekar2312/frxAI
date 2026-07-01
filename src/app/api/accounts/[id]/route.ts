import { NextRequest, NextResponse } from 'next/server'
import { db, accounts, eq, ne, and } from '@/lib/db'
import { atomicDeleteAccount } from '@/lib/db-transactions'
import { requireAdmin } from '@/lib/auth-server'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const limited = applyRateLimit(req, RATE_LIMITS.general)
  if (limited) return limited

  try {
    const { id } = await params
    const body = await req.json()
    const existing = await db.query.accounts.findFirst({ where: eq(accounts.id, id) })
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // If marking as default, unset others — atomic via transaction
    if (body.isDefault === true) {
      await db.transaction(async (tx) => {
        await tx.update(accounts).set({ isDefault: false }).where(and(eq(accounts.isDefault, true), ne(accounts.id, id)))
        await tx.update(accounts).set({ isDefault: true }).where(eq(accounts.id, id))
      })
      // Re-fetch after transaction
      const updated = await db.query.accounts.findFirst({ where: eq(accounts.id, id) })

      await audit({ action: 'account.update', resource: id, resourceType: 'account', actor: user.email, details: { isDefault: true } })

      return NextResponse.json({ account: updated })
    }

    const data: Record<string, unknown> = {}
    const allowed = [
      'name', 'broker', 'server', 'login', 'accountType',
      'currency', 'leverage', 'balance', 'equity', 'margin',
      'freeMargin', 'marginLevel', 'connected', 'isDefault',
    ]
    const numericFields = new Set(['balance', 'equity', 'margin', 'freeMargin', 'marginLevel'])
    for (const key of allowed) {
      if (key in body) {
        data[key] = numericFields.has(key) ? Number(body[key]) : body[key]
      }
    }

    await db.update(accounts).set(data).where(eq(accounts.id, id))

    await audit({ action: 'account.update', resource: id, resourceType: 'account', actor: user.email, details: { updatedFields: Object.keys(data) } })

    // Re-fetch to return updated record
    const account = await db.query.accounts.findFirst({ where: eq(accounts.id, id) })

    return NextResponse.json({ account })
  } catch (e) {
    return apiCatch(e, 'accounts', 'PATCH', req)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const limited = applyRateLimit(req, RATE_LIMITS.general)
  if (limited) return limited

  try {
    const { id } = await params
    // Atomic delete: refuses to delete if open positions exist, then
    // deletes orders + trades + account in one transaction.
    await atomicDeleteAccount(id)

    await audit({ action: 'account.delete', resource: id, resourceType: 'account', actor: user.email, details: {} })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiCatch(e, 'accounts', 'DELETE', req)
  }
}