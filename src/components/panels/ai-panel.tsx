'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Brain, RefreshCw, Loader2, Activity, Sparkles, Target, Clock,
  TrendingUp, TrendingDown, Minus, Gauge, Cpu, Database, Zap,
  ChevronDown, ChevronRight, History, Filter, BarChart3, Wand2,
  AlertCircle, Bot,
} from 'lucide-react'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer,
} from 'recharts'

import { api } from '@/lib/api'
import type { AiSignal, Log } from '@/lib/types'
import { SUPPORTED_SYMBOLS, SYMBOL_LABEL, SYMBOL_BASE } from '@/lib/types'
import { useTicker } from '@/hooks/use-price-feed'
import { fmtPrice, fmtPct, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from '@/components/ui/collapsible'
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

/* ------------------------------------------------------------------ */
/*  Factor parsing helpers                                             */
/* ------------------------------------------------------------------ */

type FactorKey =
  | 'central_bank' | 'economic_data' | 'geopolitics' | 'fiscal'
  | 'commodity' | 'sentiment' | 'breaking'

const FACTOR_LABEL: Record<FactorKey, string> = {
  central_bank: 'Bank Sentral',
  economic_data: 'Data Ekonomi',
  geopolitics: 'Geopolitik',
  fiscal: 'Fiskal',
  commodity: 'Komoditas',
  sentiment: 'Sentimen',
  breaking: 'Breaking',
}

// Map of all known raw JSON keys → canonical factor key.
// Covers snake_case, camelCase, and news-category aliases used by the LLM.
const FACTOR_KEY_ALIASES: Record<string, FactorKey> = {
  central_bank: 'central_bank',
  centralBank: 'central_bank',
  economic_data: 'economic_data',
  economicData: 'economic_data',
  cpi: 'economic_data',
  ppi: 'economic_data',
  gdp: 'economic_data',
  nfp: 'economic_data',
  unemployment: 'economic_data',
  retail: 'economic_data',
  pmi: 'economic_data',
  geopolitics: 'geopolitics',
  geopolitical: 'geopolitics',
  fiscal: 'fiscal',
  commodity: 'commodity',
  commodities: 'commodity',
  sentiment: 'sentiment',
  breaking: 'breaking',
}

function normalizeFactorValue(v: number): number {
  if (Number.isNaN(v)) return 0
  // If magnitude > 1, assume 0..100 (or -100..100) scale → divide by 100.
  if (Math.abs(v) > 1) return Math.max(-1, Math.min(1, v / 100))
  return Math.max(-1, Math.min(1, v))
}

function parseFactors(raw: string): { key: FactorKey; label: string; value: number }[] {
  try {
    const obj = JSON.parse(raw) as Record<string, number>
    const out: { key: FactorKey; label: string; value: number }[] = []
    const seen = new Set<FactorKey>()
    for (const k of Object.keys(obj)) {
      const canonical = FACTOR_KEY_ALIASES[k]
      if (!canonical || seen.has(canonical)) continue
      seen.add(canonical)
      out.push({ key: canonical, label: FACTOR_LABEL[canonical], value: normalizeFactorValue(Number(obj[k]) || 0) })
    }
    return out
  } catch {
    return []
  }
}

function parseIndicators(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) return arr.map((x) => String(x))
    return []
  } catch {
    return []
  }
}

const DIRECTION_CFG = {
  long: { label: 'LONG', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40', icon: TrendingUp },
  short: { label: 'SHORT', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/40', icon: TrendingDown },
  neutral: { label: 'NEUTRAL', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/40', icon: Minus },
} as const

const ACTION_CFG = {
  buy: { label: 'BUY', cls: 'bg-emerald-500 text-emerald-950' },
  sell: { label: 'SELL', cls: 'bg-rose-500 text-rose-950' },
  wait: { label: 'WAIT', cls: 'bg-amber-500 text-amber-950' },
} as const

/* ------------------------------------------------------------------ */
/*  Engine status header                                               */
/* ------------------------------------------------------------------ */

function EngineHeader({
  settings, totalSignals, latestAccuracy, lastSignalTime,
  onAnalyzeAll, analyzingAll,
  onAutoTrade, autoTrading, autoTradeEnabled,
}: {
  settings: Record<string, string>
  totalSignals: number
  latestAccuracy: number
  lastSignalTime: string | null
  onAnalyzeAll: () => void
  analyzingAll: boolean
  onAutoTrade: () => void
  autoTrading: boolean
  autoTradeEnabled: boolean
}) {
  const mlOn = String(settings.mlSelfLearning ?? 'true') === 'true'
  const modelVersion = settings.aiModelVersion ?? 'fx-scalper-v1'
  const lastTraining = settings.lastTrainingTime ?? null

  return (
    <Card className="p-4 md:p-6 gap-0">
      <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
        {/* Pulsing AI status */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/40">
              <Brain className="h-6 w-6 text-emerald-400" />
            </div>
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 live-dot border-2 border-background" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold">AI Online</span>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 px-1.5 py-0 text-[10px]">
                <Cpu className="h-2.5 w-2.5" /> {modelVersion}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Self-learning: <span className={mlOn ? 'text-emerald-400 font-medium' : 'text-muted-foreground'}>
                {mlOn ? 'ON' : 'OFF'}
              </span>
              {lastTraining && <> • Last train {relativeTime(lastTraining)}</>}
            </span>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4 md:gap-6">
          <MetricCell
            icon={Gauge} label="Rolling Accuracy"
            value={`${latestAccuracy.toFixed(1)}%`}
            sub="last 100 signals"
            tone={latestAccuracy >= 60 ? 'bull' : latestAccuracy >= 50 ? 'warn' : 'bear'}
          />
          <MetricCell
            icon={Sparkles} label="Total Signals"
            value={totalSignals.toString()}
            sub="generated all-time"
          />
          <MetricCell
            icon={Activity} label="Active Pairs"
            value={`${SUPPORTED_SYMBOLS.length}`}
            sub="M5 timeframe"
          />
        </div>

        {/* Analyze all + Auto-trade */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={onAnalyzeAll}
            disabled={analyzingAll}
            className="gap-2 bg-emerald-500 text-emerald-950 hover:bg-emerald-500/90"
          >
            {analyzingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {analyzingAll ? 'Menganalisa...' : 'Analisa Ulang Semua Pair'}
          </Button>
          <Button
            onClick={onAutoTrade}
            disabled={autoTrading}
            variant={autoTradeEnabled ? 'default' : 'outline'}
            className={cn(
              'gap-2 text-xs h-9',
              autoTradeEnabled
                ? 'bg-violet-500 text-white hover:bg-violet-500/90 border-violet-400'
                : 'border-violet-500/40 text-violet-400 hover:bg-violet-500/10',
            )}
            title={autoTradeEnabled ? 'Auto-trading AKTIF — klik untuk scan & eksekusi sinyal' : 'Aktifkan auto-trading di Risk Management panel'}
          >
            {autoTrading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
            {autoTrading ? 'Mengeksekusi...' : autoTradeEnabled ? '🤖 Auto-Trade Sekarang' : 'Auto-Trade (OFF)'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function MetricCell({
  icon: Icon, label, value, sub, tone,
}: {
  icon: any
  label: string
  value: string
  sub?: string
  tone?: 'bull' | 'bear' | 'warn'
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/60 border border-border shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</span>
        <span className={cn(
          'text-lg font-mono font-bold tabular',
          tone === 'bull' && 'text-bull',
          tone === 'bear' && 'text-bear',
          tone === 'warn' && 'text-warn',
        )}>
          {value}
        </span>
        {sub && <span className="text-[10px] text-muted-foreground truncate">{sub}</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Confidence gauge                                                   */
/* ------------------------------------------------------------------ */

function ConfidenceGauge({ value, action }: { value: number; action: 'buy' | 'sell' | 'wait' }) {
  const v = Math.max(0, Math.min(100, value))
  const color = action === 'wait' ? 'var(--warn)' : action === 'buy' ? 'var(--bull)' : 'var(--bear)'
  const R = 28
  const C = 2 * Math.PI * R
  const offset = C - (v / 100) * C
  return (
    <div className="relative h-[80px] w-[80px] shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={R} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={R} fill="none" stroke={color}
          strokeWidth="6" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-mono font-bold tabular leading-none" style={{ color }}>{v.toFixed(0)}%</span>
        <span className="text-[9px] text-muted-foreground uppercase">conf</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Factor bars (-1..+1)                                               */
/* ------------------------------------------------------------------ */

function FactorBars({ factors }: { factors: { key: FactorKey; label: string; value: number }[] }) {
  if (factors.length === 0) {
    return <p className="text-[11px] text-muted-foreground italic">Belum ada data faktor.</p>
  }
  return (
    <div className="space-y-1.5">
      {factors.map((f) => {
        const v = Math.max(-1, Math.min(1, f.value))
        const pct = Math.abs(v) * 50 // 0..50 (half width)
        const pos = v >= 0
        return (
          <div key={f.key} className="flex items-center gap-2">
            <span className="text-[10px] w-24 shrink-0 text-muted-foreground">{f.label}</span>
            <div className="relative flex-1 h-3 rounded bg-muted/40 overflow-hidden">
              {/* center line */}
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
              <div
                className={cn(
                  'absolute top-0 bottom-0 rounded-sm',
                  pos ? 'bg-emerald-500/70' : 'bg-rose-500/70',
                )}
                style={{
                  left: pos ? '50%' : `${50 - pct}%`,
                  width: `${pct}%`,
                  transition: 'all 0.4s ease',
                }}
              />
            </div>
            <span className={cn(
              'text-[10px] font-mono tabular w-8 text-right shrink-0',
              pos ? 'text-bull' : 'text-bear',
            )}>
              {v >= 0 ? '+' : ''}{v.toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function FactorRadar({ factors }: { factors: { key: FactorKey; label: string; value: number }[] }) {
  if (factors.length < 3) return <FactorBars factors={factors} />
  const data = factors.map((f) => ({
    factor: f.label,
    value: Math.max(-1, Math.min(1, f.value)) * 100,
  }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="factor" tick={{ fill: 'var(--muted-foreground)', fontSize: 9 }} />
        <PolarRadiusAxis domain={[-100, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke="var(--bull)" fill="var(--bull)" fillOpacity={0.35} strokeWidth={1.5} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------------------ */
/*  Signal card (one per symbol)                                       */
/* ------------------------------------------------------------------ */

function SignalCard({ symbol }: { symbol: string }) {
  const qc = useQueryClient()
  const ticker = useTicker(symbol)
  const [view, setView] = useState<'radar' | 'bars'>('radar')
  const [timeframe, setTimeframe] = useState<'M1' | 'M5' | 'M15' | 'H1'>('M5')

  const signalQ = useQuery({
    queryKey: ['ai-signal', symbol],
    queryFn: () => api.aiSignals(symbol, 1),
    refetchInterval: 30000,
  })
  const signal: AiSignal | undefined = signalQ.data?.signals?.[0]

  const analyzeMutation = useMutation({
    mutationFn: () => api.aiAnalyze(symbol, timeframe),
    onSuccess: (res) => {
      toast.success(`Analisa ${symbol} selesai`, {
        description: `${DIRECTION_CFG[res.signal.direction].label} • ${res.signal.confidence.toFixed(0)}% confidence`,
      })
      qc.invalidateQueries({ queryKey: ['ai-signal', symbol] })
      qc.invalidateQueries({ queryKey: ['ai-signals-all'] })
      qc.invalidateQueries({ queryKey: ['ai-signals-feed'] })
    },
    onError: (e: any) => toast.error(`Gagal menganalisa ${symbol}`, { description: e.message }),
  })

  const executeMutation = useMutation({
    mutationFn: (body: any) => api.openTrade(body),
    onSuccess: (res) => {
      toast.success(`Sinyal AI dieksekusi: ${res.trade.symbol} ${res.trade.side.toUpperCase()}`, {
        description: `${res.trade.lotSize} lot @ ${fmtPrice(res.trade.symbol, res.trade.openPrice)}`,
      })
      qc.invalidateQueries({ queryKey: ['trades'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: any) => toast.error('Gagal eksekusi sinyal', { description: e.message }),
  })

  const factors = useMemo(
    () => (signal ? parseFactors(signal.factors) : []),
    [signal],
  )
  const indicators = useMemo(
    () => (signal ? parseIndicators(signal.selectedIndicators) : []),
    [signal],
  )

  const dirCfg = signal ? DIRECTION_CFG[signal.direction] : DIRECTION_CFG.neutral
  const actCfg = signal ? ACTION_CFG[signal.action] : ACTION_CFG.wait
  const DirIcon = dirCfg.icon

  // Execute signal: lot from risk (calc client-side using SYMBOL_BASE), SL 10p, TP 15p
  const buildExecBody = () => {
    if (!signal) return null
    const base = SYMBOL_BASE[symbol]
    const refPrice = ticker?.price ?? base?.price ?? 1
    const slPips = 10, tpPips = 15
    // simple lot calc: assume balance 10000, risk 0.75% (placeholder; backend can re-compute)
    const vppPerLot = symbol === 'USDJPY'
      ? (100000 * base.pip) / refPrice
      : symbol === 'XAUUSD'
        ? 100 * base.pip
        : 100000 * base.pip
    const riskAmount = 10000 * 0.0075
    const lot = Number(Math.max(0.01, Math.floor((riskAmount / (slPips * vppPerLot)) * 100) / 100).toFixed(2))
    const side = signal.action === 'buy' ? 'buy' : 'sell'
    const entry = side === 'buy' ? (ticker?.ask ?? refPrice) : (ticker?.bid ?? refPrice)
    const sl = side === 'buy' ? entry - slPips * base.pip : entry + slPips * base.pip
    const tp = side === 'buy' ? entry + tpPips * base.pip : entry - tpPips * base.pip
    return {
      accountId: undefined, // backend will pick default
      symbol, side, lotSize: lot,
      stopLoss: sl, takeProfit: tp,
      source: 'ai' as const,
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="p-4 gap-3 h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{SYMBOL_LABEL[symbol]}</span>
            <span className="text-lg font-mono font-bold tabular">
              {ticker ? fmtPrice(symbol, ticker.price) : '—'}
              <span className={cn(
                'ml-2 text-xs font-medium',
                (ticker?.changePct ?? 0) >= 0 ? 'text-bull' : 'text-bear',
              )}>
                {ticker ? fmtPct(ticker.changePct) : ''}
              </span>
            </span>
          </div>
          {signal && (
            <Badge className={cn('gap-1 px-2 py-0.5 text-[10px] uppercase border', dirCfg.cls)}>
              <DirIcon className="h-3 w-3" />
              {dirCfg.label}
            </Badge>
          )}
        </div>

        {signalQ.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !signal ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">Belum ada sinyal. Jalankan analisa.</p>
          </div>
        ) : (
          <>
            {/* Confidence + Action */}
            <div className="flex items-center gap-3 rounded-md bg-muted/30 border border-border p-3">
              <ConfidenceGauge value={signal.confidence} action={signal.action} />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-muted-foreground">Action</span>
                  <Badge className={cn('px-2 py-0.5 text-xs font-bold', actCfg.cls)}>{actCfg.label}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-muted-foreground">Timeframe</span>
                  <span className="text-xs font-mono tabular">{signal.timeframe}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-muted-foreground">Accuracy</span>
                  <span className="text-xs font-mono tabular text-emerald-400">{signal.accuracy.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-muted-foreground">Updated</span>
                  <span className="text-xs text-muted-foreground">{relativeTime(signal.createdAt)}</span>
                </div>
              </div>
            </div>

            {/* Factor chart toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                7-Dimension Analysis
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost" size="sm"
                  className={cn('h-6 px-2 text-[10px] gap-1', view === 'radar' && 'bg-muted')}
                  onClick={() => setView('radar')}
                >
                  <BarChart3 className="h-3 w-3" /> Radar
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className={cn('h-6 px-2 text-[10px] gap-1', view === 'bars' && 'bg-muted')}
                  onClick={() => setView('bars')}
                >
                  <BarChart3 className="h-3 w-3" /> Bars
                </Button>
              </div>
            </div>
            {view === 'radar' ? <FactorRadar factors={factors} /> : <FactorBars factors={factors} />}

            {/* Indicators */}
            {indicators.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Indikator Aktif
                </span>
                <div className="flex flex-wrap gap-1">
                  {indicators.slice(0, 8).map((ind, i) => (
                    <Badge key={i} variant="outline" className="px-1.5 py-0 text-[10px] font-mono">
                      {ind}
                    </Badge>
                  ))}
                  {indicators.length > 8 && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
                      +{indicators.length - 8}
                    </Badge>
                  )}
                </div>
              </div>
            )}

            {/* Reasoning */}
            <div className="rounded-md bg-muted/20 border border-border p-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reasoning
              </span>
              <p className="text-xs leading-relaxed mt-1 text-foreground/90 line-clamp-4">
                {signal.reasoning}
              </p>
            </div>

            {/* Timeframe selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">TF:</span>
              {(['M1', 'M5', 'M15', 'H1'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  disabled={analyzeMutation.isPending}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all',
                    timeframe === tf
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                className="flex-1 gap-1.5"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
              >
                {analyzeMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
                Analisa {symbol} · {timeframe}
              </Button>
              {signal.action !== 'wait' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      className={cn(
                        'flex-1 gap-1.5',
                        signal.action === 'buy'
                          ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-500/90'
                          : 'bg-rose-500 text-rose-950 hover:bg-rose-500/90',
                      )}
                      disabled={executeMutation.isPending}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Eksekusi Sinyal
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eksekusi sinyal AI {symbol}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Akan membuka posisi <strong className={signal.action === 'buy' ? 'text-bull' : 'text-bear'}>
                          {signal.action.toUpperCase()}
                        </strong> pada {SYMBOL_LABEL[symbol]}.
                        SL 10 pips, TP 15 pips (RR 1:1.5), lot dihitung dari risk 0.75% balance.
                        Sumber: <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 ml-1 px-1.5 py-0 text-[10px]">AI</Badge>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction
                        className={cn(
                          signal.action === 'buy'
                            ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-500/90'
                            : 'bg-rose-500 text-rose-950 hover:bg-rose-500/90',
                        )}
                        onClick={() => {
                          const body = buildExecBody()
                          if (body) executeMutation.mutate(body)
                        }}
                      >
                        {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Konfirmasi & Eksekusi
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </>
        )}
      </Card>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Auto-selection rationale                                           */
/* ------------------------------------------------------------------ */

function AutoSelectionCard({
  signals,
}: {
  signals: AiSignal[]
}) {
  // pick best signal: highest |confidence| with action != wait
  const best = useMemo(() => {
    const actionable = signals.filter((s) => s.action !== 'wait')
    if (actionable.length === 0) return null
    return actionable.reduce((b, s) => (Math.abs(s.confidence) > Math.abs(b.confidence) ? s : b), actionable[0])
  }, [signals])

  const bestIndicators = best ? parseIndicators(best.selectedIndicators) : []
  const dirCfg = best ? DIRECTION_CFG[best.direction] : DIRECTION_CFG.neutral

  return (
    <Card className="p-4 md:p-6 gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">AI Auto-Selection Rationale</h3>
        </div>
        <Badge variant="outline" className="text-[10px] gap-1">
          <Sparkles className="h-2.5 w-2.5 text-amber-400" />
          Auto-picked by ML
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {/* Pair */}
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Activity className="h-3 w-3" /> Pair Terpilih
          </span>
          {best ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold">{best.symbol}</span>
                <Badge className={cn('px-1.5 py-0 text-[10px] uppercase border', dirCfg.cls)}>
                  {dirCfg.label}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Confidence {best.confidence.toFixed(0)}% — tertinggi di antara pair yang actionable.
              </p>
            </>
          ) : (
            <>
              <span className="text-base font-bold text-muted-foreground">—</span>
              <p className="text-[11px] text-muted-foreground">
                Tidak ada sinyal actionable saat ini. AI menunggu konfirmasi.
              </p>
            </>
          )}
        </div>

        {/* Timeframe */}
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Timeframe
          </span>
          <span className="text-base font-bold font-mono">M5</span>
          <p className="text-[11px] text-muted-foreground">
            Scalping window 5-menit memberi rasio signal-to-noise optimal untuk volatilitas intraday.
          </p>
        </div>

        {/* Indicators */}
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Database className="h-3 w-3" /> Indikator Aktif
          </span>
          {bestIndicators.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-1 mt-1">
                {bestIndicators.slice(0, 4).map((ind, i) => (
                  <Badge key={i} variant="outline" className="px-1.5 py-0 text-[10px] font-mono">
                    {ind}
                  </Badge>
                ))}
                {bestIndicators.length > 4 && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
                    +{bestIndicators.length - 4}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                AI memilih indikator ini dari pool 30 berdasarkan weight & kategori.
              </p>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Belum ada data indikator.</span>
          )}
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Signal history feed                                                */
/* ------------------------------------------------------------------ */

function SignalHistoryFeed({ signals }: { signals: AiSignal[] }) {
  const [filter, setFilter] = useState<string>('all')

  const filtered = useMemo(
    () => filter === 'all' ? signals : signals.filter((s) => s.symbol === filter),
    [signals, filter],
  )

  return (
    <Card className="p-4 md:p-6 gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold">AI Signal History</h3>
          <Badge variant="outline" className="text-[10px]">{filtered.length} signals</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Pair</SelectItem>
              {SUPPORTED_SYMBOLS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto scroll-thin rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 sticky top-0">
              <TableHead className="text-[11px]">Time</TableHead>
              <TableHead className="text-[11px]">Symbol</TableHead>
              <TableHead className="text-[11px]">Direction</TableHead>
              <TableHead className="text-[11px] text-right">Conf</TableHead>
              <TableHead className="text-[11px]">Action</TableHead>
              <TableHead className="text-[11px] text-right">Acc</TableHead>
              <TableHead className="text-[11px]">Reasoning</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence initial={false}>
              {filtered.map((s) => {
                const dirCfg = DIRECTION_CFG[s.direction]
                const actCfg = ACTION_CFG[s.action]
                const DirIcon = dirCfg.icon
                return (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-muted/30"
                  >
                    <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap font-mono tabular">
                      {relativeTime(s.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-xs">{s.symbol}</TableCell>
                    <TableCell>
                      <Badge className={cn('gap-1 px-1.5 py-0 text-[10px] uppercase border', dirCfg.cls)}>
                        <DirIcon className="h-2.5 w-2.5" />
                        {dirCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-xs">
                      {s.confidence.toFixed(0)}%
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('px-1.5 py-0 text-[10px] font-bold', actCfg.cls)}>
                        {actCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular text-xs text-emerald-400">
                      {s.accuracy.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground max-w-[280px] truncate">
                      {s.reasoning}
                    </TableCell>
                  </motion.tr>
                )
              })}
            </AnimatePresence>
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Tidak ada sinyal pada filter ini.
          </div>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Self-learning log (collapsible)                                    */
/* ------------------------------------------------------------------ */

function SelfLearningLog({ logs }: { logs: Log[] }) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="p-4 md:p-6 gap-0">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between text-left">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/15 border border-emerald-500/40">
                <Brain className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Self-Learning Log</h3>
                <p className="text-[11px] text-muted-foreground">
                  Jejak "AI belajar sendiri" — {logs.length} entri terbaru
                </p>
              </div>
            </div>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Separator className="my-3" />
          <div className="max-h-80 overflow-y-auto scroll-thin pl-3">
            <div className="relative">
              {/* vertical timeline line */}
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-border" />
              <div className="space-y-2.5">
                {logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic pl-5">Belum ada log self-learning.</p>
                ) : logs.map((l) => (
                  <motion.div
                    key={l.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative flex items-start gap-3 pl-3"
                  >
                    <span className={cn(
                      'absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background',
                      l.level === 'warn' ? 'bg-amber-500' : l.level === 'error' ? 'bg-rose-500' : 'bg-emerald-500',
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono tabular whitespace-nowrap">
                          {relativeTime(l.createdAt)}
                        </span>
                        <Badge variant="outline" className="px-1.5 py-0 text-[9px] uppercase">
                          {l.level}
                        </Badge>
                      </div>
                      <p className="text-xs leading-snug mt-0.5 text-foreground/90">{l.message}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

/* ------------------------------------------------------------------ */
/*  AI Quality card (r11-AI: real accuracy from evaluated outcomes)    */
/* ------------------------------------------------------------------ */

function AiQualityCard() {
  const qc = useQueryClient()
  const [evaluating, setEvaluating] = useState(false)

  const qualityQ = useQuery({
    queryKey: ['ai-quality'],
    queryFn: () => api.aiQuality(),
    refetchInterval: 30000,
  })

  const overall = qualityQ.data?.overall ?? {
    accuracy: 0, totalEvaluated: 0, correctCount: 0, wrongCount: 0, avgPipsMoved: 0,
  }
  const bySymbol = qualityQ.data?.bySymbol ?? {}

  const onEvaluate = async () => {
    setEvaluating(true)
    try {
      const res = await api.aiEvaluate()
      if (res.evaluated > 0) {
        toast.success(`📊 ${res.evaluated} signals evaluated`, {
          description: `${res.correct} correct, ${res.wrong} wrong, ${res.skipped} skipped`,
        })
      } else {
        toast.info('No signals to evaluate', {
          description: `${res.skipped} signals skipped (too young or neutral)`,
        })
      }
      qc.invalidateQueries({ queryKey: ['ai-quality'] })
    } catch (e: any) {
      toast.error('Evaluation failed', { description: e.message })
    } finally {
      setEvaluating(false)
    }
  }

  const accColor = overall.accuracy >= 70 ? 'text-emerald-400' : overall.accuracy >= 50 ? 'text-amber-400' : 'text-rose-400'
  const accBg = overall.accuracy >= 70 ? 'from-emerald-500/15' : overall.accuracy >= 50 ? 'from-amber-500/15' : 'from-rose-500/15'

  return (
    <Card className="relative overflow-hidden">
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent', accBg)} />
      <CardHeader className="relative pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-violet-400" />
            AI Signal Quality
            <Badge variant="outline" className="ml-1 text-[10px] border-violet-500/40 bg-violet-500/10 text-violet-300">
              REAL
            </Badge>
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={onEvaluate}
            disabled={evaluating}
            className="h-7 text-[11px] border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
          >
            {evaluating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
            Evaluate Pending
          </Button>
        </div>
        <CardDescription className="text-xs">
          Akurasi dihitung dari outcome nyata — bukan estimasi random
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">
        {overall.totalEvaluated === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Target className="h-10 w-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Belum ada signal yang dievaluasi</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Klik "Evaluate Pending" untuk mengevaluasi signal yang sudah cukup umur (≥30 min)
            </p>
          </div>
        ) : (
          <>
            {/* Overall stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Accuracy</div>
                <div className={cn('text-2xl font-bold font-mono tabular', accColor)}>
                  {overall.accuracy.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Evaluated</div>
                <div className="text-2xl font-bold font-mono tabular text-foreground">
                  {overall.totalEvaluated}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Correct</div>
                <div className="text-2xl font-bold font-mono tabular text-emerald-400">
                  {overall.correctCount}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card/50 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Pips</div>
                <div className={cn(
                  'text-2xl font-bold font-mono tabular',
                  overall.avgPipsMoved >= 0 ? 'text-emerald-400' : 'text-rose-400',
                )}>
                  {overall.avgPipsMoved > 0 ? '+' : ''}{overall.avgPipsMoved.toFixed(1)}
                </div>
              </div>
            </div>

            {/* Per-symbol breakdown */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Per-Symbol Breakdown
              </div>
              {SUPPORTED_SYMBOLS.map((sym) => {
                const s = bySymbol[sym]
                if (!s || s.totalEvaluated === 0) return null
                const color = s.accuracy >= 70 ? 'text-emerald-400' : s.accuracy >= 50 ? 'text-amber-400' : 'text-rose-400'
                const barColor = s.accuracy >= 70 ? 'bg-emerald-500' : s.accuracy >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                return (
                  <div key={sym} className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                    <Badge variant="secondary" className="font-mono text-[11px] w-20 justify-center">{sym}</Badge>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn('text-sm font-mono font-semibold tabular', color)}>
                          {s.accuracy.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {s.correctCount}/{s.totalEvaluated} · avg {s.avgPipsMoved > 0 ? '+' : ''}{s.avgPipsMoved.toFixed(1)} pips
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', barColor)}
                          style={{ width: `${s.accuracy}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Main panel                                                         */
/* ------------------------------------------------------------------ */

export function AiPanel() {
  const qc = useQueryClient()
  const [analyzingAll, setAnalyzingAll] = useState(false)
  const [autoTrading, setAutoTrading] = useState(false)

  // Risk settings for mlSelfLearning flag + model version
  const riskQ = useQuery({ queryKey: ['risk'], queryFn: () => api.risk() })
  const settings = riskQ.data?.settings ?? {}
  const autoTradeEnabled = String(settings.autoTradingEnabled ?? 'false') === 'true'

  // All signals (for history feed + count + accuracy avg)
  const allSignalsQ = useQuery({
    queryKey: ['ai-signals-feed'],
    queryFn: () => api.aiSignals(undefined, 30),
    refetchInterval: 30000,
  })
  const allSignals = allSignalsQ.data?.signals ?? []

  // Latest accuracy: take the most recent signal's accuracy field
  const latestAccuracy = allSignals.length > 0
    ? allSignals[0].accuracy
    : Number(settings.aiAccuracy ?? 67.5)

  // Total signals — needs the full count (not just 30). Use a separate query with high limit.
  const totalQ = useQuery({
    queryKey: ['ai-signals-total'],
    queryFn: () => api.aiSignals(undefined, 1000),
    refetchInterval: 60000,
  })
  const totalSignals = totalQ.data?.signals?.length ?? 0

  // Self-learning logs
  const logsQ = useQuery({
    queryKey: ['logs', 'ai'],
    queryFn: () => api.logs({ source: 'ai', limit: 30 }),
    refetchInterval: 30000,
  })
  const aiLogs = logsQ.data?.logs ?? []

  // Last signal time
  const lastSignalTime = allSignals.length > 0 ? allSignals[0].createdAt : null

  const onAnalyzeAll = async () => {
    setAnalyzingAll(true)
    let ok = 0, fail = 0
    for (let i = 0; i < SUPPORTED_SYMBOLS.length; i++) {
      const s = SUPPORTED_SYMBOLS[i]
      toast.info(`Menganalisa ${s}...`, {
        description: `Pair ${i + 1} dari ${SUPPORTED_SYMBOLS.length}`,
        id: `analyze-${s}`,
      })
      try {
        await api.aiAnalyze(s)
        ok++
        toast.success(`${s} selesai`, { id: `analyze-${s}` })
      } catch (e: any) {
        fail++
        toast.error(`Gagal ${s}`, { id: `analyze-${s}`, description: e.message })
      }
    }
    setAnalyzingAll(false)
    qc.invalidateQueries({ queryKey: ['ai-signal'] })
    qc.invalidateQueries({ queryKey: ['ai-signals-feed'] })
    qc.invalidateQueries({ queryKey: ['ai-signals-total'] })
    if (ok > 0) {
      toast.success(`Analisa ulang selesai`, {
        description: `${ok} berhasil${fail > 0 ? `, ${fail} gagal` : ''}`,
      })
    }
  }

  const onAutoTrade = async () => {
    setAutoTrading(true)
    try {
      const res = await api.aiAutoTrade()
      if (!res.enabled) {
        toast.warning('Auto-trade dinonaktifkan', {
          description: res.message,
        })
      } else if (res.executed.length > 0) {
        toast.success(`🤖 ${res.executed.length} auto-trade dieksekusi`, {
          description: res.executed.map((t: any) => `${t.side.toUpperCase()} ${t.lot} ${t.symbol} @ ${t.openPrice}`).join(' • '),
        })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        qc.invalidateQueries({ queryKey: ['trades'] })
        qc.invalidateQueries({ queryKey: ['risk-usage'] })
      } else {
        toast.info('Tidak ada sinyal yang dieksekusi', {
          description: res.message,
        })
      }
    } catch (e: any) {
      toast.error('Gagal auto-trade', { description: e.message })
    } finally {
      setAutoTrading(false)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* A. Engine header */}
      <EngineHeader
        settings={settings}
        totalSignals={totalSignals}
        latestAccuracy={latestAccuracy}
        lastSignalTime={lastSignalTime}
        onAnalyzeAll={onAnalyzeAll}
        analyzingAll={analyzingAll}
        onAutoTrade={onAutoTrade}
        autoTrading={autoTrading}
        autoTradeEnabled={autoTradeEnabled}
      />

      {/* A2. AI Quality card (r11-AI: real accuracy from outcomes) */}
      <AiQualityCard />

      {/* B. Signal cards grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Latest AI Signals
          </h2>
          <span className="text-[11px] text-muted-foreground">Auto-refresh 30s</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {SUPPORTED_SYMBOLS.map((s) => (
            <SignalCard key={s} symbol={s} />
          ))}
        </div>
      </div>

      {/* C. Auto-selection rationale */}
      <AutoSelectionCard signals={allSignals} />

      {/* D. Signal history feed */}
      <SignalHistoryFeed signals={allSignals} />

      {/* E. Self-learning log */}
      <SelfLearningLog logs={aiLogs} />
    </div>
  )
}
