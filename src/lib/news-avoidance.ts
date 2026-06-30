import 'server-only'
import { db } from './db'

export interface NewsAvoidanceResult {
  hasUpcomingHighImpact: boolean
  minutesUntilEvent: number | null
  eventTitle: string | null
  eventCategory: string | null
  action: 'proceed' | 'caution' | 'wait'
  confidencePenalty: number // 0..30, subtracted from confidence
  reason: string
}

/**
 * Checks for upcoming high-impact economic events affecting a symbol.
 * Returns news-avoidance guidance for the AI signal generator.
 *
 * Rules (scalping anti-news):
 * - High-impact event within 15 min → WAIT (avoid trading)
 * - High-impact event within 30 min → CAUTION (reduce confidence by 20)
 * - High-impact event within 60 min → reduce confidence by 10
 * - Medium-impact within 15 min → reduce confidence by 5
 */
export async function checkNewsAvoidance(symbol: string): Promise<NewsAvoidanceResult> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 60 * 60 * 1000) // next 60 min

  // Find upcoming events whose symbols include this pair
  const events = await db.economicEvent.findMany({
    where: {
      eventTime: { gte: now, lte: windowEnd },
      status: 'upcoming',
    },
    orderBy: { eventTime: 'asc' },
  })

  // Filter to events affecting this symbol
  const relevant = events.filter((e) => {
    if (!e.symbols) return false
    const syms = e.symbols.split(',').map((s) => s.trim())
    return syms.includes(symbol)
  })

  if (relevant.length === 0) {
    return {
      hasUpcomingHighImpact: false,
      minutesUntilEvent: null,
      eventTitle: null,
      eventCategory: null,
      action: 'proceed',
      confidencePenalty: 0,
      reason: 'No upcoming high-impact events in the next 60 minutes.',
    }
  }

  const next = relevant[0]
  const minsUntil = Math.round((next.eventTime.getTime() - now.getTime()) / 60000)

  let action: NewsAvoidanceResult['action'] = 'proceed'
  let penalty = 0
  let reason = ''

  if (next.impact === 'high') {
    if (minsUntil <= 15) {
      action = 'wait'
      penalty = 30
      reason = `High-impact event "${next.title}" in ${minsUntil}m — WAIT (anti-news rule: avoid 15m before high-impact).`
    } else if (minsUntil <= 30) {
      action = 'caution'
      penalty = 20
      reason = `High-impact event "${next.title}" in ${minsUntil}m — CAUTION (confidence reduced 20).`
    } else {
      action = 'caution'
      penalty = 10
      reason = `High-impact event "${next.title}" in ${minsUntil}m — minor confidence reduction (10).`
    }
  } else if (next.impact === 'medium' && minsUntil <= 15) {
    action = 'caution'
    penalty = 5
    reason = `Medium-impact event "${next.title}" in ${minsUntil}m — minor confidence reduction (5).`
  } else {
    reason = `Upcoming ${next.impact} event "${next.title}" in ${minsUntil}m — no penalty.`
  }

  return {
    hasUpcomingHighImpact: next.impact === 'high' && minsUntil <= 30,
    minutesUntilEvent: minsUntil,
    eventTitle: next.title,
    eventCategory: next.category,
    action,
    confidencePenalty: penalty,
    reason,
  }
}
