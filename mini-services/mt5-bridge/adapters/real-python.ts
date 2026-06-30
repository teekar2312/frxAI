// RealPythonMT5Adapter — calls a Python subprocess that runs the MetaTrader5 package.
// This is the PRODUCTION adapter. It requires:
//   1. A Windows machine with MetaTrader 5 terminal installed + logged in
//   2. Python 3.10+ with `MetaTrader5` and `flask` packages installed
//   3. The Python bridge script (./python/mt5_bridge.py) running as an HTTP service
//
// The Next.js app never touches Python directly — this adapter talks to the Python
// bridge via HTTP, which keeps the stack clean (Node.js + Python separated).
//
// DEPLOYMENT:
//   1. Copy `python/mt5_bridge.py` to your Windows MT5 machine
//   2. Install: `pip install MetaTrader5 flask flask-cors`
//   3. Run: `python mt5_bridge.py --port 5050`
//   4. Set env var on the bridge service: MT5_PYTHON_BRIDGE_URL=http://WINDOWS_IP:5050
//   5. Set env var on the bridge service: MT5_ADAPTER=real-python
//   6. Restart the mt5-bridge service

import type {
  MT5Adapter, MT5AccountInfo, MT5Tick, MT5Bar, MT5Position,
  MT5OrderResult, MT5ConnectParams, Timeframe,
} from './types'

const BRIDGE_URL = process.env.MT5_PYTHON_BRIDGE_URL || 'http://localhost:5050'
const REQUEST_TIMEOUT_MS = 8000

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function call<T>(path: string, method: string = 'GET', body?: any): Promise<T> {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) init.body = JSON.stringify(body)
  const res = await fetchWithTimeout(`${BRIDGE_URL}${path}`, init)
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Python bridge ${method} ${path} → ${res.status}: ${txt}`)
  }
  return res.json() as Promise<T>
}

export class RealPythonMT5Adapter implements MT5Adapter {
  readonly name = 'real-python'
  readonly isLive = true

  async init(): Promise<void> {
    try {
      const health = await call<{ status: string; mt5_installed: boolean }>('/health')
      console.log(`[RealPythonMT5Adapter] connected to Python bridge at ${BRIDGE_URL} — mt5_installed=${health.mt5_installed}`)
    } catch (e) {
      console.error(`[RealPythonMT5Adapter] FAILED to reach Python bridge at ${BRIDGE_URL}:`, (e as Error).message)
      console.error('  Make sure mt5_bridge.py is running. See mini-services/mt5-bridge/python/README.md')
      throw e
    }
  }

  async connect(params: MT5ConnectParams): Promise<MT5AccountInfo> {
    return call<MT5AccountInfo>('/connect', 'POST', params)
  }

  async disconnect(login: number): Promise<void> {
    await call(`/disconnect/${login}`, 'POST')
  }

  async accountInfo(login: number): Promise<MT5AccountInfo | null> {
    return call<MT5AccountInfo | null>(`/account/${login}`)
  }

  async tick(symbol: string): Promise<MT5Tick | null> {
    return call<MT5Tick | null>(`/tick/${symbol}`)
  }

  async bars(symbol: string, timeframe: Timeframe, count: number): Promise<MT5Bar[]> {
    return call<MT5Bar[]>(`/bars/${symbol}?tf=${timeframe}&count=${count}`)
  }

  async positions(login: number): Promise<MT5Position[]> {
    return call<MT5Position[]>(`/positions/${login}`)
  }

  async marketOrder(params: {
    login: number; symbol: string; side: 'buy' | 'sell'; volume: number;
    sl?: number | null; tp?: number | null; comment?: string
  }): Promise<MT5OrderResult> {
    return call<MT5OrderResult>('/order/market', 'POST', params)
  }

  async closePosition(ticket: number): Promise<{ ticket: number; price: number; profit: number; retcode: number }> {
    return call(`/position/${ticket}/close`, 'POST')
  }

  async modifyPosition(ticket: number, sl: number | null, tp: number | null): Promise<{ ticket: number; sl: number | null; tp: number | null; retcode: number }> {
    return call(`/position/${ticket}/modify`, 'POST', { sl, tp })
  }

  async shutdown(): Promise<void> {
    console.log('[RealPythonMT5Adapter] shutdown')
  }
}
