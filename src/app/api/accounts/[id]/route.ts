import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { atomicDeleteAccount } from '@/lib/db-transactions'
import { requireAdmin } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  try {
    const { id } = await params
    const body = await req.json()
    const existing = await db.account.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // If marking as default, unset others — atomic via transaction
    if (body.isDefault === true) {
      await db.$transaction(async (tx) => {
        await tx.account.updateMany({
          where: { isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })
        await tx.account.update({ where: { id }, data: { isDefault: true } })
      })
      // Re-fetch after transaction
      const updated = await db.account.findUnique({ where: { id } })
      return NextResponse.json({ account: updated })
    }

    const data: Record<string, unknown> = {}
    const allowed = [
      'name', 'broker', 'server', 'login', 'accountType',
      'currency', 'leverage', 'balance', 'equity', 'margin',
      'freeMargin', 'marginLevel', 'connected', 'isDefault',
    ]
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    const account = await db.account.update({ where: { id }, data })
    return NextResponse.json({ account })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  try {
    const { id } = await params
    // Atomic delete: refuses to delete if open positions exist, then
    // deletes orders + trades + account in one transaction.
    await atomicDeleteAccount(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
