import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { verifyPassword, hashPassword } from '@/lib/auth'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/me/password — change own password.
 * Body: { currentPassword, newPassword }
 *
 * Requires the current password to be correct. Available to all authenticated
 * users (not just admin) — users should be able to change their own password.
 */
export async function POST(req: NextRequest) {
  // Rate limit: 3 password changes per hour per IP
  const limited = applyRateLimit(req, RATE_LIMITS.passwordChange)
  if (limited) return limited

  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  try {
    const body = await req.json()
    const { currentPassword, newPassword } = body || {}

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'currentPassword and newPassword are required' },
        { status: 400 },
      )
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'New password must be at least 6 characters' },
        { status: 400 },
      )
    }

    // Verify current password
    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const ok = await verifyPassword(currentPassword, dbUser.passwordHash)
    if (!ok) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 400 },
      )
    }

    // Update password
    const passwordHash = await hashPassword(newPassword)
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to change password' },
      { status: 500 },
    )
  }
}
