import { NextResponse } from 'next/server'
import { STRATEGIES } from '@/lib/strategies'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json({ strategies: STRATEGIES })
  } catch (e) {
    return apiCatch(e, 'strategies', 'GET')
  }
}