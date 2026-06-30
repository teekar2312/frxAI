import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireAuth } from '@/lib/auth-server'
import { listUsers, createUser, type UserRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/users — list all users (admin only).
 */
export async function GET() {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user
  const users = await listUsers()
  return NextResponse.json({ users })
}

/**
 * POST /api/users — create a new user (admin only).
 * Body: { email, name, password, role? }
 */
export async function POST(req: NextRequest) {
  const currentUser = await requireAdmin()
  if (currentUser instanceof NextResponse) return currentUser

  try {
    const body = await req.json()
    const { email, name, password, role } = body || {}

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: 'email, name, password are required' },
        { status: 400 },
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      )
    }

    const validRoles: UserRole[] = ['admin', 'trader', 'viewer']
    const userRole: UserRole = validRoles.includes(role) ? role : 'trader'

    const newUser = await createUser({
      email,
      name,
      password,
      role: userRole,
    })

    return NextResponse.json({ user: newUser }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to create user' },
      { status: 500 },
    )
  }
}
