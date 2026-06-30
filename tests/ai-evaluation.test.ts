// Unit tests for AI evaluation logic — signal correctness determination.
// Tests the PURE logic (no DB) by extracting the evaluation rules.
// Critical: wrong evaluation = wrong accuracy = misleading AI quality metrics.

import { test, describe, expect } from 'bun:test'
import { SYMBOL_BASE } from '../src/lib/types'

/**
 * Extract the signal correctness logic for testing without DB.
 * This mirrors the logic in ai-evaluation.ts evaluateSignalOutcome().
 */
function determineSignalCorrect(
  direction: 'long' | 'short' | 'neutral',
  pipsMoved: number,
  pipThreshold = 1,
): boolean | null {
  if (direction === 'neutral') return null
  if (direction === 'long') return pipsMoved > pipThreshold
  if (direction === 'short') return pipsMoved < -pipThreshold
  return null
}

/**
 * Extract pip movement calculation.
 * pipsMoved = (currentPrice - signalPrice) / pip
 */
function calculatePipsMoved(
  symbol: string,
  signalPrice: number,
  currentPrice: number,
): number {
  const base = SYMBOL_BASE[symbol]
  if (!base) return 0
  return (currentPrice - signalPrice) / base.pip
}

/**
 * Extract confidence calibration logic.
 */
function calibrateConfidenceLogic(
  rawConfidence: number,
  historicalAccuracy: number,
  sampleSize: number,
  minSample = 10,
): { calibrated: number; adjusted: boolean } {
  if (sampleSize < minSample) {
    return { calibrated: rawConfidence, adjusted: false }
  }
  const historicalWeight = Math.min(0.4, (sampleSize / 100) * 0.4)
  const rawWeight = 1 - historicalWeight
  const calibrated = rawConfidence * rawWeight + historicalAccuracy * historicalWeight
  return { calibrated: Number(calibrated.toFixed(1)), adjusted: true }
}

describe('determineSignalCorrect', () => {
  test('long signal correct when price goes up significantly', () => {
    expect(determineSignalCorrect('long', 5)).toBe(true)
    expect(determineSignalCorrect('long', 50)).toBe(true)
  })

  test('long signal wrong when price goes down', () => {
    expect(determineSignalCorrect('long', -5)).toBe(false)
    expect(determineSignalCorrect('long', -50)).toBe(false)
  })

  test('long signal wrong when price barely moves (within threshold)', () => {
    expect(determineSignalCorrect('long', 0.5)).toBe(false) // < 1 pip threshold
    expect(determineSignalCorrect('long', 0)).toBe(false)
  })

  test('short signal correct when price goes down significantly', () => {
    expect(determineSignalCorrect('short', -5)).toBe(true)
    expect(determineSignalCorrect('short', -50)).toBe(true)
  })

  test('short signal wrong when price goes up', () => {
    expect(determineSignalCorrect('short', 5)).toBe(false)
    expect(determineSignalCorrect('short', 50)).toBe(false)
  })

  test('short signal wrong when price barely moves', () => {
    expect(determineSignalCorrect('short', -0.5)).toBe(false) // > -1 pip threshold
    expect(determineSignalCorrect('short', 0)).toBe(false)
  })

  test('neutral signal returns null (no prediction)', () => {
    expect(determineSignalCorrect('neutral', 100)).toBeNull()
    expect(determineSignalCorrect('neutral', -100)).toBeNull()
    expect(determineSignalCorrect('neutral', 0)).toBeNull()
  })

  test('exactly at threshold is NOT correct (must be > threshold)', () => {
    // pipsMoved = 1.0 exactly, threshold = 1 → NOT correct (must be > 1)
    expect(determineSignalCorrect('long', 1.0)).toBe(false)
    // pipsMoved = 1.01 → correct
    expect(determineSignalCorrect('long', 1.01)).toBe(true)
  })
})

describe('calculatePipsMoved', () => {
  test('EURUSD: 10 pip move', () => {
    // EURUSD pip = 0.0001, 10 pips = 0.0010
    // Use toBeCloseTo for floating point precision
    const pips = calculatePipsMoved('EURUSD', 1.0850, 1.0860)
    expect(pips).toBeCloseTo(10, 5)
  })

  test('EURUSD: negative move', () => {
    const pips = calculatePipsMoved('EURUSD', 1.0850, 1.0840)
    expect(pips).toBeCloseTo(-10, 5)
  })

  test('USDJPY: 10 pip move (pip = 0.01)', () => {
    const pips = calculatePipsMoved('USDJPY', 156.40, 156.50)
    expect(pips).toBeCloseTo(10, 5)
  })

  test('XAUUSD: 100 pip move (pip = 0.1)', () => {
    const pips = calculatePipsMoved('XAUUSD', 2335.0, 2345.0)
    expect(pips).toBeCloseTo(100, 5)
  })

  test('zero move', () => {
    const pips = calculatePipsMoved('EURUSD', 1.0850, 1.0850)
    expect(pips).toBe(0)
  })

  test('unknown symbol returns 0', () => {
    const pips = calculatePipsMoved('UNKNOWN', 100, 110)
    expect(pips).toBe(0)
  })
})

describe('calibrateConfidenceLogic', () => {
  test('no calibration when sample size < 10', () => {
    const result = calibrateConfidenceLogic(80, 60, 5)
    expect(result.adjusted).toBe(false)
    expect(result.calibrated).toBe(80)
  })

  test('no calibration when sample size = 0', () => {
    const result = calibrateConfidenceLogic(80, 0, 0)
    expect(result.adjusted).toBe(false)
    expect(result.calibrated).toBe(80)
  })

  test('calibration active at sample size 10', () => {
    const result = calibrateConfidenceLogic(80, 60, 10)
    expect(result.adjusted).toBe(true)
    // historicalWeight = min(0.4, 10/100 × 0.4) = 0.04
    // calibrated = 80 × 0.96 + 60 × 0.04 = 76.8 + 2.4 = 79.2
    expect(result.calibrated).toBe(79.2)
  })

  test('calibration stronger at sample size 50', () => {
    const result = calibrateConfidenceLogic(80, 60, 50)
    expect(result.adjusted).toBe(true)
    // historicalWeight = min(0.4, 50/100 × 0.4) = 0.2
    // calibrated = 80 × 0.8 + 60 × 0.2 = 64 + 12 = 76
    expect(result.calibrated).toBe(76)
  })

  test('calibration max weight at sample size 100+', () => {
    const result = calibrateConfidenceLogic(80, 60, 200)
    expect(result.adjusted).toBe(true)
    // historicalWeight = min(0.4, 200/100 × 0.4) = 0.4 (capped)
    // calibrated = 80 × 0.6 + 60 × 0.4 = 48 + 24 = 72
    expect(result.calibrated).toBe(72)
  })

  test('calibration lowers confidence when historical < raw', () => {
    const result = calibrateConfidenceLogic(90, 50, 50)
    expect(result.calibrated).toBeLessThan(90)
  })

  test('calibration raises confidence when historical > raw', () => {
    const result = calibrateConfidenceLogic(50, 90, 50)
    expect(result.calibrated).toBeGreaterThan(50)
  })

  test('calibration keeps confidence same when historical = raw', () => {
    const result = calibrateConfidenceLogic(70, 70, 50)
    expect(result.calibrated).toBe(70)
  })
})

describe('Accuracy computation logic', () => {
  // Test the aggregation logic: accuracy = correct / total × 100
  function computeAccuracy(correct: number, total: number): number {
    if (total === 0) return 0
    return Number(((correct / total) * 100).toFixed(1))
  }

  test('100% accuracy when all correct', () => {
    expect(computeAccuracy(10, 10)).toBe(100)
  })

  test('0% accuracy when all wrong', () => {
    expect(computeAccuracy(0, 10)).toBe(0)
  })

  test('50% accuracy', () => {
    expect(computeAccuracy(5, 10)).toBe(50)
  })

  test('69.2% accuracy (9/13)', () => {
    expect(computeAccuracy(9, 13)).toBe(69.2)
  })

  test('0 total returns 0 accuracy', () => {
    expect(computeAccuracy(0, 0)).toBe(0)
  })

  test('85.7% accuracy (6/7)', () => {
    expect(computeAccuracy(6, 7)).toBe(85.7)
  })
})
