import { NextResponse } from 'next/server'
import { STRATEGIES } from '@/lib/strategies'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ strategies: STRATEGIES })
}
