import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const alerts = await db.alert.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ alerts })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch alerts' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { symbol, condition, price, notifyEmail, message } = body || {}
    if (!symbol || !condition || price === undefined || price === null) {
      return NextResponse.json({ error: 'symbol, condition, price are required' }, { status: 400 })
    }
    const alert = await db.alert.create({
      data: {
        symbol,
        condition,
        price: Number(price),
        active: true,
        triggered: false,
        notifyEmail: notifyEmail !== undefined ? !!notifyEmail : true,
        message: message ?? null,
      },
    })
    await logInfo('system', `Alert created ${symbol} ${condition} ${price}`, {
      id: alert.id,
    })
    return NextResponse.json({ alert })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create alert' }, { status: 500 })
  }
}
