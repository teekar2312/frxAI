import { NextRequest, NextResponse } from 'next/server'
import { connectMT5, disconnectMT5 } from '@/lib/mt5-client'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { apiCatch } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mt5/connect
 * Body: { login: number, server: string, password: string, accountId?: string }
 *
 * Connects the MT5 bridge to the broker with the given credentials.
 * If accountId is provided, stores the MT5 login + server on the Account record
 * so subsequent operations know which bridge session to use.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { login, server, password, accountId } = body || {}

    if (!login || !server || !password) {
      return NextResponse.json(
        { error: 'login, server, password are required' },
        { status: 400 },
      )
    }

    const account = await connectMT5({ login: Number(login), server, password })

    // Persist MT5 login + server on the Account record (if provided)
    if (accountId) {
      await db.account.update({
        where: { id: accountId },
        data: {
          login: String(login),
          server,
          // Mark as connected + sync balance from MT5
          connected: true,
          balance: account.balance,
          equity: account.equity,
          freeMargin: account.freeMargin,
          margin: account.margin,
          marginLevel: account.marginLevel,
          leverage: account.leverage.toString().replace(/^1:/, ''),
        },
      })
    }

    await logInfo('mt5', `MT5 connected: login=${login} server=${server} balance=${account.balance}`, {
      accountId,
      mt5Login: login,
    })

    return NextResponse.json({ account })
  } catch (e) {
    return apiCatch(e, 'mt5', 'POST', req)
  }
}

/**
 * DELETE /api/mt5/connect?login=12345678
 * Disconnects the MT5 bridge session for the given login.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const login = Number(searchParams.get('login'))
    if (!login) {
      return NextResponse.json({ error: 'login query param is required' }, { status: 400 })
    }
    await disconnectMT5(login)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiCatch(e, 'mt5', 'DELETE', req)
  }
}