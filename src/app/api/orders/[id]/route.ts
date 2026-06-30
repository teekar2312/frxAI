import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { requireTrader } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Only trader+ can cancel orders (viewer cannot)
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  try {
    const { id } = await params
    const order = await db.order.findUnique({ where: { id } })
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    await db.order.update({ where: { id }, data: { status: 'cancelled' } })
    await logInfo('mt5', `Order cancelled: ${order.side} ${order.lotSize} ${order.symbol} @ ${order.price}`, {
      orderId: id,
      accountId: order.accountId,
      userId: user.id,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
