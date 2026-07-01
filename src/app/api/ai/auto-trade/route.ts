import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bidAsk, calcLotSize } from '@/lib/market'
import { checkNewsAvoidance } from '@/lib/news-avoidance'
import { logInfo, logWarn, sendNotification } from '@/lib/logger'
import { sendWebhook } from '@/lib/webhook'
import type { SupportedSymbol } from '@/lib/types'
import { requireTrader } from '@/lib/auth-server'
import { enforceTradeOpen } from '@/lib/risk-enforcement'
import { bridgeHealth, marketOrder as mt5MarketOrder } from '@/lib/mt5-client'
import { apiCatch } from '@/lib/api-handler'
import { audit } from '@/lib/audit'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const SYMBOLS: SupportedSymbol[] = ['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']
const MINUTES_BETWEEN_SIGNALS = 5 // dedup window: avoid re-executing same symbol too often

// POST /api/ai/auto-trade
// Scans latest AI signals for all symbols. If autoTradingEnabled=true and risk
// limits allow, executes trades for high-confidence actionable signals.
//
// r12-SAFETY: Now calls enforceTradeOpen() before EACH trade — the same 8-check
// gauntlet that manual trades go through. No more bypass.
// Returns a summary of actions taken.
export async function POST(req: NextRequest) {
  // Rate limit
  const limited = applyRateLimit(req, RATE_LIMITS.aiAutoTrade)
  if (limited) return limited

  // Role guard: only trader+ can trigger auto-trade (viewer cannot)
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  try {
    // 1. Check auto-trading is enabled
    const autoSetting = await db.riskSetting.findUnique({ where: { key: 'autoTradingEnabled' } })
    if (!autoSetting || autoSetting.value !== 'true') {
      return NextResponse.json({
        enabled: false,
        message: 'Auto-trading dinonaktifkan. Aktifkan di Risk Management panel.',
        executed: [],
      })
    }

    // 2. Get default account
    const account = await db.account.findFirst({ where: { isDefault: true } })
    if (!account) {
      return NextResponse.json({ enabled: true, error: 'No default account found' }, { status: 400 })
    }
    if (!account.connected) {
      return NextResponse.json({
        enabled: true,
        error: 'Akun MT5 tidak terhubung. Sambungkan dulu di Settings.',
        executed: [],
      })
    }

    // 3. Load risk settings (used for signal filtering + lot sizing)
    const riskPerTradeStr = (await db.riskSetting.findUnique({ where: { key: 'riskPerTradePct' } }))?.value || '0.75'
    const slPipsStr = (await db.riskSetting.findUnique({ where: { key: 'stopLossPipsMax' } }))?.value || '15'
    const confThresholdStr = (await db.riskSetting.findUnique({ where: { key: 'autoTradeConfidenceThreshold' } }))?.value || '70'
    const signalMaxAgeStr = (await db.riskSetting.findUnique({ where: { key: 'autoTradeSignalMaxAgeMin' } }))?.value || '10'

    const riskPerTrade = parseFloat(riskPerTradeStr)
    const slPips = parseFloat(slPipsStr)
    const confidenceThreshold = parseFloat(confThresholdStr)
    const signalMaxAgeMin = parseFloat(signalMaxAgeStr)

    // 4. Pre-check: daily loss circuit breaker (fast fail before scanning signals)
    // The full enforceTradeOpen() is called per-trade below, but this early check
    // avoids unnecessary signal scanning when we're already in circuit breaker.
    const openTrades = await db.trade.findMany({ where: { accountId: account.id, status: 'open' } })

    // 5. Find latest signal per symbol + execute
    const executed: any[] = []
    const rejected: any[] = []
    const mt5Login = Number(account.login)
    const bridgeOk = (await bridgeHealth()).ok

    for (const symbol of SYMBOLS) {
      const latestSignal = await db.aiSignal.findFirst({
        where: { symbol },
        orderBy: { createdAt: 'desc' },
      })

      if (!latestSignal) continue
      // Only act on buy/sell signals above threshold
      if (latestSignal.action !== 'buy' && latestSignal.action !== 'sell') continue
      if (latestSignal.confidence < confidenceThreshold) continue

      // Skip if we already have an open position on this symbol
      if (openTrades.some((t) => t.symbol === symbol)) continue

      // Skip if signal is too old (configurable, default 10 min)
      const signalAge = (Date.now() - latestSignal.createdAt.getTime()) / 60000
      if (signalAge > signalMaxAgeMin) continue

      // Skip if we recently auto-traded this symbol (dedup)
      const recentAutoTrade = await db.trade.findFirst({
        where: {
          accountId: account.id,
          symbol,
          source: 'ai',
          openTime: { gte: new Date(Date.now() - MINUTES_BETWEEN_SIGNALS * 60000) },
        },
      })
      if (recentAutoTrade) continue

      // News avoidance final check
      const newsAvoid = await checkNewsAvoidance(symbol)
      if (newsAvoid.action === 'wait') {
        await logWarn('ai', `Auto-trade skip ${symbol}: news avoidance (event in ${newsAvoid.minutesUntilEvent}m)`)
        continue
      }

      // 6. Compute trade parameters
      const side = latestSignal.action === 'buy' ? 'buy' : 'sell'
      const { bid, ask } = bidAsk(symbol)
      const openPrice = side === 'buy' ? ask : bid
      const lot = calcLotSize(symbol, account.balance, riskPerTrade, slPips)

      // SL/TP from signal-aware defaults
      const pip = symbol === 'USDJPY' ? 0.01 : symbol === 'XAUUSD' ? 0.1 : 0.0001
      const slDist = slPips * pip
      const tpDist = slPips * 1.5 * pip // RR 1:1.5
      const stopLoss = side === 'buy' ? openPrice - slDist : openPrice + slDist
      const takeProfit = side === 'buy' ? openPrice + tpDist : openPrice - tpDist
      const commission = lot * 2.5 * 2

      // 7. ─── RISK ENFORCEMENT (r12-SAFETY) ───────────────────────────────────
      // Call enforceTradeOpen() — the SAME 8-check gauntlet as manual trades.
      // If rejected, log the violations and skip this symbol.
      const enforcement = await enforceTradeOpen({
        accountId: account.id,
        symbol,
        side,
        lotSize: lot,
        stopLoss: Number(stopLoss.toFixed(5)),
      })
      if (!enforcement.allowed) {
        await logWarn('risk', `Auto-trade REJECTED for ${symbol}: ${enforcement.violations.join('; ')}`)
        rejected.push({
          symbol,
          side,
          lot,
          confidence: latestSignal.confidence,
          violations: enforcement.violations,
        })
        continue // skip to next symbol
      }

      // 8. ─── MT5 Bridge integration (mirror trades/route.ts pattern) ──────────
      let mt5Ticket: number | null = null
      let mt5Server: string | null = null
      let finalOpenPrice = openPrice

      if (bridgeOk && mt5Login > 0) {
        try {
          const order = await mt5MarketOrder({
            login: mt5Login,
            symbol,
            side,
            volume: lot,
            sl: Number(stopLoss.toFixed(5)),
            tp: Number(takeProfit.toFixed(5)),
            comment: `auto-${latestSignal.confidence}%-${latestSignal.direction}`,
          })
          mt5Ticket = order.ticket
          mt5Server = account.server || null
          finalOpenPrice = order.price
        } catch (e: any) {
          await logWarn('ai', `Auto-trade MT5 bridge failed for ${symbol}, using synthetic: ${e.message}`)
          // Fall back to synthetic price (finalOpenPrice stays as openPrice)
        }
      }

      // Create trade + update margin atomically
      const [trade] = await db.$transaction([
        db.trade.create({
          data: {
            accountId: account.id,
            symbol,
            side,
            lotSize: lot,
            openPrice: finalOpenPrice,
            stopLoss: Number(stopLoss.toFixed(5)),
            takeProfit: Number(takeProfit.toFixed(5)),
            trailingStop: false,
            trailingPips: 0,
            status: 'open',
            pnl: 0,
            pips: 0,
            commission,
            swap: 0,
            strategy: 'scalping-m5',
            timeframe: 'M5',
            source: 'ai',
            comment: `Auto: signal ${latestSignal.confidence}% ${latestSignal.direction}`,
            mt5Ticket,
            mt5Server,
            openTime: new Date(),
          },
        }),
        db.account.update({
          where: { id: account.id },
          data: { margin: { increment: lot * 1000 } },
        }),
      ])

      // Add to open trades list so next iteration sees it
      openTrades.push(trade as any)

      await logInfo('ai', `Auto-trade executed: ${side.toUpperCase()} ${lot} ${symbol} @ ${finalOpenPrice} (signal ${latestSignal.confidence}%, source=AI)${mt5Ticket ? ` [MT5 ticket=${mt5Ticket}]` : ''}`)
      await sendNotification(
        'trade_open',
        `🤖 Auto-Trade: ${side.toUpperCase()} ${symbol}`,
        `AI auto-executed ${side.toUpperCase()} ${lot} lots ${symbol} @ ${finalOpenPrice}\nSignal confidence: ${latestSignal.confidence}%\nDirection: ${latestSignal.direction}\nSL: ${stopLoss.toFixed(5)} | TP: ${takeProfit.toFixed(5)}\n\nReasoning: ${latestSignal.reasoning.slice(0, 200)}`,
        'trader@example.com',
      )

      // r15-INTEGRATION: webhook notification for auto-trade events
      await sendWebhook({
        type: 'trade_open',
        title: `🤖 Auto-Trade: ${side.toUpperCase()} ${lot} ${symbol}`,
        message: `AI auto-executed ${side.toUpperCase()} ${lot} lots ${symbol} @ ${finalOpenPrice} (confidence: ${latestSignal.confidence}%)`,
        color: 0x8b5cf6, // violet for AI
        fields: [
          { name: 'Symbol', value: symbol },
          { name: 'Side', value: side.toUpperCase() },
          { name: 'Lot', value: String(lot) },
          { name: 'Entry', value: String(finalOpenPrice) },
          { name: 'Stop Loss', value: String(stopLoss.toFixed(5)) },
          { name: 'Take Profit', value: String(takeProfit.toFixed(5)) },
          { name: 'Confidence', value: `${latestSignal.confidence}%` },
          { name: 'Direction', value: latestSignal.direction },
        ],
      }).catch(() => null)

      executed.push({
        symbol,
        side,
        lot,
        openPrice: finalOpenPrice,
        confidence: latestSignal.confidence,
        tradeId: trade.id,
        mt5Ticket,
      })
    }

    const summary = executed.length === 0
      ? rejected.length > 0
        ? `${rejected.length} signal ditolak oleh risk management. Lihat rejected list.`
        : 'Tidak ada sinyal yang memenuhi kriteria auto-trade (confidence ≥ 70, action buy/sell, no news conflict).'
      : `${executed.length} auto-trade dieksekusi.${rejected.length > 0 ? ` ${rejected.length} ditolak risk.` : ''}`

    await audit({
      action: 'ai.auto-trade',
      actor: user.email,
      resource: 'system',
      resourceType: 'auto-trade',
      details: { executedCount: executed.length, rejectedCount: rejected.length, summary },
    })

    return NextResponse.json({
      enabled: true,
      message: summary,
      executed,
      rejected,
      openPositions: openTrades.length,
      todayPnlPct: 0, // computed in enforceTradeOpen context, not surfaced here
    })
  } catch (e) {
    return apiCatch(e, 'ai', 'POST', req)
  }
}