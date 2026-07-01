import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { evaluatePendingSignals, evaluateSignalOutcome } from '@/lib/ai-evaluation'
import { apiCatch } from '@/lib/api-handler'
import { audit } from '@/lib/audit'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { aiEvaluateSchema, validateBody } from '@/lib/validations'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ai/evaluate
 *
 * Evaluates pending AI signals — compares predicted direction with actual
 * price movement after the hold period. Creates AiSignalOutcome records.
 *
 * Body (optional): { signalId?: string }
 *   - If signalId provided: evaluates that specific signal
 *   - If no signalId: evaluates ALL pending signals (batch mode, max 50)
 *
 * Returns summary of evaluation results.
 */
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (user instanceof NextResponse) return user

  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.aiEvaluate)
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const parsed = validateBody(aiEvaluateSchema, body)
  if (!parsed.success) return NextResponse.json(parsed.error, { status: parsed.error.status })

  try {
    const signalId = parsed.data.signalId

    if (signalId) {
      // Evaluate single signal
      const result = await evaluateSignalOutcome(signalId)
      await audit({
        action: 'ai.evaluate',
        actor: user.email,
        resource: signalId,
        resourceType: 'ai-signal',
        details: { mode: 'single', result },
      })
      return NextResponse.json({
        signalId,
        result,
      })
    }

    // Batch evaluate all pending signals
    const result = await evaluatePendingSignals()
    await audit({
      action: 'ai.evaluate',
      actor: user.email,
      resource: 'batch',
      resourceType: 'ai-signal',
      details: { mode: 'batch', ...result },
    })
    return NextResponse.json({
      batch: true,
      ...result,
    })
  } catch (e) {
    return apiCatch(e, 'ai', 'POST', req)
  }
}