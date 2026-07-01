import { NextRequest, NextResponse } from 'next/server'
import { db, accounts, asc, eq } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { accountCreateSchema, validateBody } from '@/lib/validations'
import { apiCatch } from '@/lib/api-handler'
import { applyRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { auditAccount } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const accountsList = await db.query.accounts.findMany({ orderBy: asc(accounts.createdAt) })
    return NextResponse.json({ accounts: accountsList })
  } catch (e) {
    return apiCatch(e, 'accounts', 'GET', req)
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (user instanceof NextResponse) return user

  const limited = applyRateLimit(req, RATE_LIMITS.accountCreate)
  if (limited) return limited

  try {
    const body = await req.json()
    const validated = validateBody(accountCreateSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }
    const { name, broker, server, login, accountType, currency, leverage, balance, isDefault } = validated.data

    // If default, unset others first
    if (isDefault) {
      await db.update(accounts).set({ isDefault: false }).where(eq(accounts.isDefault, true))
    }

    const initialBalance = Number(balance ?? 10000)
    const account = await db.insert(accounts).values({
      name: String(name),
      broker: broker ? String(broker) : 'FINEX Indonesia',
      server: server ? String(server) : '',
      login: String(login),
      accountType: accountType ? String(accountType) : 'demo',
      currency: currency ? String(currency) : 'USD',
      leverage: leverage ? String(leverage) : '1:100',
      balance: initialBalance,
      equity: initialBalance,
      margin: 0,
      freeMargin: initialBalance,
      marginLevel: 0,
      connected: false,
      isDefault: Boolean(isDefault ?? false),
    }).returning().then(r => r[0]!)

    await logInfo('api', `Account created: ${account.name} (${account.login})`, {
      accountId: account.id,
    })

    await auditAccount.create(account.id, {
      name: account.name,
      login: account.login,
      actor: 'system',
    })

    return NextResponse.json({ account })
  } catch (e) {
    return apiCatch(e, 'accounts', 'POST', req)
  }
}