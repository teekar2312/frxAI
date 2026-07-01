import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBody, systemConfigSchema } from '@/lib/validations'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db.systemConfig.findMany()
    const config: Record<string, string> = {}
    for (const r of rows) config[r.key] = r.value
    return NextResponse.json({ config })
  } catch (e) {
    return apiCatch(e, 'system', 'GET')
  }
}

export async function PATCH(req: NextRequest) {
  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.systemConfigUpdate)
  if (limited) return limited

  try {
    const body = await req.json()

    // Zod validation
    const validated = validateBody(systemConfigSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }

    const incoming = validated.data.config

    // Audit each config change
    const entries = Object.entries(incoming)
    for (const [key, value] of entries) {
      const existing = await db.systemConfig.findUnique({ where: { key } })
      const oldValue = existing?.value || ''

      await audit({
        action: 'system.config-change',
        resource: key,
        resourceType: 'system-config',
        details: { oldValue, newValue: value },
      })
    }

    const ops = entries.map(([key, value]) =>
      db.systemConfig.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      }),
    )
    await Promise.all(ops)

    const rows = await db.systemConfig.findMany()
    const config: Record<string, string> = {}
    for (const r of rows) config[r.key] = r.value
    return NextResponse.json({ config })
  } catch (e) {
    return apiCatch(e, 'system', 'PATCH', req)
  }
}