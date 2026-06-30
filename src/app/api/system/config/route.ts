import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db.systemConfig.findMany()
    const config: Record<string, string> = {}
    for (const r of rows) config[r.key] = r.value
    return NextResponse.json({ config })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const incoming: Record<string, unknown> = body?.config ?? {}
    if (typeof incoming !== 'object' || incoming === null) {
      return NextResponse.json({ error: 'config must be an object' }, { status: 400 })
    }

    const ops = Object.entries(incoming).map(([key, value]) =>
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
