// AI Signal Evaluation — tracks real accuracy of AI signals by comparing
// predicted direction with actual price movement after the hold period.
//
// This replaces the old Math.random()-based accuracy simulation with
// REAL computed accuracy from historical signal outcomes.
//
// Flow:
//   1. Signal generated with direction + confidence + priceAtSignal
//   2. After hold period (e.g., 30 min for M5), evaluate the signal:
//      - Compare current price vs price at signal time
//      - If direction was "long" and price went up → correct
//      - If direction was "short" and price went down → correct
//      - If direction was "neutral" → skip (no prediction to validate)
//   3. Store outcome in AiSignalOutcome table
//   4. computeRealAccuracy() aggregates outcomes → real accuracy %

import 'server-only'
import { db, eq, and, desc, lt, inArray, isNotNull, not, exists, sql } from './db'
import { aiSignals, aiSignalOutcomes } from './db'
import { priceAt, bidAsk } from './market'
import { SYMBOL_BASE } from './types'
import { logInfo } from './logger'

/** Timeframe → hold period in minutes (how long until we evaluate the signal). */
const TF_HOLD_MINUTES: Record<string, number> = {
  M1: 5,
  M5: 30,
  M15: 60,
  H1: 240,
}

/**
 * Evaluate a single signal's outcome by comparing current price to signal-time price.
 * Creates an AiSignalOutcome record. Only evaluates signals that are:
 *   - Older than the hold period (so price has had time to move)
 *   - Have a direction (long/short — neutral signals are skipped)
 *   - Not already evaluated
 *
 * Returns the outcome record, or null if signal was skipped.
 */
export async function evaluateSignalOutcome(signalId: string): Promise<{
  evaluated: boolean
  correct: boolean | null
  pipsMoved: number
  reason?: string
} | null> {
  const signal = await db.select().from(aiSignals).where(eq(aiSignals.id, signalId)).limit(1).then(r => r[0] ?? null)
  if (!signal) return null

  // Skip neutral/wait signals — no directional prediction to validate
  if (signal.direction === 'neutral' || signal.action === 'wait') {
    return { evaluated: false, correct: null, pipsMoved: 0, reason: 'neutral signal — no prediction to validate' }
  }

  // Check if already evaluated
  const existing = await db.select().from(aiSignalOutcomes).where(eq(aiSignalOutcomes.signalId, signalId)).limit(1).then(r => r[0] ?? null)
  if (existing && existing.correct !== null) {
    return {
      evaluated: true,
      correct: existing.correct,
      pipsMoved: existing.pipsMoved,
      reason: 'already evaluated',
    }
  }

  // Check if enough time has passed (hold period)
  const holdMin = TF_HOLD_MINUTES[signal.timeframe] ?? 30
  const signalAge = (Date.now() - signal.createdAt.getTime()) / 60000
  if (signalAge < holdMin) {
    return {
      evaluated: false,
      correct: null,
      pipsMoved: 0,
      reason: `only ${signalAge.toFixed(0)} min old (need ${holdMin} min)`,
    }
  }

  // Get price at signal time + current price
  const signalTime = signal.createdAt.getTime()
  const priceAtSignal = signal.priceAtSignal ?? priceAt(signal.symbol, signalTime)
  const { bid, ask } = bidAsk(signal.symbol)
  const currentPrice = signal.direction === 'long' ? bid : ask // exit price

  const base = SYMBOL_BASE[signal.symbol]
  const priceChange = currentPrice - priceAtSignal
  const priceChangePct = (priceChange / priceAtSignal) * 100
  const pipsMoved = priceChange / base.pip

  // Determine if the signal was correct:
  // - "long" signal is correct if price went up (pipsMoved > 0)
  // - "short" signal is correct if price went down (pipsMoved < 0)
  // We use a small threshold (1 pip) to avoid counting noise as correct
  const PIP_THRESHOLD = 1
  let correct: boolean
  if (signal.direction === 'long') {
    correct = pipsMoved > PIP_THRESHOLD
  } else {
    correct = pipsMoved < -PIP_THRESHOLD
  }

  // Create or update the outcome record (MySQL onDuplicateKeyUpdate)
  await db.insert(aiSignalOutcomes).values({
    signalId,
    symbol: signal.symbol,
    direction: signal.direction,
    action: signal.action,
    confidence: signal.confidence,
    priceAtSignal,
    priceAtEval: currentPrice,
    priceChange: Number(priceChange.toFixed(base.digits + 2)),
    priceChangePct: Number(priceChangePct.toFixed(4)),
    pipsMoved: Number(pipsMoved.toFixed(1)),
    correct,
    evaluatedAt: new Date(),
  }).onDuplicateKeyUpdate({
    set: {
      priceAtEval: currentPrice,
      priceChange: Number(priceChange.toFixed(base.digits + 2)),
      priceChangePct: Number(priceChangePct.toFixed(4)),
      pipsMoved: Number(pipsMoved.toFixed(1)),
      correct,
      evaluatedAt: new Date(),
    },
  })

  await logInfo('ai', `Signal evaluated: ${signal.symbol} ${signal.direction} → ${correct ? 'CORRECT' : 'WRONG'} (${pipsMoved > 0 ? '+' : ''}${pipsMoved.toFixed(1)} pips)`, {
    signalId,
    confidence: signal.confidence,
    priceAtSignal,
    currentPrice,
  })

  return { evaluated: true, correct, pipsMoved }
}

/**
 * Compute REAL accuracy for a symbol based on evaluated signal outcomes.
 * Accuracy = (correct signals / total evaluated signals) × 100
 *
 * Looks at the last N signals (default 50) that have been evaluated.
 * Returns 0 if no evaluated signals exist yet.
 */
export async function computeRealAccuracy(symbol: string, lookback = 50): Promise<{
  accuracy: number
  totalEvaluated: number
  correctCount: number
  wrongCount: number
  avgPipsMoved: number
  lastEvaluatedAt: Date | null
}> {
  const outcomes = await db.select().from(aiSignalOutcomes).where(
    and(
      eq(aiSignalOutcomes.symbol, symbol),
      isNotNull(aiSignalOutcomes.correct),
      isNotNull(aiSignalOutcomes.evaluatedAt),
    ),
  ).orderBy(desc(aiSignalOutcomes.evaluatedAt)).limit(lookback)

  if (outcomes.length === 0) {
    return {
      accuracy: 0,
      totalEvaluated: 0,
      correctCount: 0,
      wrongCount: 0,
      avgPipsMoved: 0,
      lastEvaluatedAt: null,
    }
  }

  const correctCount = outcomes.filter((o) => o.correct === true).length
  const wrongCount = outcomes.filter((o) => o.correct === false).length
  const accuracy = (correctCount / outcomes.length) * 100
  const avgPipsMoved = outcomes.reduce((s, o) => s + o.pipsMoved, 0) / outcomes.length

  return {
    accuracy: Number(accuracy.toFixed(1)),
    totalEvaluated: outcomes.length,
    correctCount,
    wrongCount,
    avgPipsMoved: Number(avgPipsMoved.toFixed(1)),
    lastEvaluatedAt: outcomes[0].evaluatedAt,
  }
}

/**
 * Compute accuracy across ALL symbols (for dashboard summary).
 */
export async function computeOverallAccuracy(): Promise<{
  overall: {
    accuracy: number
    totalEvaluated: number
    correctCount: number
    wrongCount: number
    avgPipsMoved: number
  }
  bySymbol: Record<string, {
    accuracy: number
    totalEvaluated: number
    correctCount: number
    wrongCount: number
    avgPipsMoved: number
  }>
}> {
  const symbols = ['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']
  const bySymbol: any = {}
  let totalCorrect = 0
  let totalWrong = 0
  let totalPips = 0
  let totalEvaluated = 0

  for (const sym of symbols) {
    const stats = await computeRealAccuracy(sym, 100)
    bySymbol[sym] = stats
    totalCorrect += stats.correctCount
    totalWrong += stats.wrongCount
    totalPips += stats.avgPipsMoved * stats.totalEvaluated
    totalEvaluated += stats.totalEvaluated
  }

  return {
    overall: {
      accuracy: totalEvaluated > 0 ? Number(((totalCorrect / totalEvaluated) * 100).toFixed(1)) : 0,
      totalEvaluated,
      correctCount: totalCorrect,
      wrongCount: totalWrong,
      avgPipsMoved: totalEvaluated > 0 ? Number((totalPips / totalEvaluated).toFixed(1)) : 0,
    },
    bySymbol,
  }
}

/**
 * Confidence calibration — adjusts a signal's confidence based on historical
 * accuracy for that symbol. If the AI says 80% confidence but historical
 * accuracy is only 55%, we calibrate down to reflect reality.
 *
 * Uses a simple linear blend: calibratedConfidence = (rawConfidence × 0.5) + (historicalAccuracy × 0.5)
 * Once we have >20 evaluated signals, the calibration becomes more reliable.
 */
export async function calibrateConfidence(
  symbol: string,
  rawConfidence: number,
): Promise<{
  calibrated: number
  historicalAccuracy: number
  sampleSize: number
  adjusted: boolean
}> {
  const stats = await computeRealAccuracy(symbol, 50)

  // Need at least 10 evaluated signals before calibration kicks in
  if (stats.totalEvaluated < 10) {
    return {
      calibrated: rawConfidence,
      historicalAccuracy: 0,
      sampleSize: stats.totalEvaluated,
      adjusted: false,
    }
  }

  // Blend: 60% raw confidence + 40% historical accuracy
  // (We trust the LLM's reasoning, but anchor it to reality)
  const historicalWeight = Math.min(0.4, stats.totalEvaluated / 100 * 0.4)
  const rawWeight = 1 - historicalWeight
  const calibrated = Number((rawConfidence * rawWeight + stats.accuracy * historicalWeight).toFixed(1))

  return {
    calibrated,
    historicalAccuracy: stats.accuracy,
    sampleSize: stats.totalEvaluated,
    adjusted: calibrated !== rawConfidence,
  }
}

/**
 * Find all signals that are ready to be evaluated (older than hold period,
 * have a direction, not yet evaluated) and evaluate them.
 *
 * This is meant to be called by a background job periodically.
 */
export async function evaluatePendingSignals(): Promise<{
  evaluated: number
  correct: number
  wrong: number
  skipped: number
}> {
  // Find signals that:
  // 1. Have a direction (long/short)
  // 2. Don't have an outcome record yet (or have one with correct=null)
  // 3. Are older than 30 minutes (default M5 hold period)
  const cutoff = new Date(Date.now() - 30 * 60 * 1000)

  const pendingSignals = await db.select().from(aiSignals).where(
    and(
      inArray(aiSignals.direction, ['long', 'short']),
      lt(aiSignals.createdAt, cutoff),
      not(exists(
        db.select({ one: sql`1` }).from(aiSignalOutcomes).where(eq(aiSignalOutcomes.signalId, aiSignals.id)),
      )),
    ),
  ).limit(50) // process at most 50 at a time

  let evaluated = 0
  let correct = 0
  let wrong = 0
  let skipped = 0

  for (const signal of pendingSignals) {
    const result = await evaluateSignalOutcome(signal.id)
    if (result?.evaluated) {
      evaluated++
      if (result.correct === true) correct++
      else if (result.correct === false) wrong++
    } else {
      skipped++
    }
  }

  if (evaluated > 0) {
    await logInfo('ai', `Signal evaluation batch: ${evaluated} evaluated (${correct} correct, ${wrong} wrong, ${skipped} skipped)`)
  }

  return { evaluated, correct, wrong, skipped }
}

/**
 * Compute the REAL rolling accuracy to store on new signals.
 * This replaces the old Math.random() simulation.
 */
export async function getRealRollingAccuracy(symbol: string): Promise<number> {
  const stats = await computeRealAccuracy(symbol, 20)
  // If no evaluated signals yet, return a neutral 50% (not 0, which looks broken)
  return stats.totalEvaluated > 0 ? stats.accuracy : 50
}