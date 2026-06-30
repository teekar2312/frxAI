'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bell, BellRing, ArrowUp, ArrowDown, ArrowUpRight, ArrowDownRight,
  Trash2, Mail, MessageSquare, Plus, History, Target, Crosshair,
  CheckCircle2, Activity, TrendingUp, TrendingDown, Sparkles, Info,
  RotateCcw,
} from 'lucide-react'

import { api } from '@/lib/api'
import { fmtPrice, relativeTime } from '@/lib/format'
import {
  SUPPORTED_SYMBOLS, SYMBOL_LABEL, SYMBOL_BASE,
  type Alert,
} from '@/lib/types'
import { useFeed, useTicker } from '@/hooks/use-price-feed'
import { Sparkline } from '@/components/trading/sparkline'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type Condition = Alert['condition']

const CONDITIONS: { value: Condition; label: string; icon: typeof ArrowUp }[] = [
  { value: 'above', label: 'Above (≥)', icon: ArrowUp },
  { value: 'below', label: 'Below (≤)', icon: ArrowDown },
  { value: 'cross_up', label: 'Cross Up', icon: ArrowUpRight },
  { value: 'cross_down', label: 'Cross Down', icon: ArrowDownRight },
]

// Wrapper component to avoid creating components during render (react-hooks/static-components).
function ConditionIcon({ condition, className }: { condition: Condition; className?: string }) {
  switch (condition) {
    case 'above': return <ArrowUp className={className} />
    case 'below': return <ArrowDown className={className} />
    case 'cross_up': return <ArrowUpRight className={className} />
    case 'cross_down': return <ArrowDownRight className={className} />
    default: return <Target className={className} />
  }
}

function condColor(c: Condition): string {
  if (c === 'above' || c === 'cross_up') return 'text-emerald-400'
  return 'text-rose-400'
}

// Tailwind classes for the left-border color stripe by condition.
function condBorderColor(c: Condition): string {
  if (c === 'above' || c === 'cross_up') return 'border-l-emerald-500'
  return 'border-l-rose-500'
}

// Calculate pip distance for an alert given live price.
function pipDistance(symbol: string, current: number | undefined, target: number): { pips: number; sign: '+' | '-' } {
  if (current == null) return { pips: 0, sign: '+' }
  const pip = SYMBOL_BASE[symbol]?.pip ?? 0.0001
  const diff = current - target
  const pips = Math.abs(diff) / pip
  return { pips, sign: diff >= 0 ? '+' : '-' }
}

// Compute 0..1 progress of how close current price is to the target.
function alertProgress(symbol: string, condition: Condition, current: number | undefined, target: number): number {
  if (current == null) return 0
  const pip = SYMBOL_BASE[symbol]?.pip ?? 0.0001
  // Define a reference window of ~50 pips as 100% scale, clamp 0..1
  const window = 50 * pip
  if (condition === 'above' || condition === 'cross_up') {
    const dist = target - current
    if (dist <= 0) return 1
    return Math.max(0, Math.min(1, 1 - dist / window))
  }
  const dist = current - target
  if (dist <= 0) return 1
  return Math.max(0, Math.min(1, 1 - dist / window))
}

// Check whether alert should fire given the previous & current live price.
function shouldFire(alert: Alert, prev: number | undefined, cur: number): boolean {
  const t = alert.price
  switch (alert.condition) {
    case 'above': return cur >= t
    case 'below': return cur <= t
    case 'cross_up': return prev != null && prev < t && cur >= t
    case 'cross_down': return prev != null && prev > t && cur <= t
    default: return false
  }
}

// Pip-distance pill color: emerald (far), amber (close), rose (very close).
function pipPillClass(pips: number): { cls: string; label: string } {
  if (pips <= 5) return { cls: 'border-rose-500/40 bg-rose-500/15 text-rose-300', label: 'sangat dekat' }
  if (pips <= 20) return { cls: 'border-amber-500/40 bg-amber-500/15 text-amber-300', label: 'dekat' }
  return { cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300', label: 'aman' }
}

/* ---------- Live price monitor strip ---------- */
function LiveMonitorStrip() {
  const tickers = useFeed((s) => s.tickers)
  const symbols = SUPPORTED_SYMBOLS as readonly string[]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {symbols.map((sym) => {
        const t = tickers[sym]
        const up = t?.dir === 'up'
        const down = t?.dir === 'down'
        const colorCls = up ? 'text-emerald-400' : down ? 'text-rose-400' : 'text-muted-foreground'
        return (
          <motion.div
            key={sym}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            whileHover={{ y: -2 }}
            className="relative overflow-hidden rounded-lg border border-border bg-card/60 p-2.5 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/[0.04]"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-emerald-500/10 blur-2xl" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                {SYMBOL_LABEL[sym]}
              </span>
              <span className={cn('flex items-center text-[10px]', colorCls)}>
                {up && <TrendingUp className="h-3 w-3" />}
                {down && <TrendingDown className="h-3 w-3" />}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className={cn('font-mono text-sm font-semibold tabular', colorCls)}>
                {t ? fmtPrice(sym, t.price) : '—'}
              </span>
              {t && t.spark?.length > 1 && (
                <Sparkline data={t.spark} width={48} height={20} />
              )}
            </div>
            <div className="mt-0.5 text-[10px] font-mono text-muted-foreground tabular">
              {t ? `${t.changePct >= 0 ? '+' : ''}${t.changePct.toFixed(2)}%` : 'offline'}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

/* ---------- Create Alert Form ---------- */
function CreateAlertForm() {
  const qc = useQueryClient()
  const [symbol, setSymbol] = useState<string>('EURUSD')
  const [condition, setCondition] = useState<Condition>('above')
  const [price, setPrice] = useState<string>('')
  const [notifyEmail, setNotifyEmail] = useState<boolean>(true)
  const [message, setMessage] = useState<string>('')
  const ticker = useTicker(symbol)

  const create = useMutation({
    mutationFn: () =>
      api.createAlert({
        symbol,
        condition,
        price: parseFloat(price),
        notifyEmail,
        message: message.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Alert dibuat', { description: `${SYMBOL_LABEL[symbol]} ${condition} ${price}` })
      qc.invalidateQueries({ queryKey: ['alerts'] })
      setPrice('')
      setMessage('')
    },
    onError: (e: Error) => toast.error('Gagal membuat alert', { description: e.message }),
  })

  const useCurrent = () => {
    if (ticker?.price) {
      setPrice(String(ticker.price))
      toast.info('Harga saat ini diisi', { description: `${symbol} @ ${fmtPrice(symbol, ticker.price)}` })
    } else {
      toast.warning('Harga belum tersedia', { description: 'Tunggu feed harga live terhubung.' })
    }
  }

  const submit = () => {
    const p = parseFloat(price)
    if (!p || p <= 0) {
      toast.error('Harga tidak valid', { description: 'Masukkan harga target yang valid.' })
      return
    }
    create.mutate()
  }

  return (
    <Card className="relative overflow-hidden border-emerald-500/20">
      {/* Gradient header strip */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-emerald-500/10 via-emerald-500/[0.03] to-transparent" />
      <CardHeader className="relative pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <Crosshair className="h-4 w-4" />
          </span>
          Buat Alert Harga
        </CardTitle>
        <CardDescription className="text-xs">
          Notifikasi otomatis ketika harga mencapai target. Compare live feed client-side.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Symbol */}
          <div className="space-y-1.5">
            <Label className="text-xs">Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_SYMBOLS.map((s) => (
                  <SelectItem key={s} value={s}>{SYMBOL_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Info className="h-2.5 w-2.5" /> Pair yang dimonitor
            </p>
          </div>

          {/* Condition */}
          <div className="space-y-1.5">
            <Label className="text-xs">Kondisi</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as Condition)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => {
                  return (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="flex items-center gap-2">
                        <ConditionIcon condition={c.value} className={cn('h-3.5 w-3.5', condColor(c.value))} />
                        {c.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Info className="h-2.5 w-2.5" /> Aturan trigger alert
            </p>
          </div>

          {/* Target Price */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs flex items-center justify-between">
              <span>Target Price</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                live: {ticker ? fmtPrice(symbol, ticker.price) : '—'}
              </span>
            </Label>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                placeholder="0.00000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="font-mono tabular"
              />
              <Button type="button" variant="outline" size="sm" onClick={useCurrent} className="shrink-0">
                Use Current
              </Button>
            </div>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Info className="h-2.5 w-2.5" /> Harga absolut yang mentrigger alert
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Pesan (opsional)</Label>
            <Input
              placeholder="cth: Take profit EURUSD"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Info className="h-2.5 w-2.5" /> Catatan singkat untuk identifikasi
            </p>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Mail className="h-3.5 w-3.5 text-emerald-400" />
              <Switch checked={notifyEmail} onCheckedChange={setNotifyEmail} />
              <span className="text-xs text-muted-foreground">Notify Email</span>
            </div>
            <Button
              className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-emerald-400 hover:shadow-emerald-500/30"
              onClick={submit}
              disabled={create.isPending}
            >
              {create.isPending ? (
                <Activity className="h-4 w-4 animate-pulse" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Buat Alert
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Single Alert Card ---------- */
function AlertCard({ alert }: { alert: Alert }) {
  const qc = useQueryClient()
  const [confirmDel, setConfirmDel] = useState(false)
  const ticker = useTicker(alert.symbol)

  const update = useMutation({
    mutationFn: (active: boolean) => api.updateAlert(alert.id, { active }),
    onSuccess: (_data, active) => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast.success(active ? 'Alert diaktifkan' : 'Alert dinonaktifkan')
    },
    onError: (e: Error) => toast.error('Gagal update alert', { description: e.message }),
  })

  const del = useMutation({
    mutationFn: () => api.deleteAlert(alert.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast.success('Alert dihapus')
    },
    onError: (e: Error) => toast.error('Gagal menghapus', { description: e.message }),
  })

  const cur = ticker?.price
  const { pips, sign } = pipDistance(alert.symbol, cur, alert.price)
  const progress = alertProgress(alert.symbol, alert.condition, cur, alert.price)
  const isTriggered = alert.triggered
  const isVeryClose = !isTriggered && progress > 0.8
  const pill = pipPillClass(pips)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, type: 'spring', stiffness: 300, damping: 26 }}
      whileHover={{ y: -2 }}
      className={cn(
        'relative overflow-hidden rounded-lg border border-l-4 bg-card p-4 transition-shadow hover:shadow-lg',
        condBorderColor(alert.condition),
        isTriggered
          ? 'border-amber-500/30 bg-amber-500/[0.04] opacity-75'
          : alert.active
            ? 'border-border hover:border-emerald-500/40 hover:shadow-emerald-500/5'
            : 'border-dashed border-border opacity-60',
      )}
    >
      {/* Pulsing glow when very close to target */}
      {isVeryClose && (
        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-lg ring-1 ring-amber-500/40" />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* Symbol + condition */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-mono">{alert.symbol}</Badge>
          <span className={cn('flex items-center gap-1 text-sm', condColor(alert.condition))}>
            <ConditionIcon condition={alert.condition} className="h-4 w-4" />
            <span className="text-xs font-medium uppercase">{alert.condition.replace('_', ' ')}</span>
          </span>
        </div>

        {/* Prices */}
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Target</div>
            <div className="font-mono text-sm font-semibold tabular">
              {fmtPrice(alert.symbol, alert.price)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current</div>
            <div className={cn(
              'font-mono text-sm font-semibold tabular',
              cur == null ? 'text-muted-foreground' : sign === '+' ? 'text-emerald-400' : 'text-rose-400',
            )}>
              {cur != null ? fmtPrice(alert.symbol, cur) : '—'}
            </div>
          </div>
          {/* Pip-distance colored pill */}
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Distance</div>
            {cur != null ? (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold tabular',
                  pill.cls,
                )}
                title={pill.label}
              >
                {sign}{pips.toFixed(1)}p
              </span>
            ) : (
              <span className="font-mono text-sm tabular text-muted-foreground">—</span>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          {isTriggered ? (
            <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300">
              <CheckCircle2 className="h-3 w-3" />
              TRIGGERED
            </Badge>
          ) : alert.active ? (
            <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
              <BellRing className="h-3 w-3 live-dot" />
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <Bell className="h-3 w-3" />
              Paused
            </Badge>
          )}
          {alert.notifyEmail && (
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!isTriggered && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span className="flex items-center gap-1">
              <Target className="h-2.5 w-2.5" /> Kedekatan dengan target
            </span>
            <span className="font-mono tabular">{(progress * 100).toFixed(0)}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className={cn(
                'relative h-full rounded-full bg-gradient-to-r',
                progress > 0.85
                  ? 'from-amber-600 via-amber-400 to-amber-300'
                  : 'from-emerald-600 via-emerald-400 to-emerald-300',
              )}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(2, progress * 100)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              {/* Animated shimmer overlay */}
              <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              {/* Glow when > 80% */}
              {progress > 0.8 && (
                <div className="absolute -inset-0.5 animate-pulse rounded-full bg-amber-400/40 blur-md" />
              )}
            </motion.div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {alert.message && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground italic max-w-[60%] truncate">
            <MessageSquare className="h-3 w-3" />
            "{alert.message}"
          </span>
        )}
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">
          {isTriggered && alert.triggeredAt
            ? `triggered ${relativeTime(alert.triggeredAt)}`
            : `created ${relativeTime(alert.createdAt)}`}
        </span>

        {!isTriggered && (
          <div className="flex items-center gap-1.5">
            <Switch
              checked={alert.active}
              onCheckedChange={(v) => update.mutate(v)}
              disabled={update.isPending}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus alert ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Alert {alert.symbol} {alert.condition} {fmtPrice(alert.symbol, alert.price)} akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => del.mutate()}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

/* ---------- Loading skeleton row ---------- */
function AlertSkeletonRow() {
  return (
    <div className="rounded-lg border border-l-4 border-border border-l-emerald-500/40 bg-card p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-20" />
        <div className="ml-auto flex items-center gap-4">
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between">
          <Skeleton className="h-2.5 w-32" />
          <Skeleton className="h-2.5 w-8" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    </div>
  )
}

/* ---------- Triggered History ---------- */
function TriggeredHistory({ alerts }: { alerts: Alert[] }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(true) // default open so users see triggered alerts

  // Re-arm an alert: clears triggered state and resets triggeredAt, so it can fire again.
  const rearmMutation = useMutation({
    mutationFn: (id: string) =>
      api.updateAlert(id, { triggered: false, triggeredAt: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      toast.success('Alert di-reset', { description: 'Alert siap dipicu kembali.' })
    },
    onError: (e: Error) => toast.error('Gagal reset alert', { description: e.message }),
  })

  if (alerts.length === 0) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="relative overflow-hidden rounded-lg border border-amber-500/30 bg-amber-500/[0.03]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-amber-500/10 to-transparent" />
      <CollapsibleTrigger asChild>
        <button className="relative flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-amber-500/[0.05]">
          <History className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium">Riwayat Alert Triggered</span>
          <Badge variant="outline" className="ml-1 border-amber-500/40 bg-amber-500/10 text-amber-300">
            {alerts.length}
          </Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {open ? 'Sembunyikan' : 'Tampilkan'}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 p-3 pt-0 max-h-72 overflow-y-auto scroll-thin">
          <AnimatePresence initial={false}>
            {alerts.map((a) => {
              return (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-3 rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs transition-colors hover:bg-amber-500/[0.08]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <Badge variant="secondary" className="font-mono">{a.symbol}</Badge>
                  <ConditionIcon condition={a.condition} className={cn('h-3.5 w-3.5', condColor(a.condition))} />
                  <span className="font-mono tabular">{fmtPrice(a.symbol, a.price)}</span>
                  {a.message && <span className="italic text-muted-foreground truncate max-w-[40%]">"{a.message}"</span>}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {a.triggeredAt ? relativeTime(a.triggeredAt) : '—'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
                    disabled={rearmMutation.isPending}
                    onClick={() => rearmMutation.mutate(a.id)}
                    title="Reset alert — siap dipicu kembali"
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    Re-arm
                  </Button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/* ---------- Main Panel ---------- */
export function AlertsPanel() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api.alerts(),
    refetchInterval: 10_000,
  })

  const alerts = data?.alerts ?? []
  const active = alerts.filter((a) => !a.triggered)
  const triggered = alerts.filter((a) => a.triggered)

  // Mutation to persist trigger state to DB + fire webhook (server-side).
  const triggerAlert = useMutation({
    mutationFn: (alertId: string) =>
      api.updateAlert(alertId, {
        triggered: true,
        triggeredAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
    },
    onError: (e: Error) => {
      console.error('Failed to persist alert trigger:', e.message)
    },
  })

  // Live trigger detection
  const firedRef = useRef<Set<string>>(new Set())
  const prevPriceRef = useRef<Record<string, number | undefined>>({})
  const tickers = useFeed((s) => s.tickers)

  useEffect(() => {
    for (const alert of active) {
      if (!alert.active) continue
      if (firedRef.current.has(alert.id)) continue
      if (triggerAlert.isPending) continue
      const cur = tickers[alert.symbol]?.price
      const prev = prevPriceRef.current[alert.symbol]
      if (cur == null) continue
      if (shouldFire(alert, prev, cur)) {
        firedRef.current.add(alert.id)
        // Persist trigger state to DB — server fires webhook on its side too.
        triggerAlert.mutate(alert.id)
        toast.success('🔔 Alert Triggered!', {
          description: `${alert.symbol} ${alert.condition.replace('_', ' ')} ${fmtPrice(alert.symbol, alert.price)} — current ${fmtPrice(alert.symbol, cur)}`,
          duration: 8000,
        })
      }
    }
    // Update prev prices
    for (const sym of SUPPORTED_SYMBOLS) {
      prevPriceRef.current[sym] = tickers[sym]?.price ?? prevPriceRef.current[sym]
    }
  }, [tickers, active, triggerAlert])

  // Clean up fired set when alerts get removed
  useEffect(() => {
    const validIds = new Set(alerts.map((a) => a.id))
    for (const id of Array.from(firedRef.current)) {
      if (!validIds.has(id)) firedRef.current.delete(id)
    }
  }, [alerts])

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <BellRing className="h-5 w-5" />
            </span>
            Price Alerts
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor 4 pair utama dengan notifikasi email & visual.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
            Live Monitor
          </span>
          <span className="font-mono tabular">{active.length} active · {triggered.length} triggered</span>
        </div>
      </div>

      {/* Live strip */}
      <LiveMonitorStrip />

      {/* Create form */}
      <CreateAlertForm />

      {/* Active alerts list */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-emerald-500/[0.06] to-transparent" />
        <CardHeader className="relative pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-emerald-400" />
            Active Alerts
            <Badge variant="outline" className="ml-1">{active.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Harga live dari websocket. Progress bar menunjukkan kedekatan dengan target.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <AlertSkeletonRow key={i} />
              ))}
            </div>
          ) : active.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <div className="relative">
                <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-emerald-500/10 blur-2xl" />
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-emerald-500/30 bg-emerald-500/5">
                  <Bell className="h-7 w-7 text-emerald-400/60" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Belum ada alert aktif</p>
                <p className="text-xs text-muted-foreground/70 max-w-xs">
                  Buat alert harga pertama Anda di atas — dapatkan notifikasi visual & email ketika market menyentuh target.
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-1 text-[10px] text-emerald-300">
                <Sparkles className="h-3 w-3" />
                Tip: klik "Use Current" untuk pre-fill harga live
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scroll-thin pr-1">
              <AnimatePresence mode="popLayout">
                {active.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Triggered history */}
      <TriggeredHistory alerts={triggered} />
    </div>
  )
}

export default AlertsPanel
