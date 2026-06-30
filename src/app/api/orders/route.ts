import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { SUPPORTED_SYMBOLS } from '@/lib/types'
import { requireAuth, requireTrader } from '@/lib/auth-server'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Auth required to view orders
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')

    const where: Record<string, unknown> = { status: 'pending' }
    if (accountId) where.accountId = accountId

    const orders = await db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ orders })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 order creations per minute per IP
  const limited = applyRateLimit(req, RATE_LIMITS.tradeOpen)
  if (limited) return limited

  // Only trader+ can create orders (viewer cannot)
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  try {
    const body = await req.json()
    const {
      accountId,
      symbol,
      side,
      orderType,
      lotSize,
      price,
      stopLoss,
      takeProfit,
    } = body || {}

    if (!accountId || !symbol || !side || !orderType || !lotSize || price == null) {
      return NextResponse.json(
        { error: 'accountId, symbol, side, orderType, lotSize, price are required' },
        { status: 400 },
      )
    }

    if (!SUPPORTED_SYMBOLS.includes(symbol)) {
      return NextResponse.json({ error: `Unsupported symbol: ${symbol}` }, { status: 400 })
    }
    if (side !== 'buy' && side !== 'sell') {
      return NextResponse.json({ error: 'side must be buy or sell' }, { status: 400 })
    }
    if (orderType !== 'limit' && orderType !== 'stop') {
      return NextResponse.json({ error: 'orderType must be limit or stop' }, { status: 400 })
    }

    const account = await db.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const order = await db.order.create({
      data: {
        accountId,
        symbol,
        side,
        orderType,
        lotSize: Number(lotSize),
        price: Number(price),
        stopLoss: stopLoss != null ? Number(stopLoss) : null,
        takeProfit: takeProfit != null ? Number(takeProfit) : null,
        status: 'pending',
      },
    })

    await logInfo(
      'mt5',
      `Pending ${orderType} order placed: ${side} ${lotSize} ${symbol} @ ${price}`,
      { orderId: order.id, accountId, userId: user.id },
    )

    return NextResponse.json({ order })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
