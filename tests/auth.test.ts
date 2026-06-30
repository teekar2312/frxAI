// Unit tests for auth.ts — password hashing + role hierarchy.
// Critical: weak password hashing or wrong role checks = security breach.

import { test, describe, expect, beforeAll } from 'bun:test'
import {
  hashPassword,
  verifyPassword,
  hasRole,
  canTrade,
  canManageUsers,
  canManageSystem,
  type UserRole,
} from '../src/lib/auth'

describe('hashPassword + verifyPassword', () => {
  test('hash is different from plaintext', async () => {
    const hash = await hashPassword('mypassword')
    expect(hash).not.toBe('mypassword')
    expect(hash.length).toBeGreaterThan(50)
  })

  test('hash is different each time (salt)', async () => {
    const h1 = await hashPassword('same')
    const h2 = await hashPassword('same')
    expect(h1).not.toBe(h2) // different salts
  })

  test('verify correct password', async () => {
    const hash = await hashPassword('correct123')
    expect(await verifyPassword('correct123', hash)).toBe(true)
  })

  test('verify wrong password', async () => {
    const hash = await hashPassword('correct123')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  test('verify empty password fails', async () => {
    const hash = await hashPassword('real')
    expect(await verifyPassword('', hash)).toBe(false)
  })
})

describe('hasRole — role hierarchy', () => {
  test('admin has admin role', () => {
    expect(hasRole('admin', 'admin')).toBe(true)
  })

  test('admin has trader role', () => {
    expect(hasRole('admin', 'trader')).toBe(true)
  })

  test('admin has viewer role', () => {
    expect(hasRole('admin', 'viewer')).toBe(true)
  })

  test('trader has trader role', () => {
    expect(hasRole('trader', 'trader')).toBe(true)
  })

  test('trader has viewer role', () => {
    expect(hasRole('trader', 'viewer')).toBe(true)
  })

  test('trader does NOT have admin role', () => {
    expect(hasRole('trader', 'admin')).toBe(false)
  })

  test('viewer has viewer role', () => {
    expect(hasRole('viewer', 'viewer')).toBe(true)
  })

  test('viewer does NOT have trader role', () => {
    expect(hasRole('viewer', 'trader')).toBe(false)
  })

  test('viewer does NOT have admin role', () => {
    expect(hasRole('viewer', 'admin')).toBe(false)
  })

  test('undefined role has nothing', () => {
    expect(hasRole(undefined, 'viewer')).toBe(false)
    expect(hasRole(undefined, 'trader')).toBe(false)
    expect(hasRole(undefined, 'admin')).toBe(false)
  })
})

describe('canTrade', () => {
  test('admin can trade', () => {
    expect(canTrade('admin')).toBe(true)
  })

  test('trader can trade', () => {
    expect(canTrade('trader')).toBe(true)
  })

  test('viewer cannot trade', () => {
    expect(canTrade('viewer')).toBe(false)
  })

  test('undefined cannot trade', () => {
    expect(canTrade(undefined)).toBe(false)
  })
})

describe('canManageUsers', () => {
  test('admin can manage users', () => {
    expect(canManageUsers('admin')).toBe(true)
  })

  test('trader cannot manage users', () => {
    expect(canManageUsers('trader')).toBe(false)
  })

  test('viewer cannot manage users', () => {
    expect(canManageUsers('viewer')).toBe(false)
  })
})

describe('canManageSystem', () => {
  test('admin can manage system', () => {
    expect(canManageSystem('admin')).toBe(true)
  })

  test('trader cannot manage system', () => {
    expect(canManageSystem('trader')).toBe(false)
  })
})
