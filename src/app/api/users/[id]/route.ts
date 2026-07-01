import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { updateUser, resetUserPassword, deleteUser, type UserRole } from '@/lib/auth'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/users/[id] — update user role/active/name (admin only).
 * Body: { role?, active?, name? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await requireAdmin()
  if (currentUser instanceof NextResponse) return currentUser

  const limited = applyRateLimit(req, RATE_LIMITS.userManage)
  if (limited) return limited

  try {
    const { id } = await params
    const body = await req.json()
    const updates: { role?: UserRole; active?: boolean; name?: string } = {}

    if (body.role !== undefined) {
      const validRoles: UserRole[] = ['admin', 'trader', 'viewer']
      if (!validRoles.includes(body.role)) {
        return NextResponse.json(
          { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
          { status: 400 },
        )
      }
      updates.role = body.role
    }
    if (body.active !== undefined) updates.active = !!body.active
    if (body.name !== undefined) updates.name = String(body.name)

    // Prevent admin from deactivating themselves
    if (currentUser.id === id && updates.active === false) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account' },
        { status: 400 },
      )
    }

    const updated = await updateUser(id, updates)

    await audit({ action: 'user.update', resource: id, resourceType: 'user', actor: currentUser.email, details: { updatedFields: Object.keys(updates) } })

    return NextResponse.json({ user: updated })
  } catch (e) {
    return apiCatch(e, 'users', 'PATCH', req)
  }
}

/**
 * POST /api/users/[id] — reset password (admin only).
 * Body: { password: string }
 * (Uses POST instead of PATCH because it's a sensitive action.)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await requireAdmin()
  if (currentUser instanceof NextResponse) return currentUser

  try {
    const { id } = await params
    const body = await req.json()
    const { password } = body || {}

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      )
    }

    await resetUserPassword(id, password)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiCatch(e, 'users', 'POST', req)
  }
}

/**
 * DELETE /api/users/[id] — delete user (admin only).
 * Cannot delete yourself.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await requireAdmin()
  if (currentUser instanceof NextResponse) return currentUser

  const limited = applyRateLimit(req, RATE_LIMITS.userManage)
  if (limited) return limited

  try {
    const { id } = await params

    if (currentUser.id === id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 },
      )
    }

    await deleteUser(id)

    await audit({ action: 'user.delete', resource: id, resourceType: 'user', actor: currentUser.email, details: {} })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiCatch(e, 'users', 'DELETE', req)
  }
}