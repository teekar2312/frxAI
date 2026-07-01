import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { logCreateSchema, validateBody } from '@/lib/validations'
import { requireAdmin } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    // Check if client wants stats instead of logs
    if (searchParams?.get('stats') === 'true') {
      const { getLogStats } = await import('@/lib/log-cleanup')
      const stats = await getLogStats()
      return NextResponse.json(stats)
    }

    const level = searchParams.get('level') || undefined
    const source = searchParams.get('source') || undefined
    const limit = parseInt(searchParams.get('limit') || '200', 10)

    const where: any = {}
    if (level) where.level = level
    if (source) where.source = source

    const logs = await db.log.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(1000, limit)),
    })
    return NextResponse.json({ logs })
  } catch (e) {
    return apiCatch(e, 'logs', 'GET', req)
  }
}

export async function POST(req: NextRequest) {
  const limited = applyRateLimit(req, RATE_LIMITS.logCreate)
  if (limited) return limited

  try {
    const body = await req.json().catch(() => ({}))
    const validated = validateBody(logCreateSchema, body)
    if (!validated.success) return NextResponse.json(validated.error, { status: validated.error.status })
    const { level, source, message, stack, context } = validated.data

    const log = await db.log.create({
      data: {
        level,
        source,
        message: String(message),
        stack: stack ? String(stack) : null,
        context: context ? (typeof context === 'string' ? context : JSON.stringify(context)) : null,
      },
    })
    return NextResponse.json({ log })
  } catch (e) {
    return apiCatch(e, 'logs', 'POST', req)
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const limited = applyRateLimit(req, RATE_LIMITS.logPurge)
  if (limited) return limited

  try {
    await db.log.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiCatch(e, 'logs', 'DELETE')
  }
}
