'use client'

import { create } from 'zustand'
import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import type { SymbolQuote } from '@/lib/types'

export interface TickerState {
  symbol: string
  price: number
  bid: number
  ask: number
  spread: number
  changePct: number
  spark: number[]
  updatedAt: number
  dir: 'up' | 'down' | 'flat'
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

interface FeedStore {
  connected: boolean
  connectionStatus: ConnectionStatus
  reconnectAttempt: number
  consecutiveDisconnects: number
  tickers: Record<string, TickerState>
  systemStatus: { sessions: any[]; scalpingWindow: boolean; uptime?: number } | null
  lastEvent: { type: string; payload: any; ts: number } | null
  setConnected: (v: boolean) => void
  setConnectionStatus: (s: ConnectionStatus) => void
  setReconnectAttempt: (n: number) => void
  incrementDisconnects: () => void
  resetDisconnects: () => void
  applyTick: (symbols: any[], ts: number) => void
  setSystemStatus: (s: any) => void
  setLastEvent: (e: { type: string; payload: any; ts: number }) => void
}

export const useFeed = create<FeedStore>((set, get) => ({
  connected: false,
  connectionStatus: 'disconnected' as ConnectionStatus,
  reconnectAttempt: 0,
  consecutiveDisconnects: 0,
  tickers: {},
  systemStatus: null,
  lastEvent: null,
  setConnected: (v) => set({ connected: v }),
  setConnectionStatus: (s) => set({ connectionStatus: s }),
  setReconnectAttempt: (n) => set({ reconnectAttempt: n }),
  incrementDisconnects: () =>
    set((state) => ({ consecutiveDisconnects: state.consecutiveDisconnects + 1 })),
  resetDisconnects: () => set({ consecutiveDisconnects: 0 }),
  applyTick: (symbols, ts) =>
    set((state) => {
      const next = { ...state.tickers }
      for (const s of symbols) {
        const prev = next[s.symbol]
        const dir: TickerState['dir'] = prev ? (s.price > prev.price ? 'up' : s.price < prev.price ? 'down' : 'flat') : 'flat'
        next[s.symbol] = {
          symbol: s.symbol,
          price: s.price,
          bid: s.bid,
          ask: s.ask,
          spread: s.spread,
          changePct: s.changePct,
          spark: s.spark ?? prev?.spark ?? [],
          updatedAt: ts,
          dir,
        }
      }
      return { tickers: next }
    }),
  setSystemStatus: (s) => set({ systemStatus: s }),
  setLastEvent: (e) => set({ lastEvent: e }),
}))

// ── Manual exponential backoff with jitter ──────────────────────────
const BASE_DELAY = 1000
const MAX_BACKOFF = 30000
const RECONNECT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const JITTER_FACTOR = 0.2 // ±20%

let socket: Socket | null = null
let refCount = 0
let reconnectAttempts = 0
let lastDisconnectTime = 0
let backoffTimer: ReturnType<typeof setTimeout> | null = null
let isActive = true // controls whether auto-reconnect should run

function jitteredDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_BACKOFF)
  const jitter = exponential * JITTER_FACTOR * (Math.random() * 2 - 1)
  return Math.max(BASE_DELAY, Math.round(exponential + jitter))
}

function clearBackoff() {
  if (backoffTimer) {
    clearTimeout(backoffTimer)
    backoffTimer = null
  }
}

function disposeSocket() {
  clearBackoff()
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

function createSocket() {
  const store = useFeed.getState()
  store.setConnectionStatus('connecting')
  store.setReconnectAttempt(reconnectAttempts)

  socket = io('/?XTransformPort=3003', {
    transports: ['websocket', 'polling'],
    reconnection: false, // we handle reconnection manually
    timeout: 10000,
  })

  socket.on('connect', () => {
    console.log('[price-feed] ✅ connected')
    reconnectAttempts = 0
    useFeed.getState().setReconnectAttempt(0)
    useFeed.getState().setConnectionStatus('connected')
    useFeed.getState().setConnected(true)
    useFeed.getState().resetDisconnects()
  })

  socket.on('disconnect', (reason) => {
    console.log('[price-feed] ⚠️ disconnected:', reason)
    lastDisconnectTime = Date.now()
    useFeed.getState().setConnected(false)
    useFeed.getState().incrementDisconnects()

    // Only auto-reconnect if the socket was ever connected and we're active
    if (reason !== 'io client disconnect' && isActive) {
      scheduleReconnect(false)
    } else {
      useFeed.getState().setConnectionStatus('disconnected')
    }
  })

  socket.on('connect_error', (err) => {
    console.warn('[price-feed] connect_error:', err.message)
    // scheduleReconnect handles the retry logic
  })

  socket.on('welcome', (data: any) => {
    if (data?.symbols) useFeed.getState().applyTick(data.symbols, Date.now())
    useFeed.getState().setConnected(true)
    useFeed.getState().setConnectionStatus('connected')
  })

  socket.on('tick', (data: any) => {
    if (data?.symbols) useFeed.getState().applyTick(data.symbols, data.ts ?? Date.now())
  })

  socket.on('system-status', (data: any) => useFeed.getState().setSystemStatus(data))

  socket.on('trade', (data: any) => useFeed.getState().setLastEvent({ type: 'trade', payload: data, ts: Date.now() }))
  socket.on('ai-signal', (data: any) => useFeed.getState().setLastEvent({ type: 'ai-signal', payload: data, ts: Date.now() }))
  socket.on('news', (data: any) => useFeed.getState().setLastEvent({ type: 'news', payload: data, ts: Date.now() }))
}

function scheduleReconnect(isManual: boolean) {
  clearBackoff()

  // Check if we've exceeded the 5-minute reconnection window
  const timeSinceDisconnect = Date.now() - lastDisconnectTime
  if (!isManual && lastDisconnectTime > 0 && timeSinceDisconnect > RECONNECT_WINDOW_MS) {
    console.log('[price-feed] ❌ reconnection window expired (5 min). Manual reconnect required.')
    useFeed.getState().setConnectionStatus('disconnected')
    useFeed.getState().setReconnectAttempt(reconnectAttempts)
    toast.error('Live Feed gagal tersambung', {
      description: 'Reconnect otomatis berhenti setelah 5 menit. Klik tombol "Reconnect" untuk mencoba lagi.',
      duration: 8000,
    })
    disposeSocket()
    return
  }

  const delay = isManual ? BASE_DELAY : jitteredDelay(reconnectAttempts)
  reconnectAttempts++

  console.log(
    `[price-feed] 🔄 reconnect attempt #${reconnectAttempts} in ${delay}ms` +
      (isManual ? ' (manual)' : ` (backoff, jittered from ~${BASE_DELAY * Math.pow(2, reconnectAttempts - 1)}ms)`),
  )

  useFeed.getState().setConnectionStatus('reconnecting')
  useFeed.getState().setReconnectAttempt(reconnectAttempts)

  // Toast on first reconnect attempt (not on every backoff tick)
  if (reconnectAttempts === 1 && !isManual) {
    toast.warning('Live Feed terputus', {
      description: 'Koneksi websocket hilang — mencoba menyambung ulang...',
      duration: 6000,
    })
  }

  backoffTimer = setTimeout(() => {
    disposeSocket()
    createSocket()
  }, delay)
}

/**
 * Manual reconnect — can be called by the user via a button.
 * Resets the reconnection window and starts fresh.
 */
export function reconnectFeed() {
  console.log('[price-feed] 🔁 manual reconnect triggered')
  clearBackoff()
  reconnectAttempts = 0
  lastDisconnectTime = 0
  isActive = true

  disposeSocket()
  createSocket()
}

export function usePriceFeed() {
  const wasConnected = useRef(false)

  useEffect(() => {
    refCount++
    isActive = true

    if (!socket) {
      createSocket()
    }

    // Track wasConnected for toasts
    const unsubStatus = useFeed.subscribe((state) => {
      if (state.connectionStatus === 'connected') {
        if (wasConnected.current) {
          toast.success('Live Feed tersambung kembali', {
            description: 'Koneksi websocket pulih — data harga real-time aktif.',
            duration: 4000,
          })
        }
        wasConnected.current = true
      }
    })

    return () => {
      unsubStatus()
      refCount--
      if (refCount <= 0) {
        isActive = false
        disposeSocket()
        reconnectAttempts = 0
        lastDisconnectTime = 0
        refCount = 0
        wasConnected.current = false
        useFeed.getState().setConnectionStatus('disconnected')
        useFeed.getState().setReconnectAttempt(0)
      }
    }
  }, [])
}

// Helper selectors
export function useTicker(symbol: string): TickerState | undefined {
  return useFeed((s) => s.tickers[symbol])
}

export function useAllTickers(): TickerState[] {
  return useFeed((s) => Object.values(s.tickers))
}