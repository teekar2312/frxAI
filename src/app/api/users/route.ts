import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireAuth } from '@/lib/auth-server'
import { listUsers, createUser, type UserRole } from '@/lib/auth'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { validateBody, userCreateSchema } from '@/lib/validations'
import { auditUser } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/users — list all users (admin only).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAdmin()
    if (user instanceof NextResponse) return user

    const users = await listUsers()
    return NextResponse.json({ users })
  } catch (e) {
    return apiCatch(e, 'users', 'GET', req)
  }
}

/**
 * POST /api/users — create a new user (admin only).
 * Body: { email, name, password, role? }
 */
export async function POST(req: NextRequest) {
  const currentUser = await requireAdmin()
  if (currentUser instanceof NextResponse) return currentUser

  const limited = applyRateLimit(req, RATE_LIMITS.userCreate)
  if (limited) return limited

  try {
    const body = await req.json()
    const validated = validateBody(userCreateSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }
    const { email, name, password, role } = validated.data

    const newUser = await createUser({
      email,
      name,
      password,
      role: role as UserRole,
    })

    await auditUser.create(newUser.id, currentUser.email, { email: newUser.email, name: newUser.name, role: newUser.role })

    return NextResponse.json({ user: newUser }, { status: 201 })
  } catch (e) {
    return apiCatch(e, 'users', 'POST', req)
  }
}