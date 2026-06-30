import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db.riskSetting.findMany()
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value
    return NextResponse.json({ settings })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch risk settings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const incoming = body?.settings
    if (!incoming || typeof incoming !== 'object') {
      return NextResponse.json({ error: 'settings object is required' }, { status: 400 })
    }

    const keys = Object.keys(incoming)
    for (const key of keys) {
      const value = String(incoming[key])
      await db.riskSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      })
    }

    const rows = await db.riskSetting.findMany()
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value

    await logInfo('risk', 'Risk settings updated', { keys })
    return NextResponse.json({ settings })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to update risk settings' }, { status: 500 })
  }
}
