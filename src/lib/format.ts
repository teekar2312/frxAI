'use client'

import { useState, useEffect } from 'react'

// Returns Jakarta time (Asia/Jakarta = UTC+7) updating every second.
export function useClock() {
  const [now, setNow] = useState<Date>(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export function formatJakartaTime(d: Date): string {
  // UTC+7
  const utc = d.getTime() + d.getTimezoneOffset() * 60000
  const jakarta = new Date(utc + 7 * 3600 * 1000)
  return jakarta.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

export function formatJakartaDate(d: Date): string {
  const utc = d.getTime() + d.getTimezoneOffset() * 60000
  const jakarta = new Date(utc + 7 * 3600 * 1000)
  return jakarta.toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatUtcTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

export function relativeTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}d lalu`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}j lalu`
  const day = Math.floor(hr / 24)
  return `${day}h lalu`
}

export function fmtMoney(n: number, currency = 'USD'): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtPrice(symbol: string, price: number): string {
  const digits = symbol === 'USDJPY' ? 3 : symbol === 'XAUUSD' ? 2 : 5
  return price.toFixed(digits)
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
