import { NextResponse } from 'next/server'
import { computeRiskUsage } from '@/lib/risk-usage'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const usage = await computeRiskUsage()
    return NextResponse.json(usage)
  } catch (e) {
    return apiCatch(e, 'risk', 'GET')
  }
}