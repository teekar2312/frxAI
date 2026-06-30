// Auth library — password hashing + user lookup + role helpers.
// Used by the NextAuth credentials provider and the user management API.

import bcrypt from 'bcryptjs'
import { db } from './db'

const BCRYPT_ROUNDS = 10

export type UserRole = 'admin' | 'trader' | 'viewer'

export interface SafeUser {
  id: string
  email: string
  name: string
  role: UserRole
  active: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

export function toSafeUser(u: any): SafeUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as UserRole,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }
}

/** Hash a plaintext password using bcrypt. */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS)
}

/** Verify a plaintext password against a bcrypt hash. */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}

/**
 * Look up a user by email + verify password.
 * Returns the safe user (without passwordHash) on success, null on failure.
 */
export async function authenticateUser(email: string, password: string): Promise<SafeUser | null> {
  try {
    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user) return null
    if (!user.active) return null
    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) return null
    // Update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
    return toSafeUser(user)
  } catch (e) {
    console.error('authenticateUser error:', e)
    return null
  }
}

/** Create a new user with a hashed password. Throws on duplicate email. */
export async function createUser(params: {
  email: string
  name: string
  password: string
  role?: UserRole
}): Promise<SafeUser> {
  const email = params.email.toLowerCase().trim()
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    throw new Error(`User with email ${email} already exists`)
  }
  const passwordHash = await hashPassword(params.password)
  const user = await db.user.create({
    data: {
      email,
      name: params.name.trim(),
      passwordHash,
      role: params.role || 'trader',
      active: true,
    },
  })
  return toSafeUser(user)
}

/** List all users (without password hashes). */
export async function listUsers(): Promise<SafeUser[]> {
  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } })
  return users.map(toSafeUser)
}

/** Update user role or active status. */
export async function updateUser(
  id: string,
  params: { role?: UserRole; active?: boolean; name?: string },
): Promise<SafeUser> {
  const data: any = {}
  if (params.role) data.role = params.role
  if (params.active !== undefined) data.active = params.active
  if (params.name) data.name = params.name.trim()
  const user = await db.user.update({ where: { id }, data })
  return toSafeUser(user)
}

/** Reset a user's password. */
export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword)
  await db.user.update({ where: { id }, data: { passwordHash } })
}

/** Delete a user. */
export async function deleteUser(id: string): Promise<void> {
  await db.user.delete({ where: { id } })
}

/**
 * Role hierarchy: admin > trader > viewer.
 * Returns true if the given role has at least the required privilege level.
 */
export function hasRole(userRole: UserRole | undefined, required: UserRole): boolean {
  if (!userRole) return false
  const levels: Record<UserRole, number> = { viewer: 1, trader: 2, admin: 3 }
  return levels[userRole] >= levels[required]
}

/** Can the user perform trade operations (open/close/modify)? */
export function canTrade(role: UserRole | undefined): boolean {
  return hasRole(role, 'trader')
}

/** Can the user manage users (create/delete/reset password)? */
export function canManageUsers(role: UserRole | undefined): boolean {
  return hasRole(role, 'admin')
}

/** Can the user modify system settings? */
export function canManageSystem(role: UserRole | undefined): boolean {
  return hasRole(role, 'admin')
}
