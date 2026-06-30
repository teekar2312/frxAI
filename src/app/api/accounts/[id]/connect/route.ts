import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo, logWarn } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const account = await db.account.findUnique({ where: { id } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const next = !account.connected
    const updated = await db.account.update({
      where: { id },
      data: { connected: next },
    })

    if (next) {
      await logInfo('mt5', `MT5 connected: ${account.name} (login ${account.login})`, {
        accountId: id,
      })
    } else {
      await logWarn('mt5', `MT5 disconnected: ${account.name} (login ${account.login})`, {
        accountId: id,
      })
    }

    return NextResponse.json({ account: updated, connected: next })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
