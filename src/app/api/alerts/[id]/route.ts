import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendWebhook } from '@/lib/webhook'
import { logInfo } from '@/lib/logger'
import { apiCatch } from '@/lib/api-handler'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const data: any = {}
    if (body?.active !== undefined) data.active = !!body.active
    if (body?.triggered !== undefined) data.triggered = !!body.triggered
    if (body?.triggeredAt !== undefined) {
      data.triggeredAt = body.triggeredAt ? new Date(body.triggeredAt) : null
    }

    // When marking as triggered, also fire a webhook so the user is notified
    // on all their channels (Discord/Telegram/Slack) — best-effort, never throws.
    if (body?.triggered === true) {
      try {
        const alert = await db.alert.findUnique({ where: { id } })
        if (alert) {
          await sendWebhook({
            type: 'alert',
            title: `🔔 Price Alert Triggered: ${alert.symbol}`,
            message:
              `**${alert.symbol}** ${alert.condition.replace('_', ' ').toUpperCase()} ${alert.price}` +
              (alert.message ? `\n\n_"${alert.message}"_` : ''),
            fields: [
              { name: 'Symbol', value: alert.symbol },
              { name: 'Condition', value: alert.condition.replace('_', ' ') },
              { name: 'Target Price', value: String(alert.price) },
              { name: 'Triggered At', value: new Date().toISOString() },
            ],
            color: 0xf59e0b, // amber
          })
          await logInfo('system', `Alert webhook fired for ${alert.symbol} ${alert.condition} ${alert.price}`, {
            alertId: alert.id,
          })
        }
      } catch (e) {
        console.error('Alert webhook send failed:', e)
      }
    }

    const alert = await db.alert.update({
      where: { id },
      data,
    })

    await audit({
      action: 'alert.update',
      resource: id,
      resourceType: 'alert',
      details: { changes: data },
    })

    return NextResponse.json({ alert })
  } catch (e) {
    return apiCatch(e, 'alerts', 'PATCH', req)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await db.alert.delete({ where: { id } })

    await audit({
      action: 'alert.delete',
      resource: id,
      resourceType: 'alert',
      details: {},
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiCatch(e, 'alerts', 'DELETE', req)
  }
}