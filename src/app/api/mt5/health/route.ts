import { NextResponse } from 'next/server'
import { bridgeHealth } from '@/lib/mt5-client'

export const dynamic = 'force-dynamic'

/** GET /api/mt5/health — bridge status (cached 5s on server side). */
export async function GET() {
  const health = await bridgeHealth()
  return NextResponse.json({
    ok: health.ok,
    adapter: health.adapter,
    isLive: health.isLive,
    message: health.ok
      ? health.isLive
        ? 'MT5 bridge online — LIVE mode (real orders)'
        : 'MT5 bridge online — simulation mode (mock adapter)'
      : 'MT5 bridge offline — falling back to local synthetic prices',
  })
}
