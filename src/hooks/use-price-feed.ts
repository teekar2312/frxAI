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

interface FeedStore {
  connected: boolean
  tickers: Record<string, TickerState>
  systemStatus: { sessions: any[]; scalpingWindow: boolean; uptime?: number } | null
  lastEvent: { type: string; payload: any; ts: number } | null
  setConnected: (v: boolean) => void
  applyTick: (symbols: any[], ts: number) => void
  setSystemStatus: (s: any) => void
  setLastEvent: (e: { type: string; payload: any; ts: number }) => void
}

export const useFeed = create<FeedStore>((set, get) => ({
  connected: false,
  tickers: {},
  systemStatus: null,
  lastEvent: null,
  setConnected: (v) => set({ connected: v }),
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

let socket: Socket | null = null
let refCount = 0

export function usePriceFeed() {
  const wasConnected = useRef(false)
  useEffect(() => {
    refCount++
    if (!socket) {
      socket = io('/?XTransformPort=3003', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
        timeout: 10000,
      })

      socket.on('connect', () => {
        useFeed.getState().setConnected(true)
        // Only toast on reconnect (not initial connect)
        if (wasConnected.current) {
          toast.success('Live Feed tersambung kembali', {
            description: 'Koneksi websocket pulih — data harga real-time aktif.',
            duration: 4000,
          })
        }
        wasConnected.current = true
      })
      socket.on('disconnect', () => {
        useFeed.getState().setConnected(false)
        if (wasConnected.current) {
          toast.warning('Live Feed terputus', {
            description: 'Koneksi websocket hilang — mencoba menyambung ulang...',
            duration: 6000,
          })
        }
      })

      socket.on('welcome', (data: any) => {
        if (data?.symbols) useFeed.getState().applyTick(data.symbols, Date.now())
        useFeed.getState().setConnected(true)
      })

      socket.on('tick', (data: any) => {
        if (data?.symbols) useFeed.getState().applyTick(data.symbols, data.ts ?? Date.now())
      })

      socket.on('system-status', (data: any) => useFeed.getState().setSystemStatus(data))

      socket.on('trade', (data: any) => useFeed.getState().setLastEvent({ type: 'trade', payload: data, ts: Date.now() }))
      socket.on('ai-signal', (data: any) => useFeed.getState().setLastEvent({ type: 'ai-signal', payload: data, ts: Date.now() }))
      socket.on('news', (data: any) => useFeed.getState().setLastEvent({ type: 'news', payload: data, ts: Date.now() }))
    }

    return () => {
      refCount--
      if (refCount <= 0 && socket) {
        socket.disconnect()
        socket = null
        refCount = 0
        wasConnected.current = false
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
