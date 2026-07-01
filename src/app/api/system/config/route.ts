import { NextRequest, NextResponse } from 'next/server'
import { db, systemConfigs, eq } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBody, systemConfigSchema } from '@/lib/validations'
import { audit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db.query.systemConfigs.findMany()
    const config: Record<string, string> = {}
    for (const r of rows) config[r.key] = r.value
    return NextResponse.json({ config })
  } catch (e) {
    return apiCatch(e, 'system', 'GET')
  }
}

export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.systemConfigUpdate)
  if (limited) return limited

  try {
    const body = await req.json()

    const validated = validateBody(systemConfigSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }

    const incoming = validated.data.config
    const entries = Object.entries(incoming)

    // Collect old values BEFORE write (for audit diff)
    const oldValues: Record<string, string> = {}
    for (const [key] of entries) {
      const existing = await db.query.systemConfigs.findFirst({ where: eq(systemConfigs.key, key) })
      oldValues[key] = existing?.value || ''
    }

    // Perform all upserts in a transaction
    await db.transaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx.insert(systemConfigs).values({ key, value: String(value) })
          .onDuplicateKeyUpdate({ set: { value: String(value) } })
      }
    })

    // Audit AFTER successful write
    for (const [key, value] of entries) {
      await audit({
        action: 'system.config-change',
        resource: key,
        resourceType: 'system-config',
        details: { oldValue: oldValues[key], newValue: value },
      })
    }

    const rows = await db.query.systemConfigs.findMany()
    const config: Record<string, string> = {}
    for (const r of rows) config[r.key] = r.value
    return NextResponse.json({ config })
  } catch (e) {
    return apiCatch(e, 'system', 'PATCH', req)
  }
}