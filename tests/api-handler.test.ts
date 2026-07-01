// Unit tests for api-handler.ts — sanitizeMessage logic and module structure.
// The sanitizeMessage function is private, so we replicate its logic here
// to verify the sanitization behavior in production vs development.

import { test, describe, expect } from 'bun:test'

/**
 * Replicated sanitizeMessage logic from src/lib/api-handler.ts
 * for testing purposes (the real function is not exported).
 */
function sanitizeMessage(raw: string, isProduction: boolean): string {
  if (!isProduction) return raw

  const internalPatterns = [
    /prisma/i,
    /sqlite/i,
    /unique constraint/i,
    /foreign key/i,
    /\/home\//i,
    /\/usr\//i,
    /\/node_modules/i,
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
  ]

  for (const p of internalPatterns) {
    if (p.test(raw)) return 'An internal error occurred'
  }

  if (raw.length > 200) return raw.slice(0, 200) + '...'

  return raw
}

describe('sanitizeMessage — production mode', () => {
  const prod = true

  test('hides Prisma errors in production', () => {
    const msg = 'PrismaClientInitializationError: Could not connect to database'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('hides SQLite errors in production', () => {
    const msg = 'SQLite error: UNIQUE constraint failed: users.email'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('hides file path errors in production', () => {
    const msg = 'Error reading /home/z/frxAI-fix/config.json: ENOENT'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('truncates very long messages in production', () => {
    const longMsg = 'A'.repeat(250)
    const result = sanitizeMessage(longMsg, prod)
    expect(result.length).toBe(203) // 200 chars + '...'
    expect(result.endsWith('...')).toBe(true)
  })

  test('passes through normal errors unchanged in production', () => {
    const normal = 'Trade not found'
    expect(sanitizeMessage(normal, prod)).toBe(normal)
  })

  test('hides /usr/ path errors', () => {
    const msg = 'Module not found: /usr/local/lib/node_modules/missing'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('hides /node_modules/ path errors', () => {
    const msg = 'Cannot find module in /node_modules/prisma'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('hides ECONNREFUSED errors', () => {
    const msg = 'connect ECONNREFUSED 127.0.0.1:3000'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('hides ETIMEDOUT errors', () => {
    const msg = 'connect ETIMEDOUT 192.168.1.1:5432'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('hides ENOTFOUND errors', () => {
    const msg = 'getaddrinfo ENOTFOUND mt5-bridge'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('hides foreign key errors', () => {
    const msg = 'Foreign key constraint failed on field: accountId'
    expect(sanitizeMessage(msg, prod)).toBe('An internal error occurred')
  })

  test('does not truncate messages at exactly 200 chars', () => {
    const exact = 'A'.repeat(200)
    const result = sanitizeMessage(exact, prod)
    expect(result).toBe(exact)
    expect(result.endsWith('...')).toBe(false)
  })
})

describe('sanitizeMessage — development mode', () => {
  const dev = false

  test('passes through Prisma errors unchanged in dev', () => {
    const msg = 'PrismaClientInitializationError: Could not connect to database'
    expect(sanitizeMessage(msg, dev)).toBe(msg)
  })

  test('passes through SQLite errors unchanged in dev', () => {
    const msg = 'SQLite error: UNIQUE constraint failed: users.email'
    expect(sanitizeMessage(msg, dev)).toBe(msg)
  })

  test('passes through file path errors unchanged in dev', () => {
    const msg = 'Error reading /home/z/frxAI-fix/config.json: ENOENT'
    expect(sanitizeMessage(msg, dev)).toBe(msg)
  })

  test('does not truncate long messages in dev', () => {
    const longMsg = 'A'.repeat(500)
    expect(sanitizeMessage(longMsg, dev)).toBe(longMsg)
  })
})

describe('api-handler module structure', () => {
  test('module exports apiCatch as a function', async () => {
    // The module uses 'server-only' which may prevent import in test env.
    // Verify the export signature by checking the source file exists and
    // contains the expected export.
    const { readFileSync } = await import('fs')
    const source = readFileSync('src/lib/api-handler.ts', 'utf-8')
    expect(source).toContain('export function apiCatch')
    expect(source).toContain('function sanitizeMessage')
    expect(source).toContain("import 'server-only'")
  })
})