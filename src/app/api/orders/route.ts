import { NextRequest, NextResponse } from 'next/server'
import { db, orders, accounts, eq, and, desc } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { requireAuth, requireTrader } from '@/lib/auth-server'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { orderCreateSchema, validateBody } from '@/lib/validations'
import { apiCatch } from '@/lib/api-handler'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Auth required to view orders
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')

    const conditions = [eq(orders.status, 'pending')]
    if (accountId) conditions.push(eq(orders.accountId, accountId))
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0]

    const ordersList = await db.query.orders.findMany({
      where: whereClause,
      orderBy: desc(orders.createdAt),
    })

    return NextResponse.json({ orders: ordersList })
  } catch (e) {
    return apiCatch(e, 'orders', 'GET', req)
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
    const validated = validateBody(orderCreateSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }
    const { accountId, symbol, side, orderType, lotSize, price, stopLoss, takeProfit } = validated.data

    const account = await db.query.accounts.findFirst({ where: eq(accounts.id, accountId) })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const order = await db.insert(orders).values({
      accountId,
      symbol,
      side,
      orderType,
      lotSize: Number(lotSize),
      price: Number(price),
      stopLoss: stopLoss != null ? Number(stopLoss) : null,
      takeProfit: takeProfit != null ? Number(takeProfit) : null,
      status: 'pending',
    }).returning().then(r => r[0]!)

    await audit({ action: 'order.create', resource: order.id, resourceType: 'order', actor: user.email, details: { symbol: order.symbol, side: order.side, lotSize: order.lotSize, price: order.price, orderType: order.orderType } })

    await logInfo(
      'mt5',
      `Pending ${orderType} order placed: ${side} ${lotSize} ${symbol} @ ${price}`,
      { orderId: order.id, accountId, userId: user.id },
    )

    return NextResponse.json({ order })
  } catch (e) {
    return apiCatch(e, 'orders', 'POST', req)
  }
}