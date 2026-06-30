'use client'

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

const AUTO_TRADE_INTERVAL = 30000 // 30 seconds
const SLTP_CHECK_INTERVAL = 5000 // 5 seconds — check open trades for SL/TP hits
const EVENT_ALERT_INTERVAL = 60000 // 60 seconds — check for upcoming high-impact events

/**
 * Auto-pilot hook:
 * 1. Always polls /api/trades/check-sl-tp every 5s to auto-close trades that
 *    hit stop-loss or take-profit (and apply trailing stops). This runs
 *    regardless of autoTradingEnabled — it's risk management.
 * 2. Always polls /api/economic-calendar/check-alerts every 60s to send email
 *    alerts 15 minutes before high-impact economic events.
 * 3. When autoTradingEnabled is true, also polls /api/ai/auto-trade every 30s
 *    to automatically execute high-confidence AI signals.
 */
export function useAutoPilot() {
  const qc = useQueryClient()
  const sltpMounted = useRef(false)
  const tradeMounted = useRef(false)
  const eventMounted = useRef(false)

  // Fetch risk settings to check if auto-trading is enabled
  const { data: riskData } = useQuery({
    queryKey: ['risk', 'autopilot'],
    queryFn: () => api.risk(),
    refetchInterval: 10000,
  })

  const autoEnabled = String(riskData?.settings?.autoTradingEnabled ?? 'false') === 'true'

  // ── SL/TP monitor (always on) ──
  useEffect(() => {
    if (sltpMounted.current) return
    sltpMounted.current = true

    let active = false
    const tick = async () => {
      if (active) return
      active = true
      try {
        const res = await fetch('/api/trades/check-sl-tp', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data.closed && data.closed.length > 0) {
            for (const c of data.closed) {
              const emoji = c.reason === 'Take Profit' ? '🎯' : '🛑'
              toast(`${emoji} ${c.reason}: ${c.symbol}`, {
                description: `${c.side.toUpperCase()} ${c.pips > 0 ? '+' : ''}${c.pips} pips • P&L $${c.pnl.toFixed(2)}`,
              })
            }
            qc.invalidateQueries({ queryKey: ['dashboard'] })
            qc.invalidateQueries({ queryKey: ['trades'] })
            qc.invalidateQueries({ queryKey: ['risk-usage'] })
          }
        }
      } catch {
        // silent
      } finally {
        active = false
      }
    }

    const id = setInterval(tick, SLTP_CHECK_INTERVAL)
    return () => {
      clearInterval(id)
      sltpMounted.current = false
    }
  }, [qc])

  // ── Economic event alert monitor (always on) ──
  useEffect(() => {
    if (eventMounted.current) return
    eventMounted.current = true

    let active = false
    const tick = async () => {
      if (active) return
      active = true
      try {
        const res = await fetch('/api/economic-calendar/check-alerts', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data.alerted && data.alerted.length > 0) {
            for (const a of data.alerted) {
              toast.warning(`⚠️ Event Alert: ${a.title}`, {
                description: `${a.country} • ${a.minsUntil}m lagi • Pair: ${a.symbols}`,
              })
            }
            qc.invalidateQueries({ queryKey: ['notifications'] })
          }
        }
      } catch {
        // silent
      } finally {
        active = false
      }
    }

    const id = setInterval(tick, EVENT_ALERT_INTERVAL)
    return () => {
      clearInterval(id)
      eventMounted.current = false
    }
  }, [qc])

  // ── Auto-trade executor (only when enabled) ──
  useEffect(() => {
    if (!autoEnabled) return
    if (tradeMounted.current) return
    tradeMounted.current = true

    let active = false
    const tick = async () => {
      if (active) return
      active = true
      try {
        const res = await api.aiAutoTrade()
        if (res.enabled && res.executed.length > 0) {
          toast.success(`🤖 Auto-Pilot: ${res.executed.length} trade dieksekusi`, {
            description: res.executed.map((t: any) => `${t.side.toUpperCase()} ${t.lot} ${t.symbol}`).join(' • '),
          })
          qc.invalidateQueries({ queryKey: ['dashboard'] })
          qc.invalidateQueries({ queryKey: ['trades'] })
          qc.invalidateQueries({ queryKey: ['risk-usage'] })
        }
      } catch {
        // silent
      } finally {
        active = false
      }
    }

    const id = setInterval(tick, AUTO_TRADE_INTERVAL)
    return () => {
      clearInterval(id)
      tradeMounted.current = false
    }
  }, [autoEnabled, qc])

  return { autoEnabled }
}
