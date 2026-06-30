import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendNotification, logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

// POST /api/economic-calendar/check-alerts
// Checks for high-impact economic events happening within the next 15 minutes.
// Sends email alerts for events that haven't been alerted yet (dedup via
// Notification table — checks if a notification with subject containing the
// event title already exists).
export async function POST() {
  const alerted: any[] = []

  try {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + 15 * 60000) // next 15 min

    // Find high-impact upcoming events in the next 15 min
    const events = await db.economicEvent.findMany({
      where: {
        impact: 'high',
        status: 'upcoming',
        eventTime: { gte: now, lte: windowEnd },
      },
      orderBy: { eventTime: 'asc' },
    })

    if (events.length === 0) {
      return NextResponse.json({ alerted: [], checked: 0 })
    }

    // Get configured email recipient
    const emailConfig = await db.systemConfig.findUnique({ where: { key: 'emailRecipient' } })
    const recipient = emailConfig?.value || 'trader@example.com'

    // Get existing notifications to dedup
    const existingNotifs = await db.notification.findMany({
      where: {
        type: 'news',
        createdAt: { gte: new Date(now.getTime() - 2 * 3600000) }, // last 2 hours
      },
      select: { subject: true },
    })
    const existingSubjects = new Set(existingNotifs.map((n) => n.subject))

    for (const event of events) {
      const subject = `⚠️ HIGH-IMPACT ALERT: ${event.title} in ${Math.round((event.eventTime.getTime() - now.getTime()) / 60000)}m`
      // Dedup: skip if we already sent a notification with this subject
      if (existingSubjects.has(subject)) continue

      const minsUntil = Math.round((event.eventTime.getTime() - now.getTime()) / 60000)
      const symbols = event.symbols || '—'
      const body = `HIGH-IMPACT ECONOMIC EVENT dalam ${minsUntil} menit!

Event: ${event.title}
Negara: ${event.country} (${event.currency})
Kategori: ${event.category}
Impact: ${event.impact.toUpperCase()}
Waktu (UTC): ${event.eventTime.toISOString()}
Waktu (WIB): ${event.eventTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}

Forecast: ${event.forecast || 'N/A'}
Previous: ${event.previous || 'N/A'}

Pair terdampak: ${symbols}

⚠️ PERINGATAN: Hindari scalping 5 menit sebelum dan sesudah event ini.
Spread dapat melebar signifikan dan slippage tinggi dapat terjadi.

— FinexFX AI Trading System`

      await sendNotification('news', subject, body, recipient)

      // Also create a log entry
      await logInfo('risk', `Economic event alert sent: ${event.title} (${event.country}) in ${minsUntil}m — affected: ${symbols}`)

      alerted.push({
        id: event.id,
        title: event.title,
        country: event.country,
        minsUntil,
        symbols,
      })
    }

    return NextResponse.json({ alerted, checked: events.length })
  } catch (e: any) {
    console.error('POST /api/economic-calendar/check-alerts error', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
