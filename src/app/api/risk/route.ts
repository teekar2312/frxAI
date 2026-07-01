import { NextRequest, NextResponse } from 'next/server'
import { db, riskSettings, eq } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBody, riskSettingsSchema } from '@/lib/validations'
import { auditRisk } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db.query.riskSettings.findMany()
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value
    return NextResponse.json({ settings })
  } catch (e) {
    return apiCatch(e, 'risk', 'GET')
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

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
    await db.transaction(async (tx) => {
      for (const key of keys) {
        const existing = await tx.query.riskSettings.findFirst({ where: eq(riskSettings.key, key) })
        const oldValue = existing?.value || ''
        const newValue = String(validated.data.settings[key])

        await tx.insert(riskSettings).values({ key, value: newValue })
          .onDuplicateKeyUpdate({ set: { value: newValue } })

        await auditRisk.settingChange(key, oldValue, newValue, 'system')
      }
    })

    const rows = await db.query.riskSettings.findMany()
    const settings: Record<string, string> = {}
    for (const r of rows) settings[r.key] = r.value

    await logInfo('risk', 'Risk settings updated', { keys })
    return NextResponse.json({ settings })
  } catch (e) {
    return apiCatch(e, 'risk', 'PATCH', req)
  }
}