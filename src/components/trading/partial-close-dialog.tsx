'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Scissors } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { fmtMoney, fmtPrice } from '@/lib/format'
import { useTicker } from '@/hooks/use-price-feed'
import { SYMBOL_BASE } from '@/lib/types'
import type { Trade, TradeSide } from '@/lib/types'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface PartialCloseDialogProps {
  trade: Trade | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (percent: number) => void
  isPending: boolean
}

/* ------------------------------------------------------------------ */
/*  Quick-select presets                                               */
/* ------------------------------------------------------------------ */

const QUICK_SELECT: readonly number[] = [25, 50, 75, 100] as const

/* ------------------------------------------------------------------ */
/*  Client-side P&L math (mirror trading-panel.tsx computeLivePnl)     */
/* ------------------------------------------------------------------ */

function valuePerPipPerLot(symbol: string, refPrice: number): number {
  const base = SYMBOL_BASE[symbol]
  if (!base) return 0
  if (symbol === 'USDJPY') return (100000 * base.pip) / refPrice
  if (symbol === 'XAUUSD') return 100 * base.pip
  return 100000 * base.pip
}

function computeLivePnl(
  symbol: string,
  side: TradeSide,
  lot: number,
  openPrice: number,
  currentPrice: number,
): { pips: number; pnl: number } {
  const base = SYMBOL_BASE[symbol]
  if (!base) return { pips: 0, pnl: 0 }
  const dir = side === 'buy' ? 1 : -1
  const diff = (currentPrice - openPrice) * dir
  const pips = diff / base.pip
  const vpp = lot * valuePerPipPerLot(symbol, currentPrice)
  return { pips, pnl: pips * vpp }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PartialCloseDialog({
  trade,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: PartialCloseDialogProps) {
  // Quick-select percent state (default 50%).
  // The parent remounts this component via `key` whenever a new trade is
  // selected for partial-close, so the default 50% selection is fresh each
  // time the dialog opens — no useEffect reset needed.
  const [percent, setPercent] = useState<number>(50)
  // Custom input text state ('' = not using custom)
  const [customText, setCustomText] = useState<string>('')

  // Subscribe to live ticker for current price & PnL. Always called with a
  // (possibly empty) symbol string so the hook order is stable.
  const ticker = useTicker(trade?.symbol ?? '')

  // No trade → render nothing. (Dialog won't be open in this case anyway.)
  if (!trade) return null

  const isBuy = trade.side === 'buy'
  const currentPrice = ticker?.price ?? trade.openPrice
  const { pips, pnl } = computeLivePnl(
    trade.symbol,
    trade.side,
    trade.lotSize,
    trade.openPrice,
    currentPrice,
  )

  // Derived values for live preview
  const lotToClose = Number(((trade.lotSize * percent) / 100).toFixed(2))
  const remainingLot = Number((trade.lotSize - lotToClose).toFixed(2))
  const estimatedPnl = Number(((pnl * percent) / 100).toFixed(2))
  const isValid = percent >= 1 && percent <= 100

  const handleQuickSelect = (v: number) => {
    setPercent(v)
    setCustomText('')
  }

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setCustomText(text)
    const parsed = Number(text)
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 100) {
      setPercent(parsed)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="space-y-4"
        >
          {/* Header */}
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-4 w-4 text-amber-400" />
              Partial Close — {trade.symbol} {trade.side.toUpperCase()}
            </DialogTitle>
            <DialogDescription>
              Tutup sebagian posisi ini. Sisa lot akan tetap aktif dengan harga entry yang sama.
            </DialogDescription>
          </DialogHeader>

          {/* Trade summary card */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Symbol</div>
              <div className="font-medium">{trade.symbol}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Side</div>
              <div>
                <Badge
                  variant="outline"
                  className={cn(
                    'px-1.5 py-0 text-[10px] uppercase',
                    isBuy
                      ? 'border-emerald-500/40 text-emerald-400'
                      : 'border-rose-500/40 text-rose-400',
                  )}
                >
                  {trade.side}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Lot Size</div>
              <div className="font-mono tabular-nums">{trade.lotSize.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current Price</div>
              <div
                className={cn(
                  'font-mono tabular-nums',
                  ticker
                    ? ticker.dir === 'up'
                      ? 'text-emerald-400'
                      : ticker.dir === 'down'
                        ? 'text-rose-400'
                        : ''
                    : '',
                )}
              >
                {fmtPrice(trade.symbol, currentPrice)}
              </div>
            </div>
            <div className="col-span-2 border-t border-border pt-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current P&amp;L</div>
              <div
                className={cn(
                  'font-mono tabular-nums font-semibold',
                  pnl >= 0 ? 'text-emerald-400' : 'text-rose-400',
                )}
              >
                {fmtMoney(pnl)}{' '}
                <span className="text-[10px] font-normal text-muted-foreground">
                  ({pips >= 0 ? '+' : ''}
                  {pips.toFixed(1)} pips)
                </span>
              </div>
            </div>
          </div>

          {/* Quick-select buttons */}
          <div>
            <Label className="text-xs mb-2 block">Persentase partial close</Label>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_SELECT.map((v) => {
                const selected = customText === '' && percent === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleQuickSelect(v)}
                    className={cn(
                      'h-9 rounded-md border text-sm font-semibold font-mono tabular-nums transition-colors',
                      selected
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/50 dark:text-emerald-300'
                        : 'bg-card border-border text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400',
                    )}
                  >
                    {v}%
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom percentage input */}
          <div>
            <Label htmlFor="partial-custom-percent" className="text-xs mb-1.5 block">
              Atau persentase custom (%)
            </Label>
            <Input
              id="partial-custom-percent"
              type="number"
              min={1}
              max={100}
              value={customText}
              onChange={handleCustomChange}
              placeholder="1-100"
              className="font-mono tabular-nums"
            />
          </div>

          {/* Live preview */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Akan ditutup</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-400">
                {lotToClose.toFixed(2)} lot ({percent}%)
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Sisa posisi</span>
              <span className="font-mono tabular-nums font-semibold">{remainingLot.toFixed(2)} lot</span>
            </div>
            <Separator className="my-1.5 bg-emerald-500/20" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Estimasi P&amp;L realisasi</span>
              <span
                className={cn(
                  'font-mono tabular-nums font-semibold',
                  estimatedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400',
                )}
              >
                {fmtMoney(estimatedPnl)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                Batal
              </Button>
            </DialogClose>
            <Button
              onClick={() => onConfirm(percent)}
              disabled={isPending || !isValid}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scissors className="h-4 w-4" />
              )}
              Konfirmasi Partial Close
            </Button>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}

export default PartialCloseDialog
