// Server-side session helpers for API routes.
// Wraps getServerSession with our auth options + provides role-checking utilities.

import 'server-only'
import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from './auth-config'
import { canTrade, canManageUsers, canManageSystem, type UserRole } from './auth'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
}

/** Get the current session user on the server side. Returns null if not authenticated. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  }
}

/**
 * Require authentication. Returns the user if authenticated, or a 401 NextResponse if not.
 * Usage in API routes:
 *   const user = await requireAuth()
 *   if (user instanceof NextResponse) return user  // 401
 *   // user is now typed as SessionUser
 */
export async function requireAuth(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized — authentication required' },
      { status: 401 },
    )
  }
  return user
}

/**
 * Require a specific role. Returns the user if authorized, or 401/403 NextResponse if not.
 * Usage:
 *   const user = await requireRole('trader', req)
 *   if (user instanceof NextResponse) return user
 */
export async function requireRole(
  minRole: UserRole,
  _req?: NextRequest,
): Promise<SessionUser | NextResponse> {
  const authResult = await requireAuth()
  if (authResult instanceof NextResponse) return authResult // 401

  const levels: Record<UserRole, number> = { viewer: 1, trader: 2, admin: 3 }
  if (levels[authResult.role] < levels[minRole]) {
    return NextResponse.json(
      {
        error: `Forbidden — requires ${minRole} role or higher`,
        yourRole: authResult.role,
        requiredRole: minRole,
      },
      { status: 403 },
    )
  }
  return authResult
}

/** Require trader role (can open/close/modify trades). */
export async function requireTrader(): Promise<SessionUser | NextResponse> {
  return requireRole('trader')
}

/** Require admin role (can manage users, system config). */
export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  return requireRole('admin')
}

/** Convenience: check if the current user can trade. */
export async function checkCanTrade(): Promise<boolean> {
  const user = await getSessionUser()
  return canTrade(user?.role)
}

/** Convenience: check if the current user can manage users. */
export async function checkCanManageUsers(): Promise<boolean> {
  const user = await getSessionUser()
  return canManageUsers(user?.role)
}

/** Convenience: check if the current user can manage system settings. */
export async function checkCanManageSystem(): Promise<boolean> {
  const user = await getSessionUser()
  return canManageSystem(user?.role)
}
