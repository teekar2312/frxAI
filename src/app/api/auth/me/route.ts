import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-server'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

/** GET /api/auth/me — current user profile (for the topbar avatar + role badge). */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ user: null })
    }
    return NextResponse.json({ user })
  } catch (e) {
    return apiCatch(e, 'auth', 'GET', req)
  }
}