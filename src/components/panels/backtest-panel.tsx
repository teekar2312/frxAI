'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'framer-motion'
import {
  Activity,
  CalendarRange,
  Gauge,
  History,
  Info,
  Layers,
  Loader2,
  Play,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import type { Backtest } from '@/lib/types'
import { SUPPORTED_SYMBOLS, SYMBOL_LABEL } from '@/lib/types'
import { fmtMoney, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'

/* ---------------- helpers ---------------- */

function isoDays(offset: number): string {
  const d = new Date(Date.now() + offset * 86400000)
  return d.toISOString().slice(0, 10)
}

function defaultName(symbol: string): string {
  return `BT ${symbol} ${isoDays(0)}`
}

interface EquityPoint { t: number; equity: number }
interface TradeRow {
  open: number
  close: number
  side: 'buy' | 'sell'
  pnl: number
  t: number
}

function parseEquity(json: string | null | undefined): EquityPoint[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json) as EquityPoint[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function parseTrades(json: string | null | undefined): TradeRow[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json) as TradeRow[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

/* ---------------- chart tooltip ---------------- */

function ChartTooltip({ active, payload, label, fmt, labelFmt }: any) {
  if (!active || !payload?.length) return null
  const displayLabel =
    label !== undefined
      ? labelFmt
        ? labelFmt(label)
        : String(label)
      : null
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {displayLabel !== null && (
        <div className="mb-1 text-muted-foreground">{displayLabel}</div>
      )}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 tabular">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color || p.fill }}
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium text-foreground">
            {fmt ? fmt(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ---------------- KPI tile ---------------- */

function Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'bull' | 'bear' | 'warn' | 'neutral'
  icon: React.ComponentType<{ className?: string }>
}) {
  const toneClass =
    tone === 'bull'
      ? 'text-bull'
      : tone === 'bear'
        ? 'text-bear'
        : tone === 'warn'
          ? 'text-warn'
          : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5 opacity-70" />
      </div>
      <div className={`mt-1 text-lg font-semibold tabular ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}

/* ---------------- Strategy Optimizer ---------------- */

function StrategyOptimizer() {
  const [optimizing, setOptimizing] = useState(false)
  const [results, setResults] = useState<any[] | null>(null)
  const [summary, setSummary] = useState<any>(null)
  const [best, setBest] = useState<any>(null)
  const [sortBy, setSortBy] = useState<'score' | 'netProfit' | 'winRate' | 'profitFactor' | 'sharpeRatio'>('score')

  const onOptimize = async () => {
    setOptimizing(true)
    try {
      const data = await api.optimizeStrategies({
        periodFrom: isoDays(-7),
        periodTo: isoDays(0),
        initialCapital: 10000,
      })
      setResults(data.results)
      setSummary(data.summary)
      setBest(data.best)
      toast.success(`Optimasi selesai: ${data.summary.totalConfigs} konfigurasi`, {
        description: `${data.summary.profitableCount} profitable · Avg WR ${data.summary.avgWinRate}% · Best: ${data.best?.strategyName} ${data.best?.symbol}`,
      })
    } catch (e: any) {
      toast.error('Optimasi gagal', { description: e.message })
    } finally {
      setOptimizing(false)
    }
  }

  const sortedResults = useMemo(() => {
    if (!results) return []
    return [...results].sort((a, b) => {
      if (sortBy === 'winRate') return b.winRate - a.winRate
      if (sortBy === 'netProfit') return b.netProfit - a.netProfit
      if (sortBy === 'profitFactor') return b.profitFactor - a.profitFactor
      if (sortBy === 'sharpeRatio') return b.sharpeRatio - a.sharpeRatio
      return b.score - a.score
    })
  }, [results, sortBy])

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500'
    if (score >= 50) return 'text-amber-500'
    if (score >= 20) return 'text-rose-500'
    return 'text-muted-foreground'
  }

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15">
              <Trophy className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <CardTitle className="text-base">Strategy Optimizer</CardTitle>
              <CardDescription className="text-xs">
                Jalankan semua 7 strategi × 4 symbol (28 backtest) untuk menemukan konfigurasi terbaik
              </CardDescription>
            </div>
          </div>
          <Button
            onClick={onOptimize}
            disabled={optimizing}
            className="bg-violet-500 text-white hover:bg-violet-500/90 gap-1.5"
            size="sm"
          >
            {optimizing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Mengoptimasi 28 config...
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                Jalankan Optimasi
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-border/60 bg-card/50 p-3">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Total Configs</div>
              <div className="text-lg font-bold tabular font-mono">{summary.totalConfigs}</div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Profitable</div>
              <div className="text-lg font-bold tabular font-mono text-emerald-500">{summary.profitableCount}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/50 p-3">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Avg Win Rate</div>
              <div className="text-lg font-bold tabular font-mono">{summary.avgWinRate}%</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/50 p-3">
              <div className="text-[10px] font-semibold uppercase text-muted-foreground">Avg Profit Factor</div>
              <div className="text-lg font-bold tabular font-mono">{summary.avgProfitFactor}</div>
            </div>
          </div>
        )}

        {best && (
          <div className="rounded-lg border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-transparent p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-bold">Best Configuration</span>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 ml-auto">
                Score: {best.score}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="font-semibold">{best.strategyName}</span>
              <Badge variant="secondary">{best.symbol}</Badge>
              <Badge variant="outline">{best.timeframe}</Badge>
              <span className="text-emerald-500 font-mono tabular">+${best.netProfit.toFixed(2)}</span>
              <span className="text-muted-foreground">WR: {best.winRate.toFixed(1)}%</span>
              <span className="text-muted-foreground">PF: {best.profitFactor.toFixed(2)}</span>
              <span className="text-muted-foreground">Sharpe: {best.sharpeRatio.toFixed(2)}</span>
            </div>
          </div>
        )}

        {sortedResults.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Sort by:</span>
              {(['score', 'netProfit', 'winRate', 'profitFactor', 'sharpeRatio'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all',
                    sortBy === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {key === 'netProfit' ? 'Net P&L' : key === 'winRate' ? 'Win %' : key === 'profitFactor' ? 'PF' : key === 'sharpeRatio' ? 'Sharpe' : 'Score'}
                </button>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto scroll-thin rounded-lg border border-border/50">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="text-left p-2 font-semibold">#</th>
                    <th className="text-left p-2 font-semibold">Strategy</th>
                    <th className="text-left p-2 font-semibold">Symbol</th>
                    <th className="text-right p-2 font-semibold">Score</th>
                    <th className="text-right p-2 font-semibold">Trades</th>
                    <th className="text-right p-2 font-semibold">Win%</th>
                    <th className="text-right p-2 font-semibold">PF</th>
                    <th className="text-right p-2 font-semibold">Net P&L</th>
                    <th className="text-right p-2 font-semibold">Max DD</th>
                    <th className="text-right p-2 font-semibold">Sharpe</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((r, i) => (
                    <motion.tr
                      key={`${r.strategyId}-${r.symbol}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className={cn(
                        'border-b border-border/30 hover:bg-muted/30 transition-colors',
                        i === 0 && 'bg-emerald-500/[0.06]',
                        r.netProfit > 0 && i > 0 && 'bg-emerald-500/[0.02]',
                        r.netProfit < 0 && 'bg-rose-500/[0.02]',
                      )}
                    >
                      <td className="p-2 font-mono tabular text-muted-foreground">{i + 1}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          {i === 0 && <Trophy className="h-3 w-3 text-amber-500 shrink-0" />}
                          <span className="font-medium truncate max-w-[120px]" title={r.strategyName}>{r.strategyName}</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5 capitalize">{r.category}</Badge>
                      </td>
                      <td className="p-2 font-mono">{r.symbol}</td>
                      <td className={cn('p-2 text-right font-mono tabular font-bold', scoreColor(r.score))}>{r.score}</td>
                      <td className="p-2 text-right font-mono tabular">{r.totalTrades}</td>
                      <td className={cn('p-2 text-right font-mono tabular', r.winRate >= 50 ? 'text-emerald-500' : 'text-rose-500')}>{r.winRate.toFixed(1)}%</td>
                      <td className={cn('p-2 text-right font-mono tabular', r.profitFactor >= 1 ? 'text-emerald-500' : 'text-rose-500')}>{r.profitFactor.toFixed(2)}</td>
                      <td className={cn('p-2 text-right font-mono tabular font-semibold', r.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                        {r.netProfit >= 0 ? '+' : ''}{fmtMoney(r.netProfit)}
                      </td>
                      <td className="p-2 text-right font-mono tabular text-rose-500">-{r.maxDrawdown.toFixed(1)}%</td>
                      <td className={cn('p-2 text-right font-mono tabular', r.sharpeRatio >= 1 ? 'text-emerald-500' : r.sharpeRatio >= 0 ? 'text-amber-500' : 'text-rose-500')}>{r.sharpeRatio.toFixed(2)}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!results && !optimizing && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
              <Trophy className="h-6 w-6 text-violet-500/60" />
            </div>
            <p className="text-sm text-muted-foreground">Klik "Jalankan Optimasi" untuk membandingkan semua strategi</p>
            <p className="text-xs text-muted-foreground/70">28 backtest akan dijalankan (7 strategi × 4 symbol) — membutuhkan ~5 detik</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- main panel ---------------- */

export function BacktestPanel() {
  const qc = useQueryClient()

  // --- form state ---
  const today = isoDays(0)
  const weekAgo = isoDays(-7)
  const [name, setName] = useState(defaultName('EURUSD'))
  const [symbol, setSymbol] = useState<string>('EURUSD')
  const [strategy, setStrategy] = useState<string>('scalping-m5')
  const [periodFrom, setPeriodFrom] = useState<string>(weekAgo)
  const [periodTo, setPeriodTo] = useState<string>(today)
  const [initialCapital, setInitialCapital] = useState<number>(10000)
  const [riskPerTradePct, setRiskPerTradePct] = useState<number>(0.75)
  const [stopLossPips, setStopLossPips] = useState<number>(10)
  const [riskReward, setRiskReward] = useState<number>(1.5)

  // when symbol changes, refresh default name if user hasn't customized
  const [nameTouched, setNameTouched] = useState(false)
  const handleSymbolChange = (s: string) => {
    setSymbol(s)
    if (!nameTouched) setName(defaultName(s))
  }

  // --- data queries ---
  const strategiesQuery = useQuery({
    queryKey: ['strategies'],
    queryFn: () => api.strategies(),
    staleTime: 5 * 60 * 1000,
  })

  const backtestsQuery = useQuery({
    queryKey: ['backtests', undefined, 20],
    queryFn: () => api.backtests(undefined, 20),
    refetchInterval: 15000,
  })

  const backtests = backtestsQuery.data?.backtests ?? []

  // --- selected backtest (default to latest when no user selection) ---
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected: Backtest | null = useMemo(() => {
    if (backtests.length === 0) return null
    if (selectedId) {
      return backtests.find((b) => b.id === selectedId) ?? backtests[0]
    }
    return backtests[0]
  }, [backtests, selectedId])

  // --- selected strategy detail ---
  const strategies = strategiesQuery.data?.strategies ?? []
  const selectedStrategy = useMemo(
    () => strategies.find((s: any) => s.id === strategy),
    [strategies, strategy],
  )

  const applyStrategyPreset = (s: any) => {
    if (!s?.preset) return
    setRiskPerTradePct(s.preset.riskPerTradePct)
    setStopLossPips(s.preset.stopLossPips)
    setRiskReward(s.preset.riskReward)
    toast.success(`Preset "${s.name}" diterapkan`, {
      description: `Risk ${s.preset.riskPerTradePct}% • SL ${s.preset.stopLossPips}p • RR 1:${s.preset.riskReward}`,
    })
  }

  // --- run backtest mutation ---
  const runMut = useMutation({
    mutationFn: () =>
      api.runBacktest({
        name,
        symbol,
        timeframe: selectedStrategy?.timeframe ?? 'M5',
        strategy,
        periodFrom,
        periodTo,
        initialCapital,
        riskPerTradePct,
        stopLossPips,
        riskReward,
      }),
    onSuccess: (data) => {
      const b = data.backtest
      toast.success(
        `Backtest selesai: ${b.totalTrades} trades, win ${b.winRate.toFixed(1)}%`,
        { description: `${b.symbol} • PF ${b.profitFactor.toFixed(2)} • Net ${fmtMoney(b.netProfit)}` },
      )
      qc.invalidateQueries({ queryKey: ['backtests'] })
      setSelectedId(b.id)
    },
    onError: (e: unknown) => {
      toast.error('Backtest gagal', {
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    },
  })

  // --- derived chart data ---
  const equityData = useMemo(() => {
    if (!selected) return []
    return parseEquity(selected.equityCurve).map((p) => ({
      t: p.t,
      equity: p.equity,
    }))
  }, [selected])

  const tradeData = useMemo(() => {
    if (!selected) return []
    return parseTrades(selected.tradesJson).map((tr, i) => ({
      i: i + 1,
      pnl: Number(tr.pnl.toFixed(2)),
    }))
  }, [selected])

  const winLossData = useMemo(() => {
    if (!selected) return []
    return [
      { name: 'Win', value: selected.winTrades, color: 'var(--bull)' },
      { name: 'Loss', value: selected.lossTrades, color: 'var(--bear)' },
    ]
  }, [selected])

  const isProfit = selected ? selected.netProfit >= 0 : true
  const equityColor = isProfit ? 'var(--bull)' : 'var(--bear)'

  const loadingStrategies = strategiesQuery.isLoading

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Activity className="h-6 w-6 text-bull" />
            Backtest Lab
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jalankan strategi scalping M5 pada data simulasi, lalu bandingkan performa.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 border-bull/40 text-bull">
          <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-bull" />
          Price engine deterministik
        </Badge>
      </div>

      {/* top grid: form + results KPIs */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* run form */}
        <Card className="xl:col-span-5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4 text-bull" />
              Konfigurasi Backtest
            </CardTitle>
            <CardDescription>
              Parameter simulasi strategi pada price engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* name */}
            <div className="space-y-1.5">
              <Label htmlFor="bt-name">Nama Backtest</Label>
              <Input
                id="bt-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setNameTouched(true)
                }}
                placeholder={defaultName(symbol)}
              />
            </div>

            {/* symbol + strategy */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Symbol</Label>
                <Select value={symbol} onValueChange={handleSymbolChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_SYMBOLS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SYMBOL_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Strategi</Label>
                <Select
                  value={strategy}
                  onValueChange={setStrategy}
                  disabled={loadingStrategies}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih strategi" />
                  </SelectTrigger>
                  <SelectContent>
                    {strategiesQuery.data?.strategies?.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    )) ?? (
                      <SelectItem value="scalping-m5">Scalping M5</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* timeframe (from strategy) */}
            <div className="space-y-1.5">
              <Label>Timeframe</Label>
              <div className="flex items-center gap-2">
                <Select value={selectedStrategy?.timeframe ?? 'M5'} disabled>
                  <SelectTrigger className="w-full opacity-70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M5">M5 (5 minutes)</SelectItem>
                    <SelectItem value="M1">M1 (1 minute)</SelectItem>
                    <SelectItem value="M15">M15 (15 minutes)</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="shrink-0 border-warn/40 text-warn">
                  {selectedStrategy?.timeframe ?? 'M5'} strategi
                </Badge>
              </div>
            </div>

            {/* Strategy info card */}
            {selectedStrategy && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-sm font-semibold">{selectedStrategy.name}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] px-1.5 py-0 capitalize',
                          selectedStrategy.difficulty === 'beginner' && 'border-emerald-500/40 text-emerald-500',
                          selectedStrategy.difficulty === 'intermediate' && 'border-amber-500/40 text-amber-500',
                          selectedStrategy.difficulty === 'advanced' && 'border-rose-500/40 text-rose-500',
                        )}
                      >
                        {selectedStrategy.difficulty}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                        {selectedStrategy.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {selectedStrategy.description}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-7 text-[11px] gap-1"
                    onClick={() => applyStrategyPreset(selectedStrategy)}
                  >
                    <Target className="h-3 w-3" />
                    Pakai Preset
                  </Button>
                </div>

                {/* Preset params grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="rounded bg-background/60 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">Risk / Trade</div>
                    <div className="text-xs font-mono font-semibold tabular">{selectedStrategy.preset.riskPerTradePct}%</div>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">Stop Loss</div>
                    <div className="text-xs font-mono font-semibold tabular">{selectedStrategy.preset.stopLossPips}p</div>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">R:R Ratio</div>
                    <div className="text-xs font-mono font-semibold tabular">1:{selectedStrategy.preset.riskReward}</div>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1.5">
                    <div className="text-[10px] text-muted-foreground">EMA</div>
                    <div className="text-xs font-mono font-semibold tabular">{selectedStrategy.preset.emaFast}/{selectedStrategy.preset.emaSlow}</div>
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] pt-1 border-t border-border/50">
                  <span className="flex items-center gap-1">
                    <Trophy className="h-3 w-3 text-amber-500" />
                    <span className="text-muted-foreground">Win:</span>
                    <span className="font-mono font-semibold">{selectedStrategy.expectedWinRate}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarRange className="h-3 w-3 text-sky-500" />
                    <span className="text-muted-foreground">Sesi:</span>
                    <span>{selectedStrategy.bestSession}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="h-3 w-3 text-violet-500" />
                    <span className="text-muted-foreground">Pairs:</span>
                    <span>{selectedStrategy.bestPairs.join(', ')}</span>
                  </span>
                </div>

                {/* Pros / Cons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-emerald-500 mb-0.5">Kelebihan</div>
                    <ul className="space-y-0.5">
                      {selectedStrategy.pros.map((p: string, i: number) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                          <span className="text-emerald-500 mt-0.5">+</span>{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-rose-500 mb-0.5">Kekurangan</div>
                    <ul className="space-y-0.5">
                      {selectedStrategy.cons.map((c: string, i: number) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                          <span className="text-rose-500 mt-0.5">−</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}

            {/* period */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bt-from" className="flex items-center gap-1.5">
                  <CalendarRange className="h-3.5 w-3.5" />
                  Dari
                </Label>
                <Input
                  id="bt-from"
                  type="date"
                  value={periodFrom}
                  max={periodTo}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bt-to" className="flex items-center gap-1.5">
                  <CalendarRange className="h-3.5 w-3.5" />
                  Sampai
                </Label>
                <Input
                  id="bt-to"
                  type="date"
                  value={periodTo}
                  min={periodFrom}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </div>
            </div>

            {/* initial capital */}
            <div className="space-y-1.5">
              <Label htmlFor="bt-cap">Modal Awal ($)</Label>
              <Input
                id="bt-cap"
                type="number"
                min={100}
                step={100}
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value) || 0)}
              />
            </div>

            {/* risk per trade slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  Risk per Trade
                </Label>
                <Badge variant="outline" className="tabular text-bull">
                  {riskPerTradePct.toFixed(2)}%
                </Badge>
              </div>
              <Slider
                value={[riskPerTradePct]}
                min={0.5}
                max={1.5}
                step={0.05}
                onValueChange={(v) => setRiskPerTradePct(v[0])}
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>0.5%</span>
                <span>1.5%</span>
              </div>
            </div>

            {/* stop loss pips slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Stop Loss (pips)</Label>
                <Badge variant="outline" className="tabular text-warn">
                  {stopLossPips} pips
                </Badge>
              </div>
              <Slider
                value={[stopLossPips]}
                min={5}
                max={15}
                step={1}
                onValueChange={(v) => setStopLossPips(v[0])}
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>5 pips</span>
                <span>15 pips</span>
              </div>
            </div>

            {/* RR slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Risk : Reward</Label>
                <Badge variant="outline" className="tabular text-bull">
                  1 : {riskReward.toFixed(1)}
                </Badge>
              </div>
              <Slider
                value={[riskReward]}
                min={1.0}
                max={3.0}
                step={0.1}
                onValueChange={(v) => setRiskReward(v[0])}
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>1 : 1.0</span>
                <span>1 : 3.0</span>
              </div>
            </div>

            <Button
              className="w-full bg-bull text-bull-foreground hover:bg-bull/90"
              disabled={runMut.isPending}
              onClick={() => runMut.mutate()}
            >
              {runMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menjalankan...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Jalankan Backtest
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* results */}
        <div className="space-y-4 xl:col-span-7">
          {backtestsQuery.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : !selected ? (
            <Card>
              <CardContent className="flex h-72 flex-col items-center justify-center gap-2 p-6 text-center">
                <Activity className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Belum ada backtest. Jalankan satu untuk melihat hasil.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* KPI grid */}
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4"
              >
                <Kpi
                  label="Net Profit"
                  value={fmtMoney(selected.netProfit)}
                  tone={selected.netProfit >= 0 ? 'bull' : 'bear'}
                  icon={selected.netProfit >= 0 ? TrendingUp : TrendingDown}
                />
                <Kpi
                  label="Win Rate"
                  value={`${selected.winRate.toFixed(1)}%`}
                  hint={`${selected.winTrades}W / ${selected.lossTrades}L`}
                  tone={selected.winRate >= 50 ? 'bull' : 'bear'}
                  icon={Trophy}
                />
                <Kpi
                  label="Profit Factor"
                  value={selected.profitFactor.toFixed(2)}
                  tone={selected.profitFactor >= 1 ? 'bull' : 'bear'}
                  icon={Gauge}
                />
                <Kpi
                  label="Max Drawdown"
                  value={`-${selected.maxDrawdown.toFixed(2)}%`}
                  tone="bear"
                  icon={TrendingDown}
                />
                <Kpi
                  label="Sharpe Ratio"
                  value={selected.sharpeRatio.toFixed(2)}
                  tone={selected.sharpeRatio >= 1 ? 'bull' : 'warn'}
                  icon={Activity}
                />
                <Kpi
                  label="Total Trades"
                  value={String(selected.totalTrades)}
                  icon={Layers}
                />
                <Kpi
                  label="Wins"
                  value={String(selected.winTrades)}
                  tone="bull"
                  icon={TrendingUp}
                />
                <Kpi
                  label="Final Capital"
                  value={fmtMoney(selected.finalCapital)}
                  hint={`from ${fmtMoney(selected.initialCapital)}`}
                  tone={selected.finalCapital >= selected.initialCapital ? 'bull' : 'bear'}
                  icon={Target}
                />
              </motion.div>

              {/* equity curve */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4" />
                      Equity Curve
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={`tabular ${
                        isProfit ? 'border-bull/40 text-bull' : 'border-bear/40 text-bear'
                      }`}
                    >
                      {isProfit ? '+' : ''}
                      {fmtMoney(selected.netProfit)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={equityData}
                        margin={{ top: 6, right: 8, bottom: 0, left: 8 }}
                      >
                        <defs>
                          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={equityColor} stopOpacity={0.55} />
                            <stop offset="100%" stopColor={equityColor} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                          dataKey="t"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          scale="time"
                          tickFormatter={(v: number) =>
                            new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
                          }
                          stroke="var(--muted-foreground)"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={32}
                        />
                        <YAxis
                          stroke="var(--muted-foreground)"
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={56}
                          tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                        />
                        <Tooltip
                          content={
                            <ChartTooltip
                              fmt={(v: number) => fmtMoney(v)}
                              labelFmt={(v: number) =>
                                new Date(v).toLocaleString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              }
                            />
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="equity"
                          name="Equity"
                          stroke={equityColor}
                          strokeWidth={2}
                          fill="url(#eqGrad)"
                          isAnimationActive
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* trade distribution + win/loss donut */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Layers className="h-4 w-4" />
                      Distribusi P&L per Trade
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48 w-full">
                      {tradeData.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Tidak ada trade pada periode ini.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={tradeData}
                            margin={{ top: 6, right: 4, bottom: 0, left: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis
                              dataKey="i"
                              stroke="var(--muted-foreground)"
                              tick={{ fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              minTickGap={8}
                            />
                            <YAxis
                              stroke="var(--muted-foreground)"
                              tick={{ fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              width={48}
                              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                            />
                            <Tooltip
                              cursor={{ fill: 'var(--muted)', opacity: 0.3 }}
                              content={<ChartTooltip fmt={(v: number) => fmtMoney(v)} />}
                            />
                            <Bar dataKey="pnl" name="P&L" radius={[2, 2, 0, 0]}>
                              {tradeData.map((d, i) => (
                                <Cell
                                  key={i}
                                  fill={d.pnl >= 0 ? 'var(--bull)' : 'var(--bear)'}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy className="h-4 w-4" />
                      Win / Loss
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="relative h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={winLossData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={48}
                            outerRadius={70}
                            paddingAngle={2}
                            stroke="none"
                          >
                            {winLossData.map((d, i) => (
                              <Cell key={i} fill={d.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={<ChartTooltip fmt={(v: number) => `${v} trades`} />}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-semibold tabular text-foreground">
                          {selected.winRate.toFixed(0)}%
                        </span>
                        <span className="text-[11px] text-muted-foreground">win rate</span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-4 text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-bull" />
                        Win <span className="tabular font-medium">{selected.winTrades}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-bear" />
                        Loss <span className="tabular font-medium">{selected.lossTrades}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>

      {/* bottom: history list + info */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Riwayat Backtest
            </CardTitle>
            <CardDescription>
              Klik baris untuk memuat hasil ke panel di atas. {backtests.length} entri.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto scroll-thin pr-1">
              {backtests.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  Belum ada backtest tersimpan.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {backtests.map((b) => {
                    const active = b.id === selectedId
                    const profitable = b.netProfit >= 0
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelectedId(b.id)}
                        className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                          active
                            ? 'border-bull/50 bg-bull/10'
                            : 'border-border bg-card/40 hover:bg-muted/60'
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                            profitable ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear'
                          }`}
                        >
                          {profitable ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {b.name}
                            </span>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {b.symbol}
                            </Badge>
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              {b.timeframe}
                            </Badge>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular">
                            <span>
                              {new Date(b.periodFrom).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                              {' → '}
                              {new Date(b.periodTo).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                            </span>
                            <span>{b.totalTrades} trades</span>
                            <span className={b.winRate >= 50 ? 'text-bull' : 'text-bear'}>
                              WR {b.winRate.toFixed(1)}%
                            </span>
                            <span>PF {b.profitFactor.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div
                            className={`text-sm font-semibold tabular ${
                              profitable ? 'text-bull' : 'text-bear'
                            }`}
                          >
                            {profitable ? '+' : ''}
                            {fmtMoney(b.netProfit)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(b.createdAt).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* info / comparison note */}
        <Card className="border-warn/30 bg-warn/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-warn">
              <Info className="h-4 w-4" />
              Catatan Simulasi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Backtest menggunakan <span className="text-foreground font-medium">data simulasi</span>{' '}
              (price engine deterministik berbasis rumus wave + trend + tick).
            </p>
            <p>
              Hasil di sini berguna untuk memvalidasi logika strategi dan parameter risk management,
              namun belum mencerminkan kondisi pasar sesungguhnya (slippage, queue order, partial fill).
            </p>
            <div className="rounded-md border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
              Hubungkan ke data historis MT5 (FINEX Indonesia) untuk hasil production-grade.
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
              <div className="rounded-md border border-border bg-card/40 p-2">
                <div className="text-muted-foreground">Strategi inti</div>
                <div className="font-medium text-foreground">EMA cross + RSI + Supertrend</div>
              </div>
              <div className="rounded-md border border-border bg-card/40 p-2">
                <div className="text-muted-foreground">Timeframe</div>
                <div className="font-medium text-foreground">M5 (5 menit)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Strategy Optimizer — run all strategies × symbols */}
      <StrategyOptimizer />
    </div>
  )
}
