import { NextResponse } from 'next/server'
import { computeRiskUsage } from '@/lib/risk-usage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const usage = await computeRiskUsage()
    return NextResponse.json(usage)
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to compute risk usage' },
      { status: 500 },
    )
  }
}
