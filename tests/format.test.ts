// Unit tests for format.ts — display formatting helpers.
// Wrong formatting = confusing UX (e.g., showing -$100 as +$100).

import { test, describe, expect } from 'bun:test'
import {
  fmtMoney,
  fmtPrice,
  fmtPct,
  relativeTime,
  useClock,
  formatJakartaTime,
  formatUtcTime,
} from '../src/lib/format'

describe('fmtMoney', () => {
  test('formats positive amount with $', () => {
    const result = fmtMoney(1234.56)
    expect(result).toContain('1,234.56')
    expect(result).toContain('$')
  })

  test('formats negative amount', () => {
    const result = fmtMoney(-500)
    expect(result).toContain('500')
    expect(result).toContain('-')
  })

  test('formats zero', () => {
    const result = fmtMoney(0)
    expect(result).toContain('0')
  })

  test('handles large numbers', () => {
    const result = fmtMoney(1000000)
    expect(result).toContain('1,000,000')
  })
})

describe('fmtPrice', () => {
  test('EURUSD has 5 decimal places', () => {
    const result = fmtPrice('EURUSD', 1.08512)
    expect(result).toContain('1.08512')
  })

  test('USDJPY has 3 decimal places', () => {
    const result = fmtPrice('USDJPY', 156.456)
    expect(result).toContain('156.456')
  })

  test('XAUUSD has 2 decimal places', () => {
    const result = fmtPrice('XAUUSD', 2335.50)
    expect(result).toContain('2335.50')
  })
})

describe('fmtPct', () => {
  test('formats positive percentage', () => {
    const result = fmtPct(2.5)
    expect(result).toContain('2.5')
    expect(result).toContain('%')
  })

  test('formats negative percentage', () => {
    const result = fmtPct(-1.2)
    expect(result).toContain('-1.2')
    expect(result).toContain('%')
  })

  test('formats zero', () => {
    const result = fmtPct(0)
    expect(result).toContain('0')
    expect(result).toContain('%')
  })
})

describe('relativeTime', () => {
  test('returns a non-empty string for recent time', () => {
    const now = new Date()
    const result = relativeTime(now)
    expect(result.length).toBeGreaterThan(0)
    // Indonesian format: "0d lalu" or similar
    expect(result).toContain('lalu')
  })

  test('returns minutes for 5 min ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)
    const result = relativeTime(fiveMinAgo)
    expect(result).toContain('5')
    expect(result).toMatch(/m|i|min/i)
  })

  test('returns hours for 2 hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const result = relativeTime(twoHoursAgo)
    expect(result).toContain('2')
    expect(result).toMatch(/j|h|hour/i)
  })
})

describe('formatJakartaTime', () => {
  test('returns a non-empty string with time pattern', () => {
    const now = new Date()
    const result = formatJakartaTime(now)
    expect(result.length).toBeGreaterThan(0)
    // Should contain a time-like pattern (HH:MM or HH.MM)
    expect(result).toMatch(/\d{1,2}[:.]\d{2}/)
  })
})

describe('formatUtcTime', () => {
  test('returns a time string with UTC', () => {
    const now = new Date()
    const result = formatUtcTime(now)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })
})
