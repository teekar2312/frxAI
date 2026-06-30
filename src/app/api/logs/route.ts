import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch logs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { level, source, message, stack, context } = body || {}
    if (!level || !source || !message) {
      return NextResponse.json(
        { error: 'level, source, message are required' },
        { status: 400 },
      )
    }
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create log' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await db.log.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to clear logs' }, { status: 500 })
  }
}
