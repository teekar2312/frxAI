import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

/** GET /api/auth/me — current user profile (for the topbar avatar + role badge). */
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ user: null })
  }
  return NextResponse.json({ user })
}
