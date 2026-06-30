'use client'

import { useFeed } from '@/hooks/use-price-feed'
import { useClock, formatJakartaTime } from '@/lib/format'
import { SUPPORTED_SYMBOLS } from '@/lib/types'
import { ShieldCheck } from 'lucide-react'

export function AppFooter() {
  const tickers = useFeed((s) => s.tickers)
  const now = useClock()
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-border bg-card/40 backdrop-blur-sm">
      {/* Ticker tape */}
      <div className="overflow-x-auto scroll-thin border-b border-border/60">
        <div className="flex items-center gap-6 px-4 py-1.5 text-[11px] font-mono whitespace-nowrap">
          {SUPPORTED_SYMBOLS.map((sym) => {
            const t = tickers[sym]
            const dir = t?.dir
            return (
              <span key={sym} className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-semibold">{sym}</span>
                <span className={dir === 'up' ? 'text-bull' : dir === 'down' ? 'text-bear' : 'text-foreground'}>
                  {t ? t.price : '—'}
                </span>
                {t && (
                  <span className={t.changePct >= 0 ? 'text-bull' : 'text-bear'}>
                    {t.changePct >= 0 ? '▲' : '▼'}{Math.abs(t.changePct).toFixed(2)}%
                  </span>
                )}
              </span>
            )
          })}
          <span className="text-muted-foreground/50">•</span>
          <span className="text-muted-foreground">Spread Major from 0.0 pip • Comm $2.5/lot • FINEX Indonesia</span>
        </div>
      </div>
      {/* Footer body */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>© {year} FinexFX AI Trading System — Scalping M5 • {formatJakartaTime(now)} WIB</span>
        </div>
        <div className="flex items-center gap-3 font-mono">
          <span>Python 3.14</span>
          <span className="opacity-40">|</span>
          <span>MT5 Bridge</span>
          <span className="opacity-40">|</span>
          <span>Finnhub + MARKETAUX</span>
          <span className="opacity-40">|</span>
          <span className="text-emerald-500">Educational use — Akun demo</span>
        </div>
      </div>
    </footer>
  )
}
