import 'server-only'
import { db, logs, notifications } from './db'

export async function logInfo(source: string, message: string, context?: any) {
  return db.insert(logs).values({ level: 'info', source, message, context: context ? JSON.stringify(context) : null })
}
export async function logWarn(source: string, message: string, context?: any) {
  return db.insert(logs).values({ level: 'warn', source, message, context: context ? JSON.stringify(context) : null })
}
export async function logError(source: string, message: string, stack?: string, context?: any) {
  return db.insert(logs).values({ level: 'error', source, message, stack: stack ?? null, context: context ? JSON.stringify(context) : null })
}

export async function sendNotification(
  type: 'trade_open' | 'trade_close' | 'alert' | 'risk' | 'system' | 'news',
  subject: string,
  body: string,
  recipient: string,
) {
  const n = await db.insert(notifications).values({ type, subject, body, recipient, sent: true, sentAt: new Date() }).returning().then(r => r[0])
  await db.insert(logs).values({ level: 'info', source: 'system', message: `Email sent → ${recipient}: ${subject}` })
  return n
}