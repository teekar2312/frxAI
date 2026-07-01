import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { db, users, eq } from '@/lib/db'
import { verifyPassword, hashPassword } from '@/lib/auth'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBody, passwordChangeSchema } from '@/lib/validations'
import { apiCatch } from '@/lib/api-handler'
import { audit } from '@/lib/audit'

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
    const validated = validateBody(passwordChangeSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }
    const { currentPassword, newPassword } = validated.data

    // Verify current password
    const dbUser = await db.query.users.findFirst({ where: eq(users.id, user.id) })
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
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id))

    await audit({ action: 'user.update', resource: user.id, resourceType: 'user', actor: user.email, details: { field: 'password' } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiCatch(e, 'auth', 'POST', req)
  }
}