import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { sendNotification } from '@/lib/logger'
import { sendWebhook } from '@/lib/webhook'
import { bidAsk } from '@/lib/market'
import { SYMBOL_BASE } from '@/lib/types'
import { bridgeHealth, marketOrder as mt5MarketOrder } from '@/lib/mt5-client'
import { requireTrader } from '@/lib/auth-server'
import { enforceTradeOpen } from '@/lib/risk-enforcement'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { tradeCreateSchema, validateBody } from '@/lib/validations'
import { apiCatch } from '@/lib/api-handler'
import { auditTrade } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const accountId = searchParams.get('accountId')
    const symbol = searchParams.get('symbol')
    const limit = Number(searchParams.get('limit') ?? 100)

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (accountId) where.accountId = accountId
    if (symbol) where.symbol = symbol

    const trades = await db.trade.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    })

    return NextResponse.json({ trades })
  } catch (e) {
    return apiCatch(e, 'trades', 'GET', req)
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 trade opens per minute per IP
  const limited = applyRateLimit(req, RATE_LIMITS.tradeOpen)
  if (limited) return limited

  // Role guard: only trader+ can open trades (viewer cannot)
  const user = await requireTrader()
  if (user instanceof NextResponse) return user

  try {
    const body = await req.json()
    const validated = validateBody(tradeCreateSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }
    const { accountId, symbol, side, lotSize, stopLoss, takeProfit, source, trailingStop, trailingPips, comment } = validated.data

    const account = await db.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // ─── Risk Enforcement ────────────────────────────────────────────────────
    // Server-side hard checks: max positions, lot size, daily loss, margin, etc.
    // Returns 422 with violation details if any check fails.
    const enforcement = await enforceTradeOpen({
      accountId,
      symbol,
      side,
      lotSize: Number(lotSize),
      stopLoss: stopLoss != null ? Number(stopLoss) : null,
    })
    if (!enforcement.allowed) {
      return NextResponse.json(
        {
          error: 'Trade rejected by risk management',
          violations: enforcement.violations,
          context: enforcement.context,
        },
        { status: 422 },
      )
    }

    const base = SYMBOL_BASE[symbol]

    // ─── MT5 Bridge integration ────────────────────────────────────────────────
    // Try to route the order through the MT5 bridge. If the bridge is online
    // and the account has an MT5 login, we send a real (or mock) market order
    // and store the returned ticket. If the bridge is offline, we fall back to
    // the local synthetic price and create a local-only trade (mt5Ticket = null).
    let openPrice: number
    let mt5Ticket: number | null = null
    let mt5Server: string | null = null
    let bridgeUsed = false

    const health = await bridgeHealth()
    const mt5Login = Number(account.login)

    if (health.ok && mt5Login > 0) {
      try {
        const order = await mt5MarketOrder({
          login: mt5Login,
          symbol,
          side,
          volume: Number(lotSize),
          sl: stopLoss != null ? Number(stopLoss) : null,
          tp: takeProfit != null ? Number(takeProfit) : null,
          comment: comment ? String(comment) : `finexfx-${source || 'manual'}`,
        })
        mt5Ticket = order.ticket
        mt5Server = account.server || null
        openPrice = order.price
        bridgeUsed = true
        await logInfo('mt5', `MT5 bridge order filled: ticket=${order.ticket} @ ${openPrice}`, {
          tradeId: 'pending',
          accountId,
          mt5Ticket,
        })
      } catch (e: any) {
        // Bridge order failed — fall back to local synthetic price.
        // Don't throw: we still create a local trade so the user sees their intent.
        await logInfo('mt5', `MT5 bridge order failed, falling back to synthetic: ${e.message}`, {
          accountId,
          symbol,
          side,
        })
        const { bid, ask } = bidAsk(symbol)
        openPrice = side === 'buy' ? ask : bid
      }
    } else {
      // Bridge offline or no MT5 login configured — use synthetic price.
      const { bid, ask } = bidAsk(symbol)
      openPrice = side === 'buy' ? ask : bid
    }

    // Default SL/TP if not provided: 10 pips SL, 15 pips TP (RR 1:1.5)
    const slPipsDefault = 10
    const tpPipsDefault = 15
    let sl = stopLoss != null ? Number(stopLoss) : null
    let tp = takeProfit != null ? Number(takeProfit) : null
    if (sl === null) {
      sl = side === 'buy' ? openPrice - slPipsDefault * base.pip : openPrice + slPipsDefault * base.pip
      sl = Number(sl.toFixed(base.digits))
    }
    if (tp === null) {
      tp = side === 'buy' ? openPrice + tpPipsDefault * base.pip : openPrice - tpPipsDefault * base.pip
      tp = Number(tp.toFixed(base.digits))
    }

    // If bridge order succeeded but didn't set SL/TP, modify the MT5 position now.
    if (bridgeUsed && mt5Ticket && (sl !== null || tp !== null)) {
      try {
        const { modifyPosition } = await import('@/lib/mt5-client')
        await modifyPosition(mt5Ticket, sl, tp)
      } catch (e: any) {
        await logInfo('mt5', `MT5 modify SL/TP failed (non-fatal): ${e.message}`, { mt5Ticket })
      }
    }

    const lot = Number(lotSize)
    // Round-turn commission: $2.5/lot x 2 sides
    const commission = Number((lot * 2.5 * 2).toFixed(2))

    // Create trade + update margin atomically
    const [trade] = await db.$transaction([
      db.trade.create({
        data: {
          accountId,
          symbol,
          side,
          lotSize: lot,
          openPrice,
          closePrice: null,
          stopLoss: sl,
          takeProfit: tp,
          trailingStop: Boolean(trailingStop ?? false),
          trailingPips: trailingPips != null ? Number(trailingPips) : 0,
          status: 'open',
          pnl: 0,
          pips: 0,
          commission,
          swap: 0,
          strategy: 'scalping-m5',
          timeframe: 'M5',
          source: source ? String(source) : 'manual',
          comment: comment ? String(comment) : null,
          mt5Ticket,
          mt5Server,
          openTime: new Date(),
          closeTime: null,
        },
      }),
      db.account.update({
        where: { id: accountId },
        data: { margin: { increment: lot * 1000 } },
      }),
    ])

    await logInfo(
      'mt5',
      `Trade opened ${side} ${lot} ${symbol} @ ${openPrice}${bridgeUsed ? ` [MT5 ticket=${mt5Ticket}]` : ' [synthetic]'}`,
      { tradeId: trade.id, accountId, sl, tp, commission, mt5Ticket },
    )

    await sendNotification(
      'trade_open',
      `Position opened: ${side.toUpperCase()} ${lot} ${symbol}`,
      `Trade #${trade.id} opened at ${openPrice} on ${account.name}. SL=${sl} TP=${tp} Commission=$${commission}.`,
      `trader@${account.broker.toLowerCase().replace(/\s+/g, '')}.com`,
    ).catch(() => null)

    // Webhook notification (Discord/Telegram/Slack)
    await sendWebhook({
      type: 'trade_open',
      title: `🟢 Position Opened: ${side.toUpperCase()} ${lot} ${symbol}`,
      message: `Trade opened at ${openPrice} on ${account.name}.`,
      fields: [
        { name: 'Symbol', value: symbol },
        { name: 'Side', value: side.toUpperCase() },
        { name: 'Lot', value: String(lot) },
        { name: 'Entry', value: String(openPrice) },
        { name: 'Stop Loss', value: String(sl) },
        { name: 'Take Profit', value: String(tp) },
      ],
    }).catch(() => null)

    await auditTrade.open(trade.id, { symbol: trade.symbol, side: trade.side, lotSize: trade.lotSize, openPrice: trade.openPrice, source: trade.source, actor: user.email })

    return NextResponse.json({ trade })
  } catch (e) {
    return apiCatch(e, 'trades', 'POST', req)
  }
}
