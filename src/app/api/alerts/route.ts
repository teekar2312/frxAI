import { NextRequest, NextResponse } from 'next/server'
import { db, alerts, desc } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { alertCreateSchema, validateBody } from '@/lib/validations'
import { apiCatch } from '@/lib/api-handler'
import { audit } from '@/lib/audit'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const alertsList = await db.query.alerts.findMany({
      orderBy: desc(alerts.createdAt),
    })
    return NextResponse.json({ alerts: alertsList })
  } catch (e) {
    return apiCatch(e, 'alerts', 'GET')
  }
}

export async function POST(req: NextRequest) {
  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.alertCreate)
  if (limited) return limited

  try {
    const body = await req.json().catch(() => ({}))
    const validated = validateBody(alertCreateSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }
    const { symbol, condition, price, notifyEmail, message } = validated.data
    const alert = await db.insert(alerts).values({
      symbol,
      condition,
      price: Number(price),
      active: true,
      triggered: false,
      notifyEmail: notifyEmail !== undefined ? !!notifyEmail : true,
      message: message ?? null,
    }).returning().then(r => r[0]!)
    await logInfo('system', `Alert created ${symbol} ${condition} ${price}`, {
      id: alert.id,
    })
    await audit({
      action: 'alert.create',
      resource: alert.id,
      resourceType: 'alert',
      details: { symbol, condition, price },
    })
    return NextResponse.json({ alert })
  } catch (e) {
    return apiCatch(e, 'alerts', 'POST', req)
  }
}