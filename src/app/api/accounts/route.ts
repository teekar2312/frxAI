import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logInfo } from '@/lib/logger'
import { accountCreateSchema, validateBody } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const accounts = await db.account.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ accounts })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validated = validateBody(accountCreateSchema, body)
    if (!validated.success) {
      return NextResponse.json(validated.error, { status: validated.error.status })
    }
    const { name, broker, server, login, accountType, currency, leverage, balance, isDefault } = validated.data

    // If default, unset others first
    if (isDefault) {
      await db.account.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
    }

    const initialBalance = Number(balance ?? 10000)
    const account = await db.account.create({
      data: {
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
      },
    })

    await logInfo('api', `Account created: ${account.name} (${account.login})`, {
      accountId: account.id,
    })

    return NextResponse.json({ account })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
