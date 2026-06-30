'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Wifi, WifiOff, ChevronDown, TrendingUp, TrendingDown, Bot, Hand,
  FlaskConical, ArrowUpRight, ArrowDownRight, X, Pencil, Crosshair,
  AlertTriangle, Loader2, History, Layers, Clock, Zap, Calculator,
  ShieldCheck, Anchor, Ban, RefreshCw, Inbox, Scissors,
  ShieldAlert, Power,
} from 'lucide-react'

import { api } from '@/lib/api'
import type { Account, Trade, PendingOrder, TradeSide, TradeSource } from '@/lib/types'
import { SUPPORTED_SYMBOLS, SYMBOL_BASE, SYMBOL_LABEL } from '@/lib/types'
import { useTicker, useFeed } from '@/hooks/use-price-feed'
import { useActiveAccount } from '@/hooks/use-active-account'
import { fmtMoney, fmtPrice, fmtPct, relativeTime } from '@/lib/format'
import { Sparkline } from '@/components/trading/sparkline'
import { PartialCloseDialog } from '@/components/trading/partial-close-dialog'
import { cn } from '@/lib/utils'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  ToggleGroup, ToggleGroupItem,
} from '@/components/ui/toggle-group'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'

/* ------------------------------------------------------------------ */
/*  Helpers (mirror lib/market.ts so client math matches backend)      */
/* ------------------------------------------------------------------ */

type Mode = 'manual' | 'auto' | 'demo'
type OrderType = 'market' | 'limit' | 'stop'

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

function calcLotFromRisk(
  symbol: string,
  balance: number,
  riskPct: number,
  slPips: number,
): number {
  const base = SYMBOL_BASE[symbol]
  if (!base || slPips <= 0) return 0.01
  const riskAmount = balance * (riskPct / 100)
  const vpp = valuePerPipPerLot(symbol, base.price)
  const lot = riskAmount / (slPips * vpp)
  return Number(Math.max(0.01, Math.floor(lot * 100) / 100).toFixed(2))
}

function levelsFor(
  symbol: string,
  side: TradeSide,
  entry: number,
  slPips: number,
  tpPips: number,
): { sl: number; tp: number } {
  const base = SYMBOL_BASE[symbol]
  if (!base) return { sl: 0, tp: 0 }
  const slDelta = slPips * base.pip
  const tpDelta = tpPips * base.pip
  if (side === 'buy') {
    return { sl: entry - slDelta, tp: entry + tpDelta }
  }
  return { sl: entry + slDelta, tp: entry - tpDelta }
}

function spreadPips(symbol: string, spread: number): number {
  const base = SYMBOL_BASE[symbol]
  if (!base) return 0
  return spread / base.pip
}

const SOURCE_BADGE: Record<TradeSource, { label: string; cls: string; icon: any }> = {
  manual: { label: 'Manual', cls: 'border-border bg-muted/50 text-muted-foreground', icon: Hand },
  auto: { label: 'Auto', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-400', icon: Zap },
  ai: { label: 'AI', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', icon: Bot },
}

/* ------------------------------------------------------------------ */
/*  Account selector bar                                               */
/* ------------------------------------------------------------------ */

function AccountBar({
  accounts, selectedId, onSelect, onToggleConnect,
}: {
  accounts: Account[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggleConnect: (id: string) => void
}) {
  const selected = accounts.find((a) => a.id === selectedId) ?? accounts[0]

  return (
    <Card className="gap-0 p-3 md:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Account dropdown */}
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-auto py-2 pl-2 pr-3 justify-start gap-2 min-w-[260px]">
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-md border',
                  selected?.accountType === 'live'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
                )}>
                  {selected?.accountType === 'live' ? <ShieldCheck className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold">{selected?.name ?? 'Pilih Akun'}</span>
                    <Badge variant="outline" className={cn(
                      'px-1.5 py-0 text-[10px] uppercase',
                      selected?.accountType === 'live'
                        ? 'border-rose-500/40 text-rose-400'
                        : 'border-emerald-500/40 text-emerald-400',
                    )}>
                      {selected?.accountType}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono tabular">
                    {selected ? `${selected.broker} • ${selected.login}` : '—'}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[300px]">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Pilih Akun Trading
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {accounts.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className="flex flex-col items-start gap-1 py-2"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-semibold">{a.name}</span>
                    <Badge variant="outline" className={cn(
                      'px-1.5 py-0 text-[10px] uppercase',
                      a.accountType === 'live'
                        ? 'border-rose-500/40 text-rose-400'
                        : 'border-emerald-500/40 text-emerald-400',
                    )}>
                      {a.accountType}
                    </Badge>
                  </div>
                  <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground font-mono tabular">
                    <span>{a.broker}</span>
                    <span>Balance {fmtMoney(a.balance)}</span>
                  </div>
                  <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground font-mono tabular">
                    <span className="flex items-center gap-1">
                      <span className={cn('h-1.5 w-1.5 rounded-full', a.connected ? 'bg-emerald-400 live-dot' : 'bg-muted-foreground/50')} />
                      {a.connected ? 'Terhubung' : 'Terputus'}
                    </span>
                    <span>Equity {fmtMoney(a.equity)}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick stats */}
          {selected && (
            <div className="hidden md:flex items-center gap-4 pl-2">
              <Stat label="Balance" value={fmtMoney(selected.balance)} />
              <Stat label="Equity" value={fmtMoney(selected.equity)} />
              <Stat label="Free Margin" value={fmtMoney(selected.freeMargin)} />
              <div className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', selected.connected ? 'bg-emerald-400 live-dot' : 'bg-rose-400')} />
                <span className={cn('text-xs font-medium', selected.connected ? 'text-emerald-400' : 'text-rose-400')}>
                  {selected.connected ? 'MT5 Connected' : 'MT5 Disconnected'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Connect / disconnect */}
        {selected && (
          <Button
            size="sm"
            variant={selected.connected ? 'destructive' : 'default'}
            onClick={() => onToggleConnect(selected.id)}
            disabled={!selected}
            className="gap-2"
          >
            {selected.connected ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
            {selected.connected ? 'Disconnect MT5' : 'Connect MT5'}
          </Button>
        )}
      </div>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-semibold tabular">{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Mode toggle                                                        */
/* ------------------------------------------------------------------ */

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const items: { v: Mode; label: string; icon: any; warn?: boolean }[] = [
    { v: 'manual', label: 'Manual', icon: Hand },
    { v: 'auto', label: 'Auto (AI)', icon: Bot, warn: true },
    { v: 'demo', label: 'Demo Only', icon: FlaskConical },
  ]
  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && onChange(v as Mode)}
        variant="outline"
        className="w-full"
      >
        {items.map((it) => {
          const Icon = it.icon
          const active = mode === it.v
          return (
            <ToggleGroupItem
              key={it.v}
              value={it.v}
              className={cn(
                'flex-1 gap-1.5 py-1.5 text-xs font-medium',
                active && it.v === 'auto' && 'border-amber-500/50 bg-amber-500/10 text-amber-400 data-[state=on]:bg-amber-500/15 data-[state=on]:text-amber-300',
                active && it.v === 'manual' && 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-300',
                active && it.v === 'demo' && 'border-border bg-muted text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {it.label}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      {mode === 'auto' && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>AI akan eksekusi otomatis sesuai sinyal. Pastikan risk settings sudah benar.</span>
        </div>
      )}
      {mode === 'demo' && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Mode demo aktif — tombol submit dinonaktifkan. Gunakan untuk simulasi.</span>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Price card (live tick flashing)                                    */
/* ------------------------------------------------------------------ */

function PriceCard({
  symbol, active, onClick,
}: {
  symbol: string
  active: boolean
  onClick: () => void
}) {
  const ticker = useTicker(symbol)

  const price = ticker?.price ?? 0
  const change = ticker?.changePct ?? 0
  const up = change >= 0
  // Flash overlay: keyed on updatedAt so it remounts each tick and replays the CSS animation.
  const flashKey = ticker?.updatedAt ?? 0
  const flashClass = ticker?.dir === 'up' ? 'tick-up' : ticker?.dir === 'down' ? 'tick-down' : ''

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative text-left rounded-lg border p-3 transition-all overflow-hidden',
        'hover:border-primary/50 hover:shadow-md',
        active ? 'border-primary/70 ring-1 ring-primary/30' : 'border-border',
      )}
    >
      {flashClass && (
        <span
          key={flashKey}
          aria-hidden
          className={cn('pointer-events-none absolute inset-0', flashClass)}
        />
      )}
      <div className="relative flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold">{SYMBOL_LABEL[symbol]}</span>
          {active && <Badge className="px-1.5 py-0 text-[9px] uppercase">Active</Badge>}
        </div>
        <span className={cn(
          'flex items-center gap-0.5 text-[11px] font-mono tabular',
          up ? 'text-bull' : 'text-bear',
        )}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {fmtPct(change)}
        </span>
      </div>
      <div className="relative flex items-end justify-between gap-2">
        <div className={cn(
          'text-xl font-mono font-bold tabular leading-none',
          up ? 'text-bull' : 'text-bear',
        )}>
          {price > 0 ? fmtPrice(symbol, price) : '—'}
        </div>
        {ticker?.spark && ticker.spark.length > 0 && (
          <Sparkline data={ticker.spark} height={32} width={70} />
        )}
      </div>
      <Separator className="my-2" />
      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono tabular">
        <div className="flex flex-col">
          <span className="text-muted-foreground">Bid</span>
          <span className="text-bull">{ticker ? fmtPrice(symbol, ticker.bid) : '—'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Ask</span>
          <span className="text-bear">{ticker ? fmtPrice(symbol, ticker.ask) : '—'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Spread</span>
          <span className={cn(
            symbol === 'XAUUSD' && ticker && spreadPips(symbol, ticker.spread) > 3 && 'text-warn',
            symbol !== 'XAUUSD' && ticker && spreadPips(symbol, ticker.spread) > 1 && 'text-warn',
            'text-foreground',
          )}>
            {ticker ? spreadPips(symbol, ticker.spread).toFixed(1) : '—'}p
          </span>
        </div>
      </div>
    </button>
  )
}

function PriceGrid({
  activeSymbol, onSelect,
}: {
  activeSymbol: string
  onSelect: (s: string) => void
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {SUPPORTED_SYMBOLS.map((s) => (
        <PriceCard
          key={s}
          symbol={s}
          active={activeSymbol === s}
          onClick={() => onSelect(s)}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Order ticket                                                       */
/* ------------------------------------------------------------------ */

function OrderTicket({
  symbol, setSymbol, selectedAccount, riskSettings,
}: {
  symbol: string
  setSymbol: (s: string) => void
  selectedAccount: Account | null
  riskSettings: Record<string, string>
}) {
  const qc = useQueryClient()
  const [side, setSide] = useState<TradeSide>('buy')
  const [lot, setLot] = useState(0.10)
  const [slPips, setSlPips] = useState(10)
  const [orderType, setOrderType] = useState<OrderType>('market')
  const [pendingPrice, setPendingPrice] = useState<number>(0)
  const [trailingStop, setTrailingStop] = useState(false)
  const [trailingPips, setTrailingPips] = useState(8)
  const ticker = useTicker(symbol)
  const connected = useFeed((s) => s.connected)

  const riskPct = Number(riskSettings.riskPerTradePct ?? 0.75)
  const rr = Number(riskSettings.riskRewardRatio ?? 1.5)
  const tpPips = Number((slPips * rr).toFixed(1))

  // Reset pending price when symbol changes (render-time prop-change pattern)
  const [prevSymbol, setPrevSymbol] = useState(symbol)
  if (symbol !== prevSymbol) {
    setPrevSymbol(symbol)
    setPendingPrice(0)
  }
  // Effective pending price: fall back to live ticker price when not set
  const effectivePendingPrice = pendingPrice || (ticker?.price ?? 0)

  const entry = useMemo(() => {
    if (orderType !== 'market') return effectivePendingPrice
    if (!ticker) return 0
    return side === 'buy' ? ticker.ask : ticker.bid
  }, [orderType, effectivePendingPrice, ticker, side])

  const { sl, tp } = useMemo(
    () => levelsFor(symbol, side, entry, slPips, tpPips),
    [symbol, side, entry, slPips, tpPips],
  )

  const balance = selectedAccount?.balance ?? 0
  const riskAmount = balance * (riskPct / 100)
  const vpp = lot * valuePerPipPerLot(symbol, entry || SYMBOL_BASE[symbol]?.price || 1)
  const potentialProfit = tpPips * vpp

  const openMutation = useMutation({
    mutationFn: (body: any) => api.openTrade(body),
    onSuccess: (res) => {
      toast.success(`Posisi ${res.trade.side.toUpperCase()} ${res.trade.symbol} dibuka`, {
        description: `${res.trade.lotSize} lot @ ${fmtPrice(res.trade.symbol, res.trade.openPrice)}`,
      })
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['risk-usage'] })
    },
    onError: (e: any) => toast.error('Gagal membuka posisi', { description: e.message }),
  })

  const orderMutation = useMutation({
    mutationFn: (body: any) => api.createOrder(body),
    onSuccess: (res) => {
      toast.success(`Order ${res.order.orderType.toUpperCase()} ${res.order.symbol} dibuat`, {
        description: `${res.order.lotSize} lot @ ${fmtPrice(res.order.symbol, res.order.price)}`,
      })
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: any) => toast.error('Gagal membuat order', { description: e.message }),
  })

  const onCalcLot = () => {
    if (!selectedAccount) return
    const newLot = calcLotFromRisk(symbol, balance, riskPct, slPips)
    setLot(newLot)
    toast.info('Lot dihitung dari risk%', {
      description: `Risk ${riskPct}% = ${fmtMoney(riskAmount)} → ${newLot} lot (SL ${slPips}p)`,
    })
  }

  const onSubmit = () => {
    if (!selectedAccount) {
      toast.error('Pilih akun trading terlebih dahulu')
      return
    }
    if (!selectedAccount.connected) {
      toast.error('Akun MT5 tidak terhubung. Sambungkan dulu.')
      return
    }
    if (entry <= 0) {
      toast.error('Harga entry tidak valid. Tunggu feed harga.')
      return
    }

    if (orderType === 'market') {
      openMutation.mutate({
        accountId: selectedAccount.id,
        symbol, side, lotSize: lot,
        stopLoss: sl, takeProfit: tp,
        source: 'manual',
        trailingStop, trailingPips: trailingStop ? trailingPips : 0,
      })
    } else {
      orderMutation.mutate({
        accountId: selectedAccount.id,
        symbol, side, orderType, lotSize: lot,
        price: pendingPrice,
        stopLoss: sl, takeProfit: tp,
      })
    }
  }

  const submitting = openMutation.isPending || orderMutation.isPending
  const lotPresets = [0.01, 0.05, 0.10, 0.50, 1.00]

  // spread warning
  const spreadWarn = ticker
    ? (symbol === 'XAUUSD' ? spreadPips(symbol, ticker.spread) > 3 : spreadPips(symbol, ticker.spread) > 1)
    : false

  return (
    <Card className="p-4 gap-4 lg:sticky lg:top-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">Order Ticket</h3>
        </div>
        <Badge variant="outline" className="font-mono tabular text-[10px]">
          {SYMBOL_LABEL[symbol]}
        </Badge>
      </div>

      {/* Symbol + Order type */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Symbol</Label>
          <Select value={symbol} onValueChange={(v) => { setSymbol(v); setPendingPrice(0) }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUPPORTED_SYMBOLS.map((s) => (
                <SelectItem key={s} value={s}>{SYMBOL_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">Order Type</Label>
          <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="market">Market</SelectItem>
              <SelectItem value="limit">Limit</SelectItem>
              <SelectItem value="stop">Stop</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Side toggle */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={side === 'buy' ? 'default' : 'outline'}
          onClick={() => setSide('buy')}
          className={cn(
            'h-11 text-sm font-semibold gap-2',
            side === 'buy'
              ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-500/90'
              : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10',
          )}
        >
          <TrendingUp className="h-4 w-4" /> BUY
        </Button>
        <Button
          variant={side === 'sell' ? 'default' : 'outline'}
          onClick={() => setSide('sell')}
          className={cn(
            'h-11 text-sm font-semibold gap-2',
            side === 'sell'
              ? 'bg-rose-500 text-rose-950 hover:bg-rose-500/90'
              : 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10',
          )}
        >
          <TrendingDown className="h-4 w-4" /> SELL
        </Button>
      </div>

      {/* Lot size */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">Lot Size</Label>
          <Button
            variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1 text-emerald-400"
            onClick={onCalcLot}
          >
            <Calculator className="h-3 w-3" /> Hitung Lot dari Risk%
          </Button>
        </div>
        <Input
          type="number" step="0.01" min="0.01" value={lot}
          onChange={(e) => setLot(Math.max(0.01, Number(e.target.value)))}
          className="font-mono tabular text-sm h-9"
        />
        <div className="grid grid-cols-5 gap-1">
          {lotPresets.map((p) => (
            <Button
              key={p} variant="outline" size="sm"
              className={cn(
                'h-7 px-0 text-[11px] font-mono tabular',
                lot === p && 'border-primary bg-primary/10 text-primary',
              )}
              onClick={() => setLot(p)}
            >
              {p.toFixed(2)}
            </Button>
          ))}
        </div>
      </div>

      {/* Stop loss with slider */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">Stop Loss (pips)</Label>
          <span className="text-xs font-mono tabular text-bear">{slPips}p</span>
        </div>
        <Slider
          value={[slPips]} min={5} max={15} step={1}
          onValueChange={(v) => setSlPips(v[0])}
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono tabular">
          <span>5p</span><span>10p</span><span>15p</span>
        </div>
      </div>

      {/* Take profit (auto from RR) */}
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground">Take Profit (RR {rr}:1)</span>
          <span className="text-xs font-mono tabular text-bull">{tpPips}p</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[11px] text-muted-foreground">SL / TP Price</span>
          <span className="text-xs font-mono tabular">
            <span className="text-bear">{sl > 0 ? fmtPrice(symbol, sl) : '—'}</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-bull">{tp > 0 ? fmtPrice(symbol, tp) : '—'}</span>
          </span>
        </div>
      </div>

      {/* Pending price (if limit/stop) */}
      {orderType !== 'market' && (
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-muted-foreground">
            {orderType === 'limit' ? 'Limit' : 'Stop'} Price
          </Label>
          <Input
            type="number" step="0.00001" value={pendingPrice}
            onChange={(e) => setPendingPrice(Number(e.target.value))}
            className="font-mono tabular text-sm h-9"
          />
        </div>
      )}

      {/* Trailing stop */}
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <Label htmlFor="trailing" className="text-xs">Trailing Stop</Label>
        <Switch id="trailing" checked={trailingStop} onCheckedChange={setTrailingStop} />
      </div>
      {trailingStop && (
        <div className="flex items-center justify-between gap-2 pl-1">
          <Label className="text-[11px] text-muted-foreground">Trail Pips</Label>
          <div className="flex items-center gap-2 flex-1 max-w-[180px]">
            <Slider
              value={[trailingPips]} min={5} max={20} step={1}
              onValueChange={(v) => setTrailingPips(v[0])}
            />
            <span className="text-xs font-mono tabular text-warn w-8 text-right">{trailingPips}p</span>
          </div>
        </div>
      )}

      {/* Risk preview */}
      <div className="rounded-md bg-muted/40 border border-border p-3 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Risk</span>
          <span className="font-mono tabular text-bear">
            {fmtMoney(riskAmount)} <span className="text-muted-foreground">({riskPct}% of balance)</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Potential Profit</span>
          <span className="font-mono tabular text-bull">
            {fmtMoney(potentialProfit)} <span className="text-muted-foreground">(RR 1:{rr})</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Entry</span>
          <span className="font-mono tabular">{entry > 0 ? fmtPrice(symbol, entry) : '—'}</span>
        </div>
      </div>

      {spreadWarn && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Spread melebar — pertimbangkan tunda eksekusi.</span>
        </div>
      )}

      {/* Submit */}
      <Button
        size="lg"
        disabled={submitting || !selectedAccount?.connected || !connected}
        onClick={onSubmit}
        className={cn(
          'w-full h-12 text-sm font-bold gap-2',
          side === 'buy'
            ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-500/90'
            : 'bg-rose-500 text-rose-950 hover:bg-rose-500/90',
        )}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {side.toUpperCase()} {SYMBOL_LABEL[symbol]} {lot.toFixed(2)} lots @ {orderType}
      </Button>

      {!selectedAccount?.connected && (
        <p className="text-[11px] text-center text-muted-foreground">
          Akun MT5 tidak terhubung. Sambungkan dulu untuk eksekusi.
        </p>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Risk / Reward visualization mini-chart                            */
/* ------------------------------------------------------------------ */

function RiskRewardChart({
  symbol, trade,
}: {
  symbol: string
  trade: Trade | undefined
}) {
  const ticker = useTicker(symbol)
  const current = ticker?.price ?? trade?.openPrice ?? 0

  // No open trade for the selected symbol → placeholder
  if (!trade) {
    return (
      <Card className="p-4 gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Risk / Reward</h3>
          </div>
          <Badge variant="outline" className="font-mono tabular text-[10px]">
            {SYMBOL_LABEL[symbol]}
          </Badge>
        </div>
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <Inbox className="h-4 w-4 opacity-50" />
          Belum ada posisi terbuka untuk {SYMBOL_LABEL[symbol]}
        </div>
      </Card>
    )
  }

  const entry = trade.openPrice
  const sl = trade.stopLoss
  const tp = trade.takeProfit
  const isBuy = trade.side === 'buy'
  const base = SYMBOL_BASE[symbol]
  const pip = base?.pip ?? 0.0001

  // Pips distance from current price
  const slPipsAway = sl ? Math.abs((sl - current) / pip) : 0
  const tpPipsAway = tp ? Math.abs((tp - current) / pip) : 0
  const slPipsFromEntry = sl ? Math.abs((sl - entry) / pip) : 0
  const tpPipsFromEntry = tp ? Math.abs((tp - entry) / pip) : 0
  const rr = slPipsFromEntry > 0 ? tpPipsFromEntry / slPipsFromEntry : 0
  const livePips = ((current - entry) / pip) * (isBuy ? 1 : -1)
  const progressPct = slPipsFromEntry + tpPipsFromEntry > 0
    ? Math.max(0, Math.min(100, ((livePips + slPipsFromEntry) / (slPipsFromEntry + tpPipsFromEntry)) * 100))
    : 50

  // Visualization range (with padding so markers don't touch the edges)
  const allPrices = [entry, ...(sl ? [sl] : []), ...(tp ? [tp] : []), current]
  const min = Math.min(...allPrices)
  const max = Math.max(...allPrices)
  const range = max - min || pip * 10
  const padding = range * 0.15
  const minPad = min - padding
  const maxPad = max + padding
  const rangePad = maxPad - minPad
  const pct = (p: number) => ((p - minPad) / rangePad) * 100

  // Color-coded zones:
  // BUY  → red zone between SL (lower) and entry; green zone between entry and TP (higher)
  // SELL → red zone between entry and SL (higher); green zone between TP (lower) and entry
  const redZone = sl ? {
    left: pct(Math.min(sl, entry)),
    width: Math.max(0, pct(Math.max(sl, entry)) - pct(Math.min(sl, entry))),
  } : null
  const greenZone = tp ? {
    left: pct(Math.min(tp, entry)),
    width: Math.max(0, pct(Math.max(tp, entry)) - pct(Math.min(tp, entry))),
  } : null

  const slPos = sl ? pct(sl) : null
  const tpPos = tp ? pct(tp) : null
  const entryPos = pct(entry)
  const currentPos = pct(current)

  return (
    <Card className="p-4 gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">Risk / Reward</h3>
          <Badge variant="outline" className={cn(
            'px-1.5 py-0 text-[10px] uppercase font-mono tabular',
            isBuy ? 'border-emerald-500/40 text-emerald-400' : 'border-rose-500/40 text-rose-400',
          )}>
            {trade.side} {trade.lotSize.toFixed(2)}L
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {sl && tp && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-mono tabular border-violet-500/40 bg-violet-500/10 text-violet-300">
              R:R 1:{rr.toFixed(1)}
            </Badge>
          )}
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-mono tabular">
            {SYMBOL_LABEL[symbol]}
          </Badge>
        </div>
      </div>

      {/* Horizontal price ladder */}
      <div className="relative h-14 rounded-md border border-border overflow-hidden bg-muted/20">
        {/* Red zone (risk) */}
        {redZone && redZone.width > 0 && (
          <div
            className="absolute top-0 bottom-0 bg-rose-500/15"
            style={{ left: `${redZone.left}%`, width: `${redZone.width}%` }}
          />
        )}
        {/* Green zone (reward) */}
        {greenZone && greenZone.width > 0 && (
          <div
            className="absolute top-0 bottom-0 bg-emerald-500/15"
            style={{ left: `${greenZone.left}%`, width: `${greenZone.width}%` }}
          />
        )}

        {/* SL marker (rose, dashed) */}
        {slPos !== null && (
          <div
            className="absolute top-0 bottom-0 flex flex-col items-center"
            style={{ left: `${slPos}%`, transform: 'translateX(-50%)' }}
          >
            <div className="h-full w-0.5 bg-rose-500/80" />
            <span className="absolute top-0.5 text-[8px] font-mono font-bold uppercase text-rose-400 bg-background/80 px-0.5 rounded">
              SL
            </span>
          </div>
        )}
        {/* TP marker (emerald, dashed) */}
        {tpPos !== null && (
          <div
            className="absolute top-0 bottom-0 flex flex-col items-center"
            style={{ left: `${tpPos}%`, transform: 'translateX(-50%)' }}
          >
            <div className="h-full w-0.5 bg-emerald-500/80" />
            <span className="absolute top-0.5 text-[8px] font-mono font-bold uppercase text-emerald-400 bg-background/80 px-0.5 rounded">
              TP
            </span>
          </div>
        )}
        {/* Entry marker (muted, dashed border) */}
        <div
          className="absolute top-0 bottom-0 flex flex-col items-center"
          style={{ left: `${entryPos}%`, transform: 'translateX(-50%)' }}
        >
          <div className="h-full w-0.5 border-l border-dashed border-muted-foreground/70" />
          <span className="absolute top-0.5 text-[8px] font-mono font-bold uppercase text-muted-foreground bg-background/80 px-0.5 rounded">
            ENTRY
          </span>
        </div>

        {/* Live current price marker (animated) */}
        <motion.div
          className="absolute top-0 bottom-0 flex flex-col items-center justify-center pointer-events-none"
          animate={{ left: `${currentPos}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          style={{ transform: 'translateX(-50%)' }}
        >
          <div className="h-full w-1 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
          <motion.div
            className="absolute -bottom-0 translate-y-full text-[9px] font-mono font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-1 rounded"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            {fmtPrice(symbol, current)}
          </motion.div>
        </motion.div>
      </div>

      {/* Price labels row */}
      <div className="relative h-3 text-[9px] font-mono tabular">
        {slPos !== null && (
          <div
            className="absolute -translate-x-1/2 text-rose-400 whitespace-nowrap"
            style={{ left: `${slPos}%` }}
          >
            {fmtPrice(symbol, sl!)}
          </div>
        )}
        <div
          className="absolute -translate-x-1/2 text-muted-foreground whitespace-nowrap"
          style={{ left: `${entryPos}%` }}
        >
          {fmtPrice(symbol, entry)}
        </div>
        {tpPos !== null && (
          <div
            className="absolute -translate-x-1/2 text-emerald-400 whitespace-nowrap"
            style={{ left: `${tpPos}%` }}
          >
            {fmtPrice(symbol, tp!)}
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-md bg-rose-500/10 border border-rose-500/30 px-2 py-1.5 flex flex-col">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">To SL</span>
          <span className="font-mono tabular text-rose-400">{slPipsAway.toFixed(1)}p</span>
        </div>
        <div className="rounded-md bg-muted/40 border border-border px-2 py-1.5 flex flex-col">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Live Pips</span>
          <span className={cn('font-mono tabular font-semibold', livePips >= 0 ? 'text-bull' : 'text-bear')}>
            {livePips >= 0 ? '+' : ''}{livePips.toFixed(1)}p
          </span>
        </div>
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-1.5 flex flex-col">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide">To TP</span>
          <span className="font-mono tabular text-emerald-400">{tpPipsAway.toFixed(1)}p</span>
        </div>
      </div>

      {/* Progress bar (entry → TP) */}
      {sl && tp && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span>Entry</span>
            <span className="text-emerald-400">TP ({progressPct.toFixed(0)}%)</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-muted/60 overflow-hidden">
            <motion.div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-emerald-500/60 to-emerald-400 rounded-full"
              animate={{ width: `${progressPct}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Open positions table                                               */
/* ------------------------------------------------------------------ */

function SourceBadge({ source }: { source: TradeSource }) {
  const cfg = SOURCE_BADGE[source]
  const Icon = cfg.icon
  return (
    <Badge variant="outline" className={cn('gap-1 px-1.5 py-0 text-[10px] uppercase', cfg.cls)}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  )
}

function OpenPositionsTable({
  trades, onEdit,
}: {
  trades: Trade[]
  onEdit: (t: Trade) => void
}) {
  const qc = useQueryClient()
  // Subscribe to all tickers so the footer total re-renders on each tick
  const allTickers = useFeed((s) => s.tickers)
  // Trade currently selected for partial-close (null when dialog closed)
  const [partialCloseTrade, setPartialCloseTrade] = useState<Trade | null>(null)
  const closeMutation = useMutation({
    mutationFn: (id: string) => api.closeTrade(id),
    onSuccess: (res) => {
      toast.success(`Posisi ${res.trade.symbol} ditutup`, {
        description: `P&L ${fmtMoney(res.trade.pnl)} (${res.trade.pips >= 0 ? '+' : ''}${res.trade.pips}p)`,
      })
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['risk-usage'] })
    },
    onError: (e: any) => toast.error('Gagal menutup posisi', { description: e.message }),
  })
  const trailMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.updateTrade(id, body),
    onSuccess: () => {
      toast.success('Trailing stop diperbarui')
      qc.invalidateQueries({ queryKey: ['trades'] })
    },
    onError: (e: any) => toast.error('Gagal update trailing', { description: e.message }),
  })
  const partialCloseMutation = useMutation({
    mutationFn: ({ id, percent }: { id: string; percent: number }) => api.partialCloseTrade(id, percent),
    onSuccess: (res, vars) => {
      toast.success(`Partial close berhasil`, {
        description: `${vars.percent}% posisi ditutup • ${res.pips >= 0 ? '+' : ''}${res.pips}p • P&L ${fmtMoney(res.netPnl)} • Sisa ${res.remainingLot} lot`,
      })
      setPartialCloseTrade(null)
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['risk-usage'] })
    },
    onError: (e: any) => toast.error('Gagal partial close', { description: e.message }),
  })
  const breakEvenMutation = useMutation({
    mutationFn: ({ id, bufferPips }: { id: string; bufferPips: number }) => api.moveToBreakEven(id, bufferPips),
    onSuccess: (res) => {
      toast.success(`Break-Even: SL dipindah ke ${fmtPrice(res.trade.symbol, res.newSl)}`, {
        description: `\u2705 ${res.bufferPips}p buffer \u2022 ${res.message}`,
      })
      qc.invalidateQueries({ queryKey: ['trades', 'open'] })
      qc.invalidateQueries({ queryKey: ['trades', 'closed'] })
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['risk-usage'] })
    },
    onError: (e: any) => toast.error('Tidak bisa pindah BE', { description: e.message }),
  })

  const totalPnl = trades.reduce((s, t) => {
    const cur = allTickers[t.symbol]?.price ?? t.openPrice
    return s + computeLivePnl(t.symbol, t.side, t.lotSize, t.openPrice, cur).pnl
  }, 0)
  const totalLots = trades.reduce((s, t) => s + t.lotSize, 0)

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 mb-3">
          <Inbox className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">Tidak ada posisi terbuka</p>
        <p className="text-xs text-muted-foreground mt-1">
          Buka posisi pertama Anda dari order ticket.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto scroll-thin">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-[11px]">Symbol</TableHead>
            <TableHead className="text-[11px]">Side</TableHead>
            <TableHead className="text-[11px] text-right">Lot</TableHead>
            <TableHead className="text-[11px] text-right">Open</TableHead>
            <TableHead className="text-[11px] text-right">Current</TableHead>
            <TableHead className="text-[11px] text-right">SL/TP</TableHead>
            <TableHead className="text-[11px] text-right">Pips</TableHead>
            <TableHead className="text-[11px] text-right">P&L</TableHead>
            <TableHead className="text-[11px] text-center">Trail</TableHead>
            <TableHead className="text-[11px] text-center">Source</TableHead>
            <TableHead className="text-[11px]">Time</TableHead>
            <TableHead className="text-[11px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {trades.map((t) => (
              <PositionRow
                key={t.id}
                trade={t}
                onEdit={() => onEdit(t)}
                onClose={() => closeMutation.mutate(t.id)}
                closing={closeMutation.isPending}
                onToggleTrail={() => trailMutation.mutate({
                  id: t.id,
                  body: {
                    trailingStop: !t.trailingStop,
                    trailingPips: t.trailingPips || 8,
                  },
                })}
                onPartialClose={() => setPartialCloseTrade(t)}
                partialClosing={partialCloseMutation.isPending}
                onBreakEven={(bufferPips) => breakEvenMutation.mutate({ id: t.id, bufferPips })}
                breakEvenPending={breakEvenMutation.isPending}
              />
            ))}
          </AnimatePresence>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="text-xs font-semibold">
              Total ({trades.length} posisi)
            </TableCell>
            <TableCell className="text-right font-mono tabular text-xs font-semibold">{totalLots.toFixed(2)}</TableCell>
            <TableCell colSpan={4} />
            <TableCell className="text-right font-mono tabular text-xs font-semibold">
              <span className={totalPnl >= 0 ? 'text-bull' : 'text-bear'}>
                {fmtMoney(totalPnl)}
              </span>
            </TableCell>
            <TableCell colSpan={4} />
          </TableRow>
        </TableFooter>
      </Table>
      <PartialCloseDialog
        key={partialCloseTrade?.id ?? 'none'}
        trade={partialCloseTrade}
        open={!!partialCloseTrade}
        onOpenChange={(o) => !o && setPartialCloseTrade(null)}
        onConfirm={(percent) => {
          if (!partialCloseTrade) return
          partialCloseMutation.mutate({ id: partialCloseTrade.id, percent })
        }}
        isPending={partialCloseMutation.isPending}
      />
    </div>
  )
}

function PositionRow({
  trade, onEdit, onClose, closing, onToggleTrail, onPartialClose, partialClosing,
  onBreakEven, breakEvenPending,
}: {
  trade: Trade
  onEdit: () => void
  onClose: () => void
  closing: boolean
  onToggleTrail: () => void
  onPartialClose: () => void
  partialClosing: boolean
  onBreakEven: (bufferPips: number) => void
  breakEvenPending: boolean
}) {
  const [beBuffer, setBeBuffer] = useState(2)
  const ticker = useTicker(trade.symbol)
  const current = ticker?.price ?? trade.openPrice
  const { pips, pnl } = computeLivePnl(trade.symbol, trade.side, trade.lotSize, trade.openPrice, current)
  const isBuy = trade.side === 'buy'

  // Client-side check: is SL already at/beyond entry (trade already risk-free)?
  // For BUY: SL >= openPrice means SL is at/beyond entry on the upside (BE+ achieved)
  // For SELL: SL <= openPrice means SL is at/beyond entry on the downside (BE+ achieved)
  const slAtOrBeyondEntry = trade.stopLoss !== null && trade.stopLoss > 0 && (
    isBuy ? trade.stopLoss >= trade.openPrice : trade.stopLoss <= trade.openPrice
  )

  return (
    <motion.tr
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="hover:bg-muted/30"
    >
      <TableCell className="font-medium text-xs">{trade.symbol}</TableCell>
      <TableCell>
        <Badge variant="outline" className={cn(
          'px-1.5 py-0 text-[10px] uppercase',
          isBuy ? 'border-emerald-500/40 text-emerald-400' : 'border-rose-500/40 text-rose-400',
        )}>
          {trade.side}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-mono tabular text-xs">{trade.lotSize.toFixed(2)}</TableCell>
      <TableCell className="text-right font-mono tabular text-xs">{fmtPrice(trade.symbol, trade.openPrice)}</TableCell>
      <TableCell className="text-right font-mono tabular text-xs">
        <span className={ticker ? (ticker.dir === 'up' ? 'text-bull' : ticker.dir === 'down' ? 'text-bear' : '') : ''}>
          {fmtPrice(trade.symbol, current)}
        </span>
      </TableCell>
      <TableCell className="text-right font-mono tabular text-[10px]">
        <span className="text-bear">{trade.stopLoss ? fmtPrice(trade.symbol, trade.stopLoss) : '—'}</span>
        <span className="text-muted-foreground mx-0.5">/</span>
        <span className="text-bull">{trade.takeProfit ? fmtPrice(trade.symbol, trade.takeProfit) : '—'}</span>
      </TableCell>
      <TableCell className={cn('text-right font-mono tabular text-xs font-semibold', pips >= 0 ? 'text-bull' : 'text-bear')}>
        {pips >= 0 ? '+' : ''}{pips.toFixed(1)}
      </TableCell>
      <TableCell className={cn('text-right font-mono tabular text-xs font-semibold', pnl >= 0 ? 'text-bull' : 'text-bear')}>
        {fmtMoney(pnl)}
      </TableCell>
      <TableCell className="text-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleTrail}
              className={cn(
                'inline-flex items-center justify-center h-5 px-1.5 rounded text-[9px] uppercase border transition-colors',
                trade.trailingStop
                  ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                  : 'border-border bg-transparent text-muted-foreground hover:bg-muted/50',
              )}
            >
              {trade.trailingStop ? `T${trade.trailingPips}p` : 'OFF'}
            </button>
          </TooltipTrigger>
          <TooltipContent>Toggle trailing stop</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="text-center"><SourceBadge source={trade.source} /></TableCell>
      <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(trade.openTime)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Edit SL/TP">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {/* Break-even stop button (risk-free move) */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={breakEvenPending || slAtOrBeyondEntry}
                className="h-7 px-2 text-[10px] gap-1 font-mono uppercase text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                title={slAtOrBeyondEntry ? 'SL sudah di/beyond entry (risk-free)' : 'Pindah SL ke harga entry (risk-free)'}
              >
                {breakEvenPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Anchor className="h-3 w-3" />}
                BE
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Pindah ke Break-Even?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <span>
                    Pindahkan SL ke harga entry ({fmtPrice(trade.symbol, trade.openPrice)})?
                    Trade <span className="font-semibold text-emerald-400">{trade.side.toUpperCase()} {trade.lotSize} lot {trade.symbol}</span> akan jadi{' '}
                    <span className="font-semibold text-emerald-400">risk-free</span>.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex items-center justify-between gap-2 py-1 rounded-md border border-border bg-muted/30 px-3">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-xs">Buffer (pips)</Label>
                  <span className="text-[10px] text-muted-foreground">
                    SL = entry {isBuy ? '-' : '+'} buffer
                  </span>
                </div>
                <Select value={String(beBuffer)} onValueChange={(v) => setBeBuffer(Number(v))}>
                  <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 pips</SelectItem>
                    <SelectItem value="1">1 pip</SelectItem>
                    <SelectItem value="2">2 pips</SelectItem>
                    <SelectItem value="5">5 pips</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onBreakEven(beBuffer)}
                  className="bg-emerald-500 text-emerald-950 hover:bg-emerald-500/90 gap-1.5"
                >
                  <Anchor className="h-3.5 w-3.5" />
                  Pindah ke BE
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {/* Partial close button — opens the custom percent selection dialog */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onPartialClose}
            disabled={partialClosing || trade.lotSize < 0.02}
            className="h-7 w-7 text-amber-400 hover:text-amber-500 hover:bg-amber-500/10"
            title="Partial close (pilih persentase)"
          >
            {partialClosing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10">
                <X className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tutup posisi {trade.symbol}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Posisi {trade.side.toUpperCase()} {trade.lotSize} lot akan ditutup pada harga pasar saat ini.
                  P&L estimasi: <span className={pnl >= 0 ? 'text-bull' : 'text-bear'}>{fmtMoney(pnl)}</span> ({pips >= 0 ? '+' : ''}{pips.toFixed(1)} pips).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onClose}
                  className="bg-rose-500 text-rose-950 hover:bg-rose-500/90"
                >
                  {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Tutup Posisi
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </motion.tr>
  )
}

/* ------------------------------------------------------------------ */
/*  Edit SL/TP dialog                                                  */
/* ------------------------------------------------------------------ */

function EditSLTPDialog({
  trade, open, onOpenChange,
}: {
  trade: Trade | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()
  const [sl, setSl] = useState(0)
  const [tp, setTp] = useState(0)

  useEffect(() => {
    if (trade) {
      setSl(trade.stopLoss ?? 0)
      setTp(trade.takeProfit ?? 0)
    }
  }, [trade])

  const mutation = useMutation({
    mutationFn: (body: any) => api.updateTrade(trade!.id, body),
    onSuccess: () => {
      toast.success('SL/TP diperbarui')
      qc.invalidateQueries({ queryKey: ['trades'] })
      onOpenChange(false)
    },
    onError: (e: any) => toast.error('Gagal update SL/TP', { description: e.message }),
  })

  if (!trade) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit SL / TP — {trade.symbol} {trade.side.toUpperCase()}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Stop Loss</Label>
            <Input
              type="number" step="0.00001" value={sl}
              onChange={(e) => setSl(Number(e.target.value))}
              className="font-mono tabular text-sm"
            />
            <span className="text-[10px] text-muted-foreground font-mono tabular">
              Open: {fmtPrice(trade.symbol, trade.openPrice)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Take Profit</Label>
            <Input
              type="number" step="0.00001" value={tp}
              onChange={(e) => setTp(Number(e.target.value))}
              className="font-mono tabular text-sm"
            />
            <span className="text-[10px] text-muted-foreground font-mono tabular">
              Current: {fmtPrice(trade.symbol, useFeed.getState().tickers[trade.symbol]?.price ?? trade.openPrice)}
            </span>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Batal</Button>
          </DialogClose>
          <Button
            onClick={() => mutation.mutate({ stopLoss: sl, takeProfit: tp })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Pending orders table                                               */
/* ------------------------------------------------------------------ */

function PendingOrdersTable({ orders }: { orders: PendingOrder[] }) {
  const qc = useQueryClient()
  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelOrder(id),
    onSuccess: () => {
      toast.success('Order dibatalkan')
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: any) => toast.error('Gagal membatalkan order', { description: e.message }),
  })

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Layers className="h-7 w-7 text-muted-foreground mb-2" />
        <p className="text-sm">Tidak ada order pending</p>
        <p className="text-xs text-muted-foreground mt-1">Buat order Limit/Stop dari order ticket.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto scroll-thin">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-[11px]">Symbol</TableHead>
            <TableHead className="text-[11px]">Type</TableHead>
            <TableHead className="text-[11px]">Side</TableHead>
            <TableHead className="text-[11px] text-right">Lot</TableHead>
            <TableHead className="text-[11px] text-right">Price</TableHead>
            <TableHead className="text-[11px] text-right">SL</TableHead>
            <TableHead className="text-[11px] text-right">TP</TableHead>
            <TableHead className="text-[11px]">Time</TableHead>
            <TableHead className="text-[11px] text-right">Cancel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {orders.map((o) => (
              <motion.tr
                key={o.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="hover:bg-muted/30"
              >
                <TableCell className="font-medium text-xs">{o.symbol}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase border-amber-500/40 text-amber-400">
                    {o.orderType}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    'px-1.5 py-0 text-[10px] uppercase',
                    o.side === 'buy' ? 'border-emerald-500/40 text-emerald-400' : 'border-rose-500/40 text-rose-400',
                  )}>
                    {o.side}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular text-xs">{o.lotSize.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono tabular text-xs">{fmtPrice(o.symbol, o.price)}</TableCell>
                <TableCell className="text-right font-mono tabular text-[10px] text-bear">
                  {o.stopLoss ? fmtPrice(o.symbol, o.stopLoss) : '—'}
                </TableCell>
                <TableCell className="text-right font-mono tabular text-[10px] text-bull">
                  {o.takeProfit ? fmtPrice(o.symbol, o.takeProfit) : '—'}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(o.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-rose-400 hover:text-rose-500 hover:bg-rose-500/10"
                    onClick={() => cancelMutation.mutate(o.id)}
                    disabled={cancelMutation.isPending}
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </motion.tr>
            ))}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Closed trades table                                                */
/* ------------------------------------------------------------------ */

function ClosedTradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <History className="h-7 w-7 text-muted-foreground mb-2" />
        <p className="text-sm">Belum ada riwayat trade</p>
        <p className="text-xs text-muted-foreground mt-1">Riwayat posisi yang sudah ditutup akan muncul di sini.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-x-auto scroll-thin">
      <Table className="min-w-[700px]">
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-[11px]">Symbol</TableHead>
            <TableHead className="text-[11px]">Side</TableHead>
            <TableHead className="text-[11px] text-right">Lot</TableHead>
            <TableHead className="text-[11px] text-right">Open</TableHead>
            <TableHead className="text-[11px] text-right">Close</TableHead>
            <TableHead className="text-[11px] text-right">Pips</TableHead>
            <TableHead className="text-[11px] text-right">P&L</TableHead>
            <TableHead className="text-[11px] text-right">Comm</TableHead>
            <TableHead className="text-[11px] text-right">Net</TableHead>
            <TableHead className="text-[11px]">Duration</TableHead>
            <TableHead className="text-[11px]">Closed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((t) => {
            const durMs = (t.closeTime ? new Date(t.closeTime).getTime() : 0) - new Date(t.openTime).getTime()
            const durMin = Math.floor(durMs / 60000)
            const durH = Math.floor(durMin / 60)
            const net = t.pnl - t.commission - t.swap
            return (
              <TableRow key={t.id} className="hover:bg-muted/30">
                <TableCell className="font-medium text-xs">{t.symbol}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn(
                    'px-1.5 py-0 text-[10px] uppercase',
                    t.side === 'buy' ? 'border-emerald-500/40 text-emerald-400' : 'border-rose-500/40 text-rose-400',
                  )}>
                    {t.side}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular text-xs">{t.lotSize.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono tabular text-xs">{fmtPrice(t.symbol, t.openPrice)}</TableCell>
                <TableCell className="text-right font-mono tabular text-xs">
                  {t.closePrice ? fmtPrice(t.symbol, t.closePrice) : '—'}
                </TableCell>
                <TableCell className={cn('text-right font-mono tabular text-xs', t.pips >= 0 ? 'text-bull' : 'text-bear')}>
                  {t.pips >= 0 ? '+' : ''}{t.pips.toFixed(1)}
                </TableCell>
                <TableCell className={cn('text-right font-mono tabular text-xs font-semibold', t.pnl >= 0 ? 'text-bull' : 'text-bear')}>
                  {fmtMoney(t.pnl)}
                </TableCell>
                <TableCell className="text-right font-mono tabular text-[10px] text-muted-foreground">
                  -{fmtMoney(t.commission)}
                </TableCell>
                <TableCell className={cn('text-right font-mono tabular text-xs font-semibold', net >= 0 ? 'text-bull' : 'text-bear')}>
                  {fmtMoney(net)}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap font-mono tabular">
                  {durH > 0 ? `${durH}j ${durMin % 60}m` : `${durMin}m`}
                </TableCell>
                <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {t.closeTime ? relativeTime(t.closeTime) : '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Kill Switch bar (r12-SAFETY: emergency close all + halt auto-trade) */
/* ------------------------------------------------------------------ */

function KillSwitchBar({ openCount }: { openCount: number }) {
  const qc = useQueryClient()
  const [killDialogOpen, setKillDialogOpen] = useState(false)
  const [closeAllDialogOpen, setCloseAllDialogOpen] = useState(false)

  const killSwitchMutation = useMutation({
    mutationFn: () => api.killSwitch({ reason: 'manual-kill-switch' }),
    onSuccess: (data) => {
      toast.success('🚨 KILL SWITCH executed', {
        description: data.message,
        duration: 8000,
      })
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['risk'] })
      qc.invalidateQueries({ queryKey: ['risk-usage'] })
      setKillDialogOpen(false)
    },
    onError: (e: Error) => {
      toast.error('Kill switch failed', { description: e.message })
      setKillDialogOpen(false)
    },
  })

  const closeAllMutation = useMutation({
    mutationFn: () => api.closeAllTrades({ reason: 'manual-close-all' }),
    onSuccess: (data) => {
      toast.success(`Closed ${data.count} positions`, {
        description: `Total P&L: ${data.totalPnl >= 0 ? '+' : ''}$${data.totalPnl.toFixed(2)}`,
        duration: 6000,
      })
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setCloseAllDialogOpen(false)
    },
    onError: (e: Error) => {
      toast.error('Close all failed', { description: e.message })
      setCloseAllDialogOpen(false)
    },
  })

  return (
    <>
      <Card className={cn(
        'relative overflow-hidden border-l-4',
        openCount > 0
          ? 'border-rose-500/50 bg-rose-500/[0.04]'
          : 'border-border bg-card/50',
      )}>
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex items-center gap-2">
            <span className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg',
              openCount > 0
                ? 'bg-rose-500/15 text-rose-400'
                : 'bg-muted text-muted-foreground',
            )}>
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-semibold">Emergency Controls</div>
              <div className="text-[11px] text-muted-foreground">
                {openCount > 0
                  ? `${openCount} open position${openCount > 1 ? 's' : ''} — siap untuk close-all`
                  : 'Tidak ada posisi terbuka'}
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Close All — closes positions but keeps auto-trade enabled */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCloseAllDialogOpen(true)}
              disabled={openCount === 0 || closeAllMutation.isPending || killSwitchMutation.isPending}
              className="gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
            >
              {closeAllMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Close All
            </Button>

            {/* Kill Switch — closes positions + disables auto-trade (the panic button) */}
            <Button
              variant="default"
              size="sm"
              onClick={() => setKillDialogOpen(true)}
              disabled={killSwitchMutation.isPending || closeAllMutation.isPending}
              className="gap-1.5 bg-rose-600 text-white hover:bg-rose-700"
            >
              {killSwitchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              Kill Switch
            </Button>
          </div>
        </div>
      </Card>

      {/* Close All confirmation dialog */}
      <AlertDialog open={closeAllDialogOpen} onOpenChange={setCloseAllDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-amber-500" />
              Close All Positions?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will close all <strong>{openCount} open position(s)</strong> at current market price.
              Auto-trading will remain enabled. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => closeAllMutation.mutate()}
              disabled={closeAllMutation.isPending}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {closeAllMutation.isPending ? 'Closing...' : 'Yes, Close All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kill Switch confirmation dialog */}
      <AlertDialog open={killDialogOpen} onOpenChange={setKillDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Power className="h-5 w-5 text-rose-500" />
              🚨 ACTIVATE KILL SWITCH?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This is the <strong>emergency panic button</strong>. It will:
              <br />• <strong>Disable auto-trading</strong> immediately
              <br />• <strong>Close all {openCount} open position(s)</strong> at market price
              <br />• Send webhook notification to all configured channels
              <br /><br />
              This action cannot be undone. Use only in emergencies.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => killSwitchMutation.mutate()}
              disabled={killSwitchMutation.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {killSwitchMutation.isPending ? 'Executing...' : '🚨 ACTIVATE KILL SWITCH'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                         */
/* ------------------------------------------------------------------ */

export function TradingPanel() {
  const qc = useQueryClient()
  // Sync local selection with the global active-account store so the topbar
  // switcher and every panel stay in sync.
  const { activeAccountId, setActiveAccountId } = useActiveAccount()
  const selectedAccountId = activeAccountId
  const setSelectedAccountId = setActiveAccountId
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'manual'
    return (localStorage.getItem('trading-mode') as Mode | null) ?? 'manual'
  })
  const [activeSymbol, setActiveSymbol] = useState<string>('EURUSD')
  const [activeTab, setActiveTab] = useState<'open' | 'pending' | 'closed'>('open')
  const [editTrade, setEditTrade] = useState<Trade | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Persist mode to localStorage (external system sync)
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('trading-mode', mode)
  }, [mode])

  // Queries
  const accountsQ = useQuery({ queryKey: ['accounts'], queryFn: () => api.accounts() })
  const riskQ = useQuery({ queryKey: ['risk'], queryFn: () => api.risk() })

  const accounts = accountsQ.data?.accounts ?? []
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? accounts.find((a) => a.isDefault) ?? accounts[0] ?? null,
    [accounts, selectedAccountId],
  )
  const effectiveAccountId = selectedAccount?.id ?? null

  const openTradesQ = useQuery({
    queryKey: ['trades', 'open', effectiveAccountId],
    queryFn: () => api.trades({ status: 'open', accountId: effectiveAccountId ?? undefined, limit: 100 }),
    refetchInterval: 5000,
    enabled: !!effectiveAccountId,
  })
  const closedTradesQ = useQuery({
    queryKey: ['trades', 'closed', effectiveAccountId],
    queryFn: () => api.trades({ status: 'closed', accountId: effectiveAccountId ?? undefined, limit: 50 }),
    refetchInterval: 10000,
    enabled: !!effectiveAccountId,
  })
  const ordersQ = useQuery({
    queryKey: ['orders', effectiveAccountId],
    queryFn: () => api.orders(effectiveAccountId ?? undefined),
    refetchInterval: 5000,
    enabled: !!effectiveAccountId,
  })

  // Fallback: hydrate ticker store with api.symbols on first mount
  useEffect(() => {
    api.symbols().then((res) => {
      useFeed.getState().applyTick(res.symbols as any, Date.now())
    }).catch(() => {})
  }, [])

  const toggleConnectMutation = useMutation({
    mutationFn: (id: string) => api.toggleConnect(id),
    onSuccess: (res) => {
      toast.success(res.connected ? 'MT5 terhubung' : 'MT5 diputus', {
        description: `${selectedAccount?.name} • ${res.connected ? 'Connected' : 'Disconnected'}`,
      })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: any) => toast.error('Gagal mengubah koneksi MT5', { description: e.message }),
  })

  const onEdit = useCallback((t: Trade) => {
    setEditTrade(t)
    setEditOpen(true)
  }, [])

  const openTrades = openTradesQ.data?.trades ?? []
  const closedTrades = closedTradesQ.data?.trades ?? []
  const orders = ordersQ.data?.orders ?? []
  const riskSettings = riskQ.data?.settings ?? {}
  // Find the open trade matching the currently-selected symbol (for R:R chart)
  const activeSymbolTrade = openTrades.find((t) => t.symbol === activeSymbol)

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1600px] mx-auto">
        {/* A. Account bar */}
        <AccountBar
          accounts={accounts}
          selectedId={effectiveAccountId}
          onSelect={setSelectedAccountId}
          onToggleConnect={(id) => toggleConnectMutation.mutate(id)}
        />

        {/* A2. Kill Switch bar (r12-SAFETY: emergency close all + halt) */}
        <KillSwitchBar openCount={openTrades.length} />

        {/* B. Price grid */}
        <PriceGrid activeSymbol={activeSymbol} onSelect={setActiveSymbol} />

        {/* C + D + E + F: Two-column layout */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left: order ticket */}
          <div className="lg:col-span-1 space-y-4">
            <ModeToggle mode={mode} onChange={setMode} />
            <OrderTicket
              symbol={activeSymbol}
              setSymbol={setActiveSymbol}
              selectedAccount={selectedAccount}
              riskSettings={riskSettings}
            />
          </div>

          {/* Right: R:R chart + tabs */}
          <div className="lg:col-span-2 space-y-4">
            <RiskRewardChart symbol={activeSymbol} trade={activeSymbolTrade} />
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <TabsList>
                  <TabsTrigger value="open" className="gap-1.5">
                    <Crosshair className="h-3.5 w-3.5" />
                    Posisi Terbuka
                    {openTrades.length > 0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{openTrades.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="pending" className="gap-1.5">
                    <Layers className="h-3.5 w-3.5" />
                    Order Pending
                    {orders.length > 0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">{orders.length}</Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="closed" className="gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    Riwayat (Closed)
                  </TabsTrigger>
                </TabsList>
                <Button
                  variant="ghost" size="sm"
                  className="text-[11px] gap-1 text-muted-foreground"
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: ['trades'] })
                    qc.invalidateQueries({ queryKey: ['orders'] })
                  }}
                >
                  <RefreshCw className="h-3 w-3" /> Refresh
                </Button>
              </div>

              <TabsContent value="open" className="mt-3">
                {openTradesQ.isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <OpenPositionsTable
                    trades={openTrades}
                    onEdit={onEdit}
                  />
                )}
              </TabsContent>

              <TabsContent value="pending" className="mt-3">
                {ordersQ.isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <PendingOrdersTable orders={orders} />
                )}
              </TabsContent>

              <TabsContent value="closed" className="mt-3">
                {closedTradesQ.isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ClosedTradesTable trades={closedTrades} />
                )}
              </TabsContent>
            </Tabs>

            {/* Session info footer */}
            <Card className="p-3 gap-0">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  Auto-refresh setiap 5 detik • Live price via WebSocket
                </span>
                <span className="font-mono tabular">
                  Open {openTrades.length} • Pending {orders.length} • Closed {closedTrades.length}
                </span>
              </div>
            </Card>
          </div>
        </div>

        <EditSLTPDialog trade={editTrade} open={editOpen} onOpenChange={setEditOpen} />
      </div>
  )
}
