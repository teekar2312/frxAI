import { NextRequest, NextResponse } from 'next/server'
import { getAccountInfo } from '@/lib/mt5-client'

export const dynamic = 'force-dynamic'

/** GET /api/mt5/account?login=12345678 — live account info from MT5 bridge. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const login = Number(searchParams.get('login'))
    if (!login) {
      return NextResponse.json({ error: 'login query param is required' }, { status: 400 })
    }
    const account = await getAccountInfo(login)
    if (!account) {
      return NextResponse.json(
        { error: 'Account not connected to MT5 bridge' },
        { status: 404 },
      )
    }
    return NextResponse.json({ account })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to fetch account info' },
      { status: 500 },
    )
  }
}
