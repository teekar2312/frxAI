// Unit tests for validations.ts — Zod validation schemas.
// Ensures schemas accept valid data, reject invalid data, and apply correct defaults/clamps.

import { test, describe, expect } from 'bun:test'
import {
  tradeCreateSchema,
  accountCreateSchema,
  orderCreateSchema,
  alertCreateSchema,
  userCreateSchema,
  partialCloseSchema,
  moveToBESchema,
  riskSettingsSchema,
  systemConfigSchema,
  closeAllSchema,
  backtestCreateSchema,
} from '../src/lib/validations'

describe('tradeCreateSchema', () => {
  test('accepts valid trade data', () => {
    const result = tradeCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'EURUSD',
      side: 'buy',
      lotSize: 0.1,
      stopLoss: 1.08500,
      takeProfit: 1.09000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.source).toBe('manual')
      expect(result.data.trailingStop).toBe(false)
      expect(result.data.trailingPips).toBe(0)
    }
  })

  test('rejects invalid symbol', () => {
    const result = tradeCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'BTCUSD',
      side: 'buy',
      lotSize: 0.1,
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid side', () => {
    const result = tradeCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'EURUSD',
      side: 'long',
      lotSize: 0.1,
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid lotSize (negative)', () => {
    const result = tradeCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'EURUSD',
      side: 'buy',
      lotSize: -1,
    })
    expect(result.success).toBe(false)
  })

  test('rejects invalid lotSize (zero)', () => {
    const result = tradeCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'EURUSD',
      side: 'buy',
      lotSize: 0,
    })
    expect(result.success).toBe(false)
  })

  test('rejects lotSize > 100', () => {
    const result = tradeCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'EURUSD',
      side: 'buy',
      lotSize: 101,
    })
    expect(result.success).toBe(false)
  })
})

describe('accountCreateSchema', () => {
  test('accepts valid data', () => {
    const result = accountCreateSchema.safeParse({
      name: 'My Account',
      login: '12345678',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.broker).toBe('FINEX Indonesia')
      expect(result.data.accountType).toBe('demo')
      expect(result.data.currency).toBe('USD')
      expect(result.data.leverage).toBe('1:100')
      expect(result.data.balance).toBe(10000)
      expect(result.data.isDefault).toBe(false)
    }
  })

  test('rejects missing name', () => {
    const result = accountCreateSchema.safeParse({
      login: '12345678',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing login', () => {
    const result = accountCreateSchema.safeParse({
      name: 'My Account',
    })
    expect(result.success).toBe(false)
  })

  test('rejects empty name', () => {
    const result = accountCreateSchema.safeParse({
      name: '',
      login: '12345678',
    })
    expect(result.success).toBe(false)
  })
})

describe('orderCreateSchema', () => {
  test('accepts valid order', () => {
    const result = orderCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'XAUUSD',
      side: 'sell',
      orderType: 'limit',
      lotSize: 0.5,
      price: 2350.00,
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid orderType', () => {
    const result = orderCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'EURUSD',
      side: 'buy',
      orderType: 'market',
      lotSize: 0.1,
      price: 1.08500,
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing price', () => {
    const result = orderCreateSchema.safeParse({
      accountId: 'acc-123',
      symbol: 'EURUSD',
      side: 'buy',
      orderType: 'limit',
      lotSize: 0.1,
    })
    expect(result.success).toBe(false)
  })
})

describe('alertCreateSchema', () => {
  test('accepts valid alert', () => {
    const result = alertCreateSchema.safeParse({
      symbol: 'GBPUSD',
      condition: 'above',
      price: 1.27000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notifyEmail).toBe(true)
    }
  })

  test('accepts all condition types', () => {
    for (const cond of ['above', 'below', 'cross_up', 'cross_down'] as const) {
      const result = alertCreateSchema.safeParse({
        symbol: 'USDJPY',
        condition: cond,
        price: 155.000,
      })
      expect(result.success).toBe(true)
    }
  })
})

describe('userCreateSchema', () => {
  test('accepts valid user', () => {
    const result = userCreateSchema.safeParse({
      email: 'test@example.com',
      name: 'Test User',
      password: 'secure123',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('trader')
    }
  })

  test('rejects invalid email', () => {
    const result = userCreateSchema.safeParse({
      email: 'not-an-email',
      name: 'Test User',
      password: 'secure123',
    })
    expect(result.success).toBe(false)
  })

  test('rejects short password', () => {
    const result = userCreateSchema.safeParse({
      email: 'test@example.com',
      name: 'Test User',
      password: 'abc',
    })
    expect(result.success).toBe(false)
  })

  test('accepts admin role', () => {
    const result = userCreateSchema.safeParse({
      email: 'admin@example.com',
      name: 'Admin',
      password: 'adminpass123',
      role: 'admin',
    })
    expect(result.success).toBe(true)
  })
})

describe('partialCloseSchema', () => {
  test('clamps percent to 1-100 (below min) → rejects', () => {
    const result = partialCloseSchema.safeParse({ percent: -10 })
    expect(result.success).toBe(false)
  })

  test('clamps percent to 1-100 (above max) → rejects', () => {
    const result = partialCloseSchema.safeParse({ percent: 200 })
    expect(result.success).toBe(false)
  })

  test('keeps percent in range unchanged', () => {
    const result = partialCloseSchema.safeParse({ percent: 50 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.percent).toBe(50)
    }
  })

  test('accepts boundary values (1 and 100)', () => {
    const r1 = partialCloseSchema.safeParse({ percent: 1 })
    const r2 = partialCloseSchema.safeParse({ percent: 100 })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
  })

  test('uses default of 50 when empty', () => {
    const result = partialCloseSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.percent).toBe(50)
    }
  })
})

describe('moveToBESchema', () => {
  test('clamps bufferPips to 0-50 (below min) → rejects', () => {
    const result = moveToBESchema.safeParse({ bufferPips: -5 })
    expect(result.success).toBe(false)
  })

  test('clamps bufferPips to 0-50 (above max) → rejects', () => {
    const result = moveToBESchema.safeParse({ bufferPips: 100 })
    expect(result.success).toBe(false)
  })

  test('keeps bufferPips in range unchanged', () => {
    const result = moveToBESchema.safeParse({ bufferPips: 5 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.bufferPips).toBe(5)
    }
  })

  test('accepts boundary values (0 and 50)', () => {
    const r0 = moveToBESchema.safeParse({ bufferPips: 0 })
    const r50 = moveToBESchema.safeParse({ bufferPips: 50 })
    expect(r0.success).toBe(true)
    expect(r50.success).toBe(true)
  })

  test('uses default of 0 when empty', () => {
    const result = moveToBESchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.bufferPips).toBe(0)
    }
  })
})

describe('riskSettingsSchema', () => {
  test('validates settings object', () => {
    const result = riskSettingsSchema.safeParse({
      settings: {
        maxRiskPerTrade: '2',
        maxDailyDrawdown: '5',
        maxOpenTrades: '10',
      },
    })
    expect(result.success).toBe(true)
  })

  test('rejects non-object settings', () => {
    const result = riskSettingsSchema.safeParse({
      settings: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing settings field', () => {
    const result = riskSettingsSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('systemConfigSchema', () => {
  test('validates config object', () => {
    const result = systemConfigSchema.safeParse({
      config: {
        theme: 'dark',
        language: 'id',
        timezone: 'Asia/Jakarta',
      },
    })
    expect(result.success).toBe(true)
  })

  test('rejects non-object config', () => {
    const result = systemConfigSchema.safeParse({
      config: 'not-an-object',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing config field', () => {
    const result = systemConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('closeAllSchema', () => {
  test('validates optional fields — empty object is valid', () => {
    const result = closeAllSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('validates with accountId only', () => {
    const result = closeAllSchema.safeParse({
      accountId: 'acc-123',
    })
    expect(result.success).toBe(true)
  })

  test('validates with reason only', () => {
    const result = closeAllSchema.safeParse({
      reason: 'Risk limit reached',
    })
    expect(result.success).toBe(true)
  })

  test('validates with both optional fields', () => {
    const result = closeAllSchema.safeParse({
      accountId: 'acc-123',
      reason: 'Kill switch activated',
    })
    expect(result.success).toBe(true)
  })
})

describe('backtestCreateSchema', () => {
  test('validates required fields', () => {
    const result = backtestCreateSchema.safeParse({
      name: 'MA Crossover Test',
      symbol: 'EURUSD',
      strategy: 'moving_average_crossover',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.initialCapital).toBe(10000)
    }
  })

  test('rejects missing name', () => {
    const result = backtestCreateSchema.safeParse({
      symbol: 'EURUSD',
      strategy: 'rsi_divergence',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing symbol', () => {
    const result = backtestCreateSchema.safeParse({
      name: 'Test Backtest',
      strategy: 'rsi_divergence',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing strategy', () => {
    const result = backtestCreateSchema.safeParse({
      name: 'Test Backtest',
      symbol: 'EURUSD',
    })
    expect(result.success).toBe(false)
  })

  test('rejects initialCapital below 100', () => {
    const result = backtestCreateSchema.safeParse({
      name: 'Test',
      symbol: 'EURUSD',
      strategy: 'test',
      initialCapital: 50,
    })
    expect(result.success).toBe(false)
  })

  test('accepts valid optional fields', () => {
    const result = backtestCreateSchema.safeParse({
      name: 'Full Test',
      symbol: 'XAUUSD',
      strategy: 'breakout',
      timeframe: 'H1',
      periodFrom: '2024-01-01T00:00:00Z',
      periodTo: '2024-06-01T00:00:00Z',
      initialCapital: 50000,
      riskPerTradePct: 1.5,
      stopLossPips: 30,
      riskReward: 2.5,
    })
    expect(result.success).toBe(true)
  })
})