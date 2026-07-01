import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBody, riskSettingsSchema } from '@/lib/validations'
import { auditRisk } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db.riskSetting.findMany()
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value
    return NextResponse.json({ settings })
  } catch (e) {
    return apiCatch(e, 'risk', 'GET')
  }
}

export async function PATCH(req: NextRequest) {
  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.riskUpdate)
  if (limited) return limited

  try {
    const body = await req.json().catch(() => ({}))
    const incoming = body?.settings
    if (!incoming || typeof incoming !== 'object') {
      return NextResponse.json({ error: 'settings object is required' }, { status: 400 })
    }

    // Zod validation
    const validated = validateBody(riskSettingsSchema, { settings: incoming })
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }

    const keys = Object.keys(validated.data.settings)
    for (const key of keys) {
      // Fetch old value for audit
      const existing = await db.riskSetting.findUnique({ where: { key } })
      const oldValue = existing?.value || ''
      const newValue = String(validated.data.settings[key])

      await db.riskSetting.upsert({
        where: { key },
        create: { key, value: newValue },
        update: { value: newValue },
      })

      // Audit each setting change
      await auditRisk.settingChange(key, oldValue, newValue, 'system')
    }

    const rows = await db.riskSetting.findMany()
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value

    await logInfo('risk', 'Risk settings updated', { keys })
    return NextResponse.json({ settings })
  } catch (e) {
    return apiCatch(e, 'risk', 'PATCH', req)
  }
}