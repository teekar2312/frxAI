import 'server-only'
import { db, aiSignals, logs } from './db'
import type { AiSignal } from './types'
import { checkNewsAvoidance } from './news-avoidance'
import { priceAt } from './market'
import { getRealRollingAccuracy, calibrateConfidence } from './ai-evaluation'

/**
 * AI market analyst. Uses z-ai-web-dev-sdk LLM to synthesize a trading signal
 * for a symbol based on the 7 analysis dimensions required by the spec:
 * central bank policy, key economic data (NFP/CPI/PPI/GDP/unemployment/retail/PMI),
 * politics & geopolitics, fiscal policy, commodity prices, market sentiment, breaking news.
 *
 * Falls back to a rule-based heuristic if the LLM call fails.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SDK = () => require('z-ai-web-dev-sdk').default

interface AnalysisInput {
  symbol: string
  recentNews: { title: string; summary: string; category: string; sentiment: string; impact: string }[]
  enabledIndicators: string[]
  timeframe?: 'M1' | 'M5' | 'M15' | 'H1'
}

function factorsSchema() {
  return {
    central_bank: 'number -1..1 (hawkish USD = negative for EURUSD/GBPUSD, positive USDJPY; dovish = opposite)',
    economic_data: 'number -1..1 (strong US data = USD positive)',
    geopolitics: 'number -1..1 (risk-off = positive XAUUSD/USDJPY-safe)',
    fiscal: 'number -1..1',
    commodity: 'number -1..1 (gold up = positive XAUUSD)',
    sentiment: 'number -1..1 (risk-on = negative XAUUSD)',
    breaking: 'number -1..1 (immediate directional shock)',
  }
}

export async function analyzeSymbol(input: AnalysisInput): Promise<AiSignal> {
  const { symbol, recentNews, enabledIndicators } = input
  const timeframe = input.timeframe ?? 'M5'

  // Timeframe context: different timeframes have different volatility profiles
  // and typical hold durations. The LLM uses this to calibrate confidence and
  // select appropriate indicator periods.
  const tfContext: Record<string, { label: string; hold: string; volatility: string; indiPeriod: string }> = {
    M1: { label: 'M1 (1-minute)', hold: '30 sec – 5 min', volatility: 'very high noise, micro-trends', indiPeriod: 'EMA 5/13, RSI 7' },
    M5: { label: 'M5 (5-minute)', hold: '5 – 30 min', volatility: 'moderate, clean trends', indiPeriod: 'EMA 8/21, RSI 14' },
    M15: { label: 'M15 (15-minute)', hold: '30 min – 2 hours', volatility: 'lower noise, swing entries', indiPeriod: 'EMA 13/34, RSI 14' },
    H1: { label: 'H1 (1-hour)', hold: '2 – 8 hours', volatility: 'trend-following, macro-aligned', indiPeriod: 'EMA 21/55, RSI 14' },
  }
  const tf = tfContext[timeframe] ?? tfContext.M5

  const newsDigest = recentNews
    .slice(0, 12)
    .map((n) => `- [${n.category}/${n.impact}/${n.sentiment}] ${n.title}: ${n.summary}`)
    .join('\n')

  const prompt = `You are an elite FX/Gold AI analyst (model fx-scalper-v1) operating on ${tf.label} timeframe with FINEX Indonesia (spread major from 0.0 pip, commission $2.5/lot, leverage 1:100).

Timeframe context:
- Typical hold duration: ${tf.hold}
- Volatility profile: ${tf.volatility}
- Recommended indicator periods: ${tf.indiPeriod}

Analyze ${symbol} for a trade decision on ${timeframe}. Consider ALL 7 dimensions:
1. Central bank policy relevant to the pair
2. Key economic data (NFP, CPI, PPI, GDP, unemployment, retail sales, PMI)
3. Politics & geopolitics
4. Fiscal & economic policy
5. Commodity prices (gold for XAUUSD)
6. Market sentiment
7. Breaking news

Recent news feed:
${newsDigest || '(no recent news — use market regime inference)'}

Enabled technical indicator pool (auto-select the subset appropriate for ${timeframe}):
${enabledIndicators.join(', ')}

Respond ONLY with a compact JSON object (no markdown, no commentary):
{
  "direction": "long" | "short" | "neutral",
  "confidence": number 0..100,
  "action": "buy" | "sell" | "wait",
  "reasoning": "2-4 sentence confluence rationale referencing specific factors + indicators + ${timeframe} timeframe context",
  "selectedIndicators": ["...","..."],
  "factors": { ${Object.entries(factorsSchema())
    .map(([k, v]) => `"${k}": number`)
    .join(', ')} }
}`

  let parsed: any = null
  try {
    const ZAI = SDK()
    const zai = await ZAI.create()
    const res = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a precise quantitative FX analyst. Output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
    })
    const content = res.choices?.[0]?.message?.content ?? ''
    const match = content.match(/\{[\s\S]*\}/)
    if (match) parsed = JSON.parse(match[0])
  } catch (e) {
    // fall through to heuristic
  }

  if (!parsed) {
    parsed = heuristicAnalyze(symbol, recentNews, enabledIndicators)
  }

  // ── News avoidance: check upcoming high-impact economic events ──
  const newsAvoid = await checkNewsAvoidance(symbol)
  let finalConfidence = Number(parsed.confidence ?? 50)
  let finalAction = String(parsed.action ?? 'wait')
  let finalReasoning = String(parsed.reasoning ?? 'No reasoning.')

  if (newsAvoid.action === 'wait') {
    // Force wait — high-impact event too close
    finalAction = 'wait'
    finalConfidence = Math.max(20, finalConfidence - newsAvoid.confidencePenalty)
    finalReasoning = `${finalReasoning} ⚠️ NEWS AVOIDANCE: ${newsAvoid.reason}`
  } else if (newsAvoid.action === 'caution') {
    finalConfidence = Math.max(25, finalConfidence - newsAvoid.confidencePenalty)
    finalReasoning = `${finalReasoning} ⚠️ ${newsAvoid.reason}`
  }

  // ── Confidence calibration (r11-AI) ────────────────────────────────────────
  // Adjust confidence based on historical accuracy for this symbol.
  // If the AI says 80% but historical accuracy is 55%, calibrate down.
  const calibration = await calibrateConfidence(symbol, finalConfidence)
  if (calibration.adjusted) {
    finalConfidence = calibration.calibrated
    finalReasoning = `${finalReasoning} 📊 Confidence calibrated: ${calibration.historicalAccuracy.toFixed(0)}% historical accuracy (n=${calibration.sampleSize})`
  }

  // ── Real rolling accuracy (r11-AI) ─────────────────────────────────────────
  // Replaces the old Math.random() simulation with REAL computed accuracy
  // from evaluated signal outcomes.
  const realAccuracy = await getRealRollingAccuracy(symbol)

  // Capture price at signal time for later outcome evaluation
  const currentPriceAtSignal = priceAt(symbol, Date.now())

  const created = await db.insert(aiSignals).values({
    symbol,
    direction: parsed.direction ?? 'neutral',
    confidence: finalConfidence,
    timeframe,
    reasoning: finalReasoning,
    selectedIndicators: JSON.stringify(parsed.selectedIndicators ?? enabledIndicators.slice(0, 5)),
    factors: JSON.stringify(parsed.factors ?? {}),
    action: finalAction,
    modelVersion: `fx-scalper-v1-${timeframe.toLowerCase()}`,
    accuracy: realAccuracy,
    priceAtSignal: currentPriceAtSignal,
  }).returning().then(r => r[0])

  await db.insert(logs).values({
    level: newsAvoid.action === 'wait' ? 'warn' : 'info',
    source: 'ai',
    message: `AI signal generated: ${symbol} ${parsed.direction} @ ${finalConfidence}% (action: ${finalAction})${newsAvoid.hasUpcomingHighImpact ? ' [news-avoidance applied]' : ''}`,
    context: JSON.stringify({ factors: parsed.factors, newsAvoidance: { action: newsAvoid.action, penalty: newsAvoid.confidencePenalty, event: newsAvoid.eventTitle, minsUntil: newsAvoid.minutesUntilEvent } }),
  })

  return created as unknown as AiSignal
}

function heuristicAnalyze(
  symbol: string,
  news: { category: string; sentiment: string; impact: string }[],
  indicators: string[],
): any {
  let score = 0
  for (const n of news) {
    const w = n.impact === 'high' ? 0.4 : n.impact === 'medium' ? 0.2 : 0.1
    const s = n.sentiment === 'bullish' ? 1 : n.sentiment === 'bearish' ? -1 : 0
    // for USD-quoted pairs, bullish news tends to lift USD (bearish EURUSD/GBPUSD, bullish USDJPY)
    if (symbol === 'EURUSD' || symbol === 'GBPUSD') score -= s * w
    else if (symbol === 'USDJPY') score += s * w
    else if (symbol === 'XAUUSD') {
      // bullish risk = bearish gold; treat all bullish sentiment as risk-on → gold down
      score -= s * w * 0.5
      if (n.category === 'geopolitical') score += s * w * 1.5
    }
  }
  const direction = score > 0.15 ? 'long' : score < -0.15 ? 'short' : 'neutral'
  const confidence = Math.min(92, Math.round(50 + Math.abs(score) * 80))
  const action = direction === 'long' ? 'buy' : direction === 'short' ? 'sell' : 'wait'
  return {
    direction,
    confidence,
    action,
    reasoning: `Heuristic confluence (LLM unavailable): aggregated ${news.length} news items. Net factor score ${score.toFixed(2)} → ${direction}. Auto-selected ${indicators.slice(0, 5).join(', ')} for entry timing.`,
    selectedIndicators: indicators.slice(0, 5),
    factors: {
      central_bank: Number((score * 0.5).toFixed(2)),
      economic_data: Number((score * 0.3).toFixed(2)),
      geopolitics: Number((score * 0.2).toFixed(2)),
      fiscal: 0,
      commodity: symbol === 'XAUUSD' ? Number(score.toFixed(2)) : 0,
      sentiment: Number((-score * 0.4).toFixed(2)),
      breaking: 0,
    },
  }
}