'use client'

// Dashboard overview panel — Task ID 6.
// Hero panel: KPIs, equity curve, live watchlist, sessions, AI signals, top news, open positions.
// Live prices flow in via `useTicker` per-row (no parent re-render on tick).

import { useMemo, useState, memo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, type Variants } from 'framer-motion'
import { toast } from 'sonner'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  YAxis,
  XAxis,
} from 'recharts'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Newspaper,
  Bot,
  X,
  ChevronRight,
  Zap,
  Clock3,
  Crosshair,
  Minus,
  Inbox,
  CalendarClock,
  AlertTriangle,
  Building2,
  Banknote,
  PieChart,
  Unplug,
  CheckCircle2,
  Users,
} from 'lucide-react'

import { api } from '@/lib/api'
import { calcPnl } from '@/lib/market'
import { SYMBOL_LABEL, SUPPORTED_SYMBOLS } from '@/lib/types'
import type {
  Account,
  Trade,
  AiSignal,
  NewsItem,
  SymbolQuote,
  TradingSession,
  RiskUsage,
  EconomicEvent,
} from '@/lib/types'
import { useTicker } from '@/hooks/use-price-feed'
import { useActiveAccount } from '@/hooks/use-active-account'
import { fmtMoney, fmtPrice, fmtPct, relativeTime, useClock } from '@/lib/format'
import { Sparkline } from '@/components/trading/sparkline'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
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
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

// ─── Motion variants ─────────────────────────────────────────────────────────
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
}

// ─── Pure helpers ────────────────────────────────────────────────────────────
function jakartaHM(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta',
    })
  } catch {
    return '--:--'
  }
}

interface RiskTone {
  bar: string
  text: string
  bg: string
  ring: string
}

function riskTone(pct: number): RiskTone {
  if (pct >= 80) {
    return { bar: 'bg-bear', text: 'text-bear', bg: 'bg-bear/10', ring: 'border-bear/40' }
  }
  if (pct >= 50) {
    return { bar: 'bg-warn', text: 'text-warn', bg: 'bg-warn/10', ring: 'border-warn/40' }
  }
  return { bar: 'bg-bull', text: 'text-bull', bg: 'bg-bull/10', ring: 'border-bull/40' }
}

interface Factor {
  name: string
  score: number
}

function parseFactors(s: AiSignal): Factor[] {
  try {
    const obj = JSON.parse(s.factors || '{}') as Record<string, number>
    return Object.entries(obj)
      .map(([name, score]) => ({ name, score: Number(score) || 0 }))
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 3)
  } catch {
    return []
  }
}

// ─── Mini Sparkline (reusable, KPI card footer) ──────────────────────────────
interface MiniSparkProps {
  data: number[]
  color?: string // hex or CSS var (e.g. 'var(--bull)')
  height?: number
  width?: number | string
  gradientId: string
  strokeWidth?: number
}

function MiniSpark({
  data,
  color = 'var(--bull)',
  height = 32,
  width = '100%',
  gradientId,
  strokeWidth = 1.75,
}: MiniSparkProps) {
  if (!data || data.length < 2) {
    return <div style={{ height, width }} className="opacity-0" />
  }
  const chartData = data.map((v, i) => ({ i, v }))
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pad = (max - min) * 0.2 || Math.max(0.001, Math.abs(max) * 0.05)
  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={[min - pad, max + pad]} hide />
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={strokeWidth}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Sparkline data generation (seeded, deterministic) ───────────────────────
function genSpark(
  seed: number,
  points: number,
  startValue: number,
  endValue: number,
  noise = 0.18,
): number[] {
  let s = Math.abs(Math.floor(seed)) + 1
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const arr: number[] = []
  const span = Math.abs(endValue - startValue)
  const amp = span * noise + Math.abs(endValue) * 0.04 + 0.01
  for (let i = 0; i < points; i++) {
    const t = points === 1 ? 1 : i / (points - 1)
    const linear = startValue + (endValue - startValue) * t
    const n = (rand() - 0.5) * amp * 2
    arr.push(linear + n)
  }
  arr[0] = startValue
  arr[points - 1] = endValue
  return arr
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Skeleton className="lg:col-span-8 h-72" />
        <Skeleton className="lg:col-span-4 h-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Skeleton className="lg:col-span-4 h-80" />
        <Skeleton className="lg:col-span-4 h-80" />
        <Skeleton className="lg:col-span-4 h-80" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({
  icon,
  text,
  sub,
}: {
  icon: ReactNode
  text: string
  sub?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="text-muted-foreground/40">{icon}</div>
      <p className="text-sm text-muted-foreground">{text}</p>
      {sub && <p className="text-xs text-muted-foreground/70">{sub}</p>}
    </div>
  )
}

// ─── KPI: Account Equity ─────────────────────────────────────────────────────
function KpiAccountCard({
  account,
  spark,
}: {
  account: Account | null
  spark?: number[]
}) {
  const sparkData = spark && spark.length >= 2 ? spark : []
  const sparkChange =
    sparkData.length >= 2 && sparkData[0] !== 0
      ? ((sparkData[sparkData.length - 1] - sparkData[0]) / Math.abs(sparkData[0])) * 100
      : 0
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-bull/15 blur-2xl" />
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Wallet className="h-3.5 w-3.5" /> Account Equity
        </CardDescription>
        <CardTitle className="text-2xl font-bold tabular">
          {account ? fmtMoney(account.equity, account.currency) : '—'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {account ? (
          <>
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{account.name}</span>
              <Badge
                variant={account.accountType === 'live' ? 'destructive' : 'secondary'}
                className="px-1.5 py-0 text-[10px]"
              >
                {account.accountType.toUpperCase()}
              </Badge>
              {account.connected && (
                <Badge variant="outline" className="border-bull/40 px-1.5 py-0 text-[10px] text-bull">
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-bull live-dot" />
                  MT5
                </Badge>
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {account.broker} · {account.login}
            </div>
            <Separator className="my-2" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-mono tabular">{fmtMoney(account.balance, account.currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Free Margin</span>
              <span className="font-mono tabular">{fmtMoney(account.freeMargin, account.currency)}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Akun default belum diset.</p>
        )}
        {sparkData.length >= 2 && (
          <>
            <Separator className="my-2" />
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Equity · 30m trend</span>
                <span
                  className={cn(
                    'font-mono tabular',
                    sparkChange >= 0 ? 'text-bull' : 'text-bear',
                  )}
                >
                  {sparkChange >= 0 ? '+' : ''}
                  {sparkChange.toFixed(2)}%
                </span>
              </div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                style={{ height: 36, width: '100%' }}
              >
                <MiniSpark
                  data={sparkData}
                  color="var(--bull)"
                  gradientId="kpi-acct-spark"
                  height={36}
                />
              </motion.div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── KPI: Today's P&L ────────────────────────────────────────────────────────
function KpiPnlCard({
  pnl,
  pct,
  closedTrades,
}: {
  pnl: number
  pct: number
  closedTrades?: Trade[]
}) {
  const up = pnl >= 0
  const spark = useMemo(() => {
    if (!closedTrades || closedTrades.length === 0) {
      // Flat line — no closed trades today
      return [0, 0]
    }
    const sorted = [...closedTrades]
      .filter((t) => t.closeTime)
      .sort(
        (a, b) =>
          new Date(a.closeTime!).getTime() - new Date(b.closeTime!).getTime(),
      )
    if (sorted.length === 0) return [0, 0]
    let cum = 0
    const arr = [0]
    for (const t of sorted) {
      cum += t.pnl
      arr.push(cum)
    }
    return arr
  }, [closedTrades])

  const hasTrades = !!closedTrades && closedTrades.length > 0

  return (
    <Card className="relative overflow-hidden">
      <div
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl',
          up ? 'bg-bull/15' : 'bg-bear/15',
        )}
      />
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />} Today&apos;s P&amp;L
        </CardDescription>
        <CardTitle
          className={cn(
            'flex items-center gap-2 text-2xl font-bold tabular',
            up ? 'text-bull' : 'text-bear',
          )}
        >
          {up ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
          {fmtMoney(pnl)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Return</span>
          <span className={cn('font-mono tabular font-semibold', up ? 'text-bull' : 'text-bear')}>
            {fmtPct(pct)}
          </span>
        </div>
        <Separator className="my-2" />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Status</span>
          <Badge
            variant="outline"
            className={cn('px-1.5 py-0 text-[10px]', up ? 'border-bull/40 text-bull' : 'border-bear/40 text-bear')}
          >
            {up ? 'Profit' : 'Loss'}
          </Badge>
        </div>
        <Separator className="my-2" />
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>P&amp;L · today</span>
            <span className="font-mono tabular">
              {hasTrades ? `${closedTrades!.length} trade` : 'flat'}
            </span>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            style={{ height: 36, width: '100%' }}
          >
            <MiniSpark
              data={spark}
              color={up ? 'var(--bull)' : 'var(--bear)'}
              gradientId="kpi-pnl-spark"
              height={36}
            />
          </motion.div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── KPI: Daily Risk Used ────────────────────────────────────────────────────
function KpiRiskCard({ risk }: { risk: RiskUsage }) {
  const tone = riskTone(risk.usedPct)
  const ratio = risk.limitPct > 0 ? (risk.usedPct / risk.limitPct) * 100 : 0
  const sparkColor =
    risk.usedPct >= 80
      ? 'var(--bear)'
      : risk.usedPct >= 50
        ? 'var(--warn)'
        : 'var(--bull)'
  // Synthetic rising curve: small start, oscillating upward toward current usedPct
  const spark = useMemo(
    () =>
      genSpark(
        Math.floor(risk.usedPct * 100) + 7,
        20,
        Math.max(0, risk.usedPct * 0.15),
        risk.usedPct,
        0.22,
      ),
    [risk.usedPct],
  )
  return (
    <Card className="relative overflow-hidden">
      <div
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl',
          tone.bg,
        )}
      />
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <ShieldAlert className="h-3.5 w-3.5" /> Daily Risk Used
        </CardDescription>
        <CardTitle className={cn('text-2xl font-bold tabular', tone.text)}>
          {risk.usedPct.toFixed(1)}
          <span className="text-base font-normal text-muted-foreground">%</span>
          <span className="ml-1 text-sm font-normal text-muted-foreground">/ {risk.limitPct.toFixed(0)}%</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all duration-500', tone.bar)}
            style={{ width: `${Math.min(100, Math.max(2, ratio))}%` }}
          />
        </div>
        <Separator className="my-2" />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Open Positions</span>
          <span className="font-mono tabular">
            {risk.openPositions} <span className="text-muted-foreground">/ {risk.maxPositions}</span>
          </span>
        </div>
        <Separator className="my-2" />
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Risk · 30m trend</span>
            <span className={cn('font-mono tabular', tone.text)}>
              {risk.usedPct.toFixed(1)}%
            </span>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            style={{ height: 36, width: '100%' }}
          >
            <MiniSpark
              data={spark}
              color={sparkColor}
              gradientId="kpi-risk-spark"
              height={36}
            />
          </motion.div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── KPI: Open Positions count ───────────────────────────────────────────────
function KpiOpenPositionsCard({
  trades,
  closedCount,
}: {
  trades: Trade[]
  closedCount: number
}) {
  const bySymbol = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of trades) m.set(t.symbol, (m.get(t.symbol) ?? 0) + 1)
    return [...m.entries()]
  }, [trades])

  // Synthetic positions-over-time sparkline: descend from a recent peak to current count.
  // Conveys that position count has been winding down (or steady).
  const spark = useMemo(() => {
    const current = trades.length
    const peak = Math.max(current + 2, 5) // assume we had a few more positions earlier
    return genSpark(Math.floor(current * 13) + 17, 20, peak, current, 0.25)
  }, [trades.length])

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent blur-2xl" />
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Layers className="h-3.5 w-3.5" /> Open Positions
        </CardDescription>
        <CardTitle className="text-2xl font-bold tabular">{trades.length}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Positions · 30m trend</span>
            <span className="font-mono tabular">{trades.length} now</span>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            style={{ height: 36, width: '100%' }}
          >
            <MiniSpark
              data={spark}
              color="var(--bull)"
              gradientId="kpi-pos-spark"
              height={36}
            />
          </motion.div>
        </div>
        <div className="flex min-h-[20px] flex-wrap gap-1.5">
          {bySymbol.length === 0 ? (
            <span className="text-xs text-muted-foreground">Tidak ada posisi</span>
          ) : (
            bySymbol.map(([sym, n]) => (
              <Badge key={sym} variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
                {sym} ×{n}
              </Badge>
            ))
          )}
        </div>
        <Separator className="my-2" />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Closed Today</span>
          <span className="font-mono tabular">{closedCount} trade</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Equity Curve Card ───────────────────────────────────────────────────────
interface EquityTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
}

function EquityChartTooltip({ active, payload }: EquityTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1 text-xs shadow-md">
      <span className="font-mono tabular text-foreground">{fmtMoney(payload[0].value)}</span>
    </div>
  )
}

function EquityCurveCard({
  spark,
  todayPnl,
  balance,
}: {
  spark: number[]
  todayPnl: number
  balance: number
}) {
  // Fetch real closed-trade cumulative P&L for the equity curve
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', 'equity', '30'],
    queryFn: () => api.analytics({ days: 30 }),
    refetchInterval: 15000,
  })

  // Build equity curve: if we have real closed-trade data, use balance + cumulative P&L.
  // Otherwise fall back to the synthetic spark.
  const { chartData, isReal } = useMemo(() => {
    const realCurve = analyticsData?.analytics?.equityCurve
    if (realCurve && realCurve.length >= 2) {
      const baseBalance = balance - (realCurve[realCurve.length - 1]?.equity ?? 0)
      return {
        chartData: realCurve.map((pt, i) => ({ i, v: baseBalance + pt.equity, t: pt.t })),
        isReal: true,
      }
    }
    return {
      chartData: spark.map((v, i) => ({ i, v })),
      isReal: false,
    }
  }, [analyticsData, spark, balance])

  const up = todayPnl >= 0
  const stats = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 1, pad: 1 }
    const vals = chartData.map((d) => d.v)
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min) * 0.15 || 1
    return { min, max, pad }
  }, [chartData])

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" /> Equity Curve
          {isReal && (
            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 ml-1">
              Live P&L
            </Badge>
          )}
        </CardDescription>
        <div className="flex flex-wrap items-baseline gap-3">
          <CardTitle className="text-2xl font-bold tabular">{fmtMoney(balance)}</CardTitle>
          <Badge
            variant="outline"
            className={cn('text-xs', up ? 'border-bull/40 text-bull' : 'border-bear/40 text-bear')}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {fmtMoney(todayPnl)}
            <span className="ml-1 opacity-80">
              ({fmtPct(balance > 0 ? (todayPnl / balance) * 100 : 0)})
            </span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={up ? 'var(--bull)' : 'var(--bear)'} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={up ? 'var(--bull)' : 'var(--bear)'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis domain={[stats.min - stats.pad, stats.max + stats.pad]} hide />
              <RTooltip content={<EquityChartTooltip />} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={up ? 'var(--bull)' : 'var(--bear)'}
                strokeWidth={2}
                fill="url(#equityGrad)"
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Sessions Card ───────────────────────────────────────────────────────────
const SESSION_ORDER = ['London', 'New York', 'Overlap', 'Tokyo', 'Sydney']

function SessionsCard({ sessions }: { sessions: TradingSession[] }) {
  const ordered = useMemo(() => {
    const m = new Map(sessions.map((s) => [s.name, s]))
    return SESSION_ORDER.map((n) => m.get(n)).filter(Boolean) as TradingSession[]
  }, [sessions])

  const scalpingActive =
    ordered.find((s) => s.name === 'London')?.active ||
    ordered.find((s) => s.name === 'Overlap')?.active ||
    false

  const nextSession = ordered.find((s) => !s.active)

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Clock3 className="h-3.5 w-3.5" /> Trading Sessions
        </CardDescription>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Sesi Pasar</CardTitle>
          <Badge
            variant="outline"
            className={cn(
              'px-1.5 py-0 text-[10px]',
              scalpingActive
                ? 'border-bull/40 text-bull'
                : 'border-border text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'mr-1 h-1.5 w-1.5 rounded-full',
                scalpingActive ? 'bg-bull live-dot' : 'bg-muted-foreground/50',
              )}
            />
            {scalpingActive ? 'Scalping Window' : 'Off-Session'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ordered.map((s) => (
          <SessionRow key={s.name} session={s} />
        ))}
        {nextSession && (
          <div className="border-t border-border pt-2 text-xs text-muted-foreground">
            Sesi berikutnya:{' '}
            <span className="font-medium text-foreground">{nextSession.name}</span> ·{' '}
            <span className="font-mono tabular">{jakartaHM(nextSession.nextOpen)} WIB</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SessionRow({ session }: { session: TradingSession }) {
  const pct = Math.round(session.progress * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              session.active ? 'bg-bull live-dot' : 'bg-muted-foreground/40',
            )}
          />
          <span className="font-medium">{session.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono tabular text-muted-foreground">{pct}%</span>
          <Badge
            variant="outline"
            className={cn(
              'px-1.5 py-0 text-[10px]',
              session.active
                ? 'border-bull/40 text-bull'
                : 'border-border text-muted-foreground',
            )}
          >
            {session.active ? 'AKTIF' : 'TUTUP'}
          </Badge>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            session.active ? 'bg-bull' : 'bg-muted-foreground/30',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Next Economic Event Widget ──────────────────────────────────────────────
function NextEventWidget() {
  const now = useClock()
  const { data } = useQuery({
    queryKey: ['dashboard', 'next-event'],
    queryFn: () => api.economicCalendar({ days: 3, status: 'upcoming', limit: 20 }),
    refetchInterval: 30000,
  })

  const events = data?.events || []
  const upcoming = events.filter((e) => new Date(e.eventTime).getTime() > now.getTime())
  const next = upcoming[0]

  if (!next) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/[0.03]">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-400">Tidak ada event high-impact mendatang</p>
            <p className="text-[11px] text-muted-foreground">Jendela scalping aman untuk 3 hari ke depan</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const diff = new Date(next.eventTime).getTime() - now.getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  const isHigh = next.impact === 'high'
  const isClose = diff < 30 * 60000 // within 30 min

  const flag = next.country === 'US' ? '🇺🇸' : next.country === 'EU' ? '🇪🇺' : next.country === 'GB' ? '🇬🇧' : next.country === 'JP' ? '🇯🇵' : '🏳️'

  return (
    <Card className={cn(
      'relative overflow-hidden transition-colors',
      isClose && isHigh
        ? 'border-rose-500/40 bg-rose-500/[0.06]'
        : isHigh
        ? 'border-amber-500/30 bg-amber-500/[0.04]'
        : 'border-border bg-card',
    )}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
            isClose && isHigh ? 'bg-rose-500/15 text-rose-400' : isHigh ? 'bg-amber-500/15 text-amber-400' : 'bg-muted text-muted-foreground',
          )}>
            {isClose && isHigh ? <AlertTriangle className="h-4 w-4 live-dot" /> : <CalendarClock className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{flag}</span>
              <p className="text-xs font-semibold truncate">{next.title}</p>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={cn(
                'text-[10px] px-1 py-0 rounded font-medium',
                isHigh ? 'text-rose-400' : next.impact === 'medium' ? 'text-amber-400' : 'text-muted-foreground',
              )}>
                {next.impact.toUpperCase()}
              </span>
              {next.forecast && <span className="text-[10px] text-muted-foreground font-mono">Fcst: {next.forecast}</span>}
              {next.previous && <span className="text-[10px] text-muted-foreground font-mono">Prev: {next.previous}</span>}
              <span className="text-[10px] text-muted-foreground">
                {new Date(next.eventTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mulai dalam</p>
            <p className={cn('text-sm font-mono font-bold tabular', isClose && isHigh ? 'text-rose-400' : isHigh ? 'text-amber-400' : 'text-foreground')}>
              {days > 0 && `${days}h `}
              {String(hours).padStart(2, '0')}j {String(mins).padStart(2, '0')}m
              {days === 0 && <span className="text-muted-foreground"> {String(secs).padStart(2, '0')}d</span>}
            </p>
          </div>
        </div>
        {isClose && isHigh && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-rose-400">
            <AlertTriangle className="h-3 w-3" />
            <span>Hindari scalping 5 menit sebelum & sesudah event</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Performance Today Card ──────────────────────────────────────────────────
function PerformanceTodayCard() {
  const { data } = useQuery({
    queryKey: ['analytics', 'today', '1'],
    queryFn: () => api.analytics({ days: 1 }),
    refetchInterval: 15000,
  })
  const a = data?.analytics

  if (!a) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="h-20 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    )
  }

  const hasData = a.totalClosed > 0
  const rrRatio = a.avgLoss > 0 ? a.avgWin / a.avgLoss : 0

  const metrics = [
    { label: 'Win Rate', value: hasData ? `${a.winRate.toFixed(0)}%` : '—', sub: `${a.wins}W / ${a.losses}L`, tone: a.winRate >= 50 ? 'bull' : 'bear' },
    { label: 'Avg R:R', value: hasData ? rrRatio.toFixed(2) : '—', sub: `Avg win $${a.avgWin.toFixed(0)}`, tone: rrRatio >= 1 ? 'bull' : 'bear' },
    { label: 'Best', value: hasData ? `+$${a.bestTrade.toFixed(0)}` : '—', sub: 'today', tone: 'bull' },
    { label: 'Worst', value: hasData ? `-$${Math.abs(a.worstTrade).toFixed(0)}` : '—', sub: 'today', tone: 'bear' },
  ]

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-emerald-500" />
            Performance Today
            {!hasData && <span className="text-[10px] text-muted-foreground font-normal">(belum ada trade closed)</span>}
          </CardTitle>
          <Badge variant="outline" className={cn('text-[10px]', hasData ? (a.netProfit >= 0 ? 'border-bull/40 text-bull' : 'border-bear/40 text-bear') : '')}>
            {hasData ? (a.netProfit >= 0 ? '+' : '') + fmtMoney(a.netProfit) : 'N/A'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
              <p className={cn(
                'text-base font-bold tabular',
                !hasData && 'text-muted-foreground',
                hasData && m.tone === 'bull' && 'text-bull',
                hasData && m.tone === 'bear' && 'text-bear',
              )}>
                {m.value}
              </p>
              <p className="text-[10px] text-muted-foreground">{m.sub}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Watchlist Card ──────────────────────────────────────────────────────────
function WatchlistCard({ fallbackSymbols }: { fallbackSymbols: SymbolQuote[] }) {
  const symbols = useMemo(
    () =>
      SUPPORTED_SYMBOLS.map((s) => fallbackSymbols.find((q) => q.symbol === s)).filter(
        Boolean,
      ) as SymbolQuote[],
    [fallbackSymbols],
  )

  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Crosshair className="h-3.5 w-3.5" /> Live Watchlist
        </CardDescription>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Majors · Spot</CardTitle>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-bull live-dot" /> Live
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {symbols.map((q) => (
            <WatchlistRow key={q.symbol} fallback={q} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const WatchlistRow = memo(function WatchlistRow({ fallback }: { fallback: SymbolQuote }) {
  const t = useTicker(fallback.symbol)
  const price = t?.price ?? fallback.price
  const bid = t?.bid ?? fallback.bid
  const ask = t?.ask ?? fallback.ask
  const spread = t?.spread ?? fallback.spread
  const changePct = t?.changePct ?? fallback.changePct
  const spark = t?.spark?.length ? t.spark : fallback.spark
  const dir = t?.dir ?? 'flat'
  const up = changePct >= 0
  const spreadDigits =
    fallback.symbol === 'USDJPY' ? 3 : fallback.symbol === 'XAUUSD' ? 2 : 5

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-muted/30 p-3 transition-colors',
        dir === 'up' && 'tick-up',
        dir === 'down' && 'tick-down',
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-default text-sm font-semibold">
              {SYMBOL_LABEL[fallback.symbol] ?? fallback.symbol}
            </span>
          </TooltipTrigger>
          <TooltipContent>{fallback.symbol} · pip {fallback.pip}</TooltipContent>
        </Tooltip>
        <Badge
          variant="outline"
          className={cn(
            'px-1.5 py-0 text-[10px]',
            up ? 'border-bull/40 text-bull' : 'border-bear/40 text-bear',
          )}
        >
          {up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
          {fmtPct(changePct)}
        </Badge>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div
          className={cn(
            'font-mono text-lg font-bold tabular',
            up ? 'text-bull' : 'text-bear',
          )}
        >
          {fmtPrice(fallback.symbol, price)}
        </div>
        <Sparkline data={spark} width={64} height={28} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px] tabular text-muted-foreground">
        <div className="flex flex-col">
          <span className="text-[9px] opacity-70">BID</span>
          <span className="text-bull/80">{fmtPrice(fallback.symbol, bid)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] opacity-70">ASK</span>
          <span className="text-bear/80">{fmtPrice(fallback.symbol, ask)}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] opacity-70">SPR</span>
          <span>{spread.toFixed(spreadDigits)}</span>
        </div>
      </div>
    </div>
  )
})

// ─── AI Signals Card ─────────────────────────────────────────────────────────
function AiSignalsCard({ signals }: { signals: AiSignal[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Bot className="h-3.5 w-3.5" /> AI Signals
        </CardDescription>
        <CardTitle className="text-base">Latest Predictions</CardTitle>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <EmptyState icon={<Bot className="h-6 w-6" />} text="Belum ada sinyal AI" />
        ) : (
          <ScrollArea className="max-h-72 pr-2">
            <div className="space-y-2">
              {signals.slice(0, 4).map((s) => (
                <SignalRow key={s.id} signal={s} />
              ))}
            </div>
          </ScrollArea>
        )}
        <button
          type="button"
          onClick={() => toast.info('Buka tab AI untuk semua sinyal')}
          className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Lihat semua <ChevronRight className="h-3 w-3" />
        </button>
      </CardContent>
    </Card>
  )
}

function SignalRow({ signal }: { signal: AiSignal }) {
  const factors = useMemo(() => parseFactors(signal), [signal])
  const isLong = signal.direction === 'long'
  const isShort = signal.direction === 'short'
  const dirColor = isLong
    ? 'text-bull border-bull/40'
    : isShort
      ? 'text-bear border-bear/40'
      : 'text-warn border-warn/40'
  const actionColor =
    signal.action === 'buy'
      ? 'bg-bull/15 text-bull'
      : signal.action === 'sell'
        ? 'bg-bear/15 text-bear'
        : 'bg-warn/15 text-warn'

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5 transition-colors hover:bg-muted/50">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
            {signal.symbol}
          </Badge>
          <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', dirColor)}>
            {signal.direction.toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Conf</span>
          <span className="font-mono text-xs font-semibold tabular">
            {signal.confidence.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {factors.length === 0 ? (
            <span className="text-[10px] italic text-muted-foreground">No factors</span>
          ) : (
            factors.map((f) => (
              <span
                key={f.name}
                className="rounded-md border border-border bg-background px-1.5 py-0 font-mono text-[9px] text-muted-foreground"
              >
                {f.name}{' '}
                <span
                  className={
                    f.score > 0
                      ? 'text-bull'
                      : f.score < 0
                        ? 'text-bear'
                        : 'text-warn'
                  }
                >
                  {f.score.toFixed(f.score >= 10 || f.score <= -10 ? 0 : 1)}
                </span>
              </span>
            ))
          )}
        </div>
        <Badge variant="outline" className={cn('border-0 px-1.5 py-0 text-[10px]', actionColor)}>
          {signal.action.toUpperCase()}
        </Badge>
      </div>
    </div>
  )
}

// ─── Top News Card ───────────────────────────────────────────────────────────
function TopNewsCard({ news }: { news: NewsItem[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Newspaper className="h-3.5 w-3.5" /> Top News
        </CardDescription>
        <CardTitle className="text-base">Market Headlines</CardTitle>
      </CardHeader>
      <CardContent>
        {news.length === 0 ? (
          <EmptyState icon={<Newspaper className="h-6 w-6" />} text="Belum ada berita" />
        ) : (
          <ScrollArea className="max-h-72 pr-2">
            <div className="space-y-2">
              {news.slice(0, 5).map((n) => (
                <NewsRow key={n.id} news={n} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function NewsRow({ news }: { news: NewsItem }) {
  const isBreaking = news.category === 'breaking'
  const impactColor =
    news.impact === 'high'
      ? 'bg-bear'
      : news.impact === 'medium'
        ? 'bg-warn'
        : 'bg-muted-foreground/50'
  const sentIcon =
    news.sentiment === 'bullish' ? (
      <ArrowUpRight className="h-3 w-3 text-bull" />
    ) : news.sentiment === 'bearish' ? (
      <ArrowDownRight className="h-3 w-3 text-bear" />
    ) : (
      <Minus className="h-3 w-3 text-muted-foreground" />
    )

  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/30 p-2.5 transition-colors',
        isBreaking
          ? 'border-bear/40 bg-bear/5'
          : 'border-border hover:bg-muted/50',
      )}
    >
      <div className="flex items-start gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'mt-1 h-2 w-2 shrink-0 rounded-full',
                impactColor,
                news.impact === 'high' && 'live-dot',
              )}
            />
          </TooltipTrigger>
          <TooltipContent>Impact: {news.impact}</TooltipContent>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-1.5">
            <Badge variant="secondary" className="px-1.5 py-0 text-[9px] capitalize">
              {news.category.replace('_', ' ')}
            </Badge>
            {isBreaking && (
              <Badge variant="outline" className="border-bear/40 px-1.5 py-0 text-[9px] text-bear">
                <Zap className="h-2.5 w-2.5" /> BREAKING
              </Badge>
            )}
          </div>
          <p className={cn('line-clamp-2 text-xs leading-snug', isBreaking && 'font-semibold')}>
            {news.title}
          </p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="truncate">
              {relativeTime(news.publishedAt)} · {news.source}
            </span>
            <span className="flex items-center gap-0.5">{sentIcon}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Open Positions Table ────────────────────────────────────────────────────
function OpenPositionsCard({ trades }: { trades: Trade[] }) {
  const qc = useQueryClient()
  const [closingId, setClosingId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const closingTrade = trades.find((t) => t.id === closingId) ?? null

  async function doClose() {
    if (!closingId) return
    setPending(true)
    try {
      const res = await api.closeTrade(closingId)
      toast.success(`Posisi ${res.trade.symbol} ditutup`, {
        description: `P&L: ${fmtMoney(res.trade.pnl)} · ${
          res.trade.pips >= 0 ? '+' : ''
        }${res.trade.pips} pips`,
      })
      setClosingId(null)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e) {
      toast.error('Gagal menutup posisi', {
        description: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Layers className="h-3.5 w-3.5" /> Open Positions
        </CardDescription>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Posisi Terbuka{' '}
            <span className="font-normal text-muted-foreground">({trades.length})</span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            text="Belum ada posisi terbuka"
            sub="Buka posisi baru di tab Trading"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Lot</TableHead>
                  <TableHead className="text-right">Open Price</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Floating P&amp;L</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((t) => (
                  <OpenTradeRow key={t.id} trade={t} onClose={() => setClosingId(t.id)} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={!!closingId}
        onOpenChange={(o) => !o && !pending && setClosingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <X className="h-4 w-4 text-bear" /> Tutup Posisi?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {closingTrade && (
                <span>
                  Yakin ingin menutup posisi{' '}
                  <b className="font-mono text-foreground">{closingTrade.symbol}</b>{' '}
                  {closingTrade.side.toUpperCase()} {closingTrade.lotSize.toFixed(2)} lot? Posisi
                  akan ditutup pada harga market terkini.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                doClose()
              }}
              disabled={pending}
              className="bg-bear text-white hover:bg-bear/90"
            >
              {pending ? 'Menutup...' : 'Tutup Posisi'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

const OpenTradeRow = memo(function OpenTradeRow({
  trade,
  onClose,
}: {
  trade: Trade
  onClose: () => void
}) {
  const t = useTicker(trade.symbol)
  const closeRef = trade.side === 'buy' ? (t?.bid ?? trade.openPrice) : (t?.ask ?? trade.openPrice)
  const { pnl, pips } = t
    ? calcPnl(trade.symbol, trade.side, trade.lotSize, trade.openPrice, closeRef)
    : { pnl: trade.pnl, pips: trade.pips }

  const isBuy = trade.side === 'buy'
  const up = pnl >= 0

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
            {trade.symbol}
          </Badge>
          {trade.source === 'ai' && <Bot className="h-3 w-3 text-warn" />}
          {trade.source === 'auto' && <Zap className="h-3 w-3 text-warn" />}
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            'px-1.5 py-0 text-[10px]',
            isBuy ? 'border-bull/40 text-bull' : 'border-bear/40 text-bear',
          )}
        >
          {trade.side.toUpperCase()}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-mono tabular">{trade.lotSize.toFixed(2)}</TableCell>
      <TableCell className="text-right font-mono tabular text-muted-foreground">
        {fmtPrice(trade.symbol, trade.openPrice)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-mono tabular',
          t ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {t ? fmtPrice(trade.symbol, closeRef) : '—'}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-mono tabular font-semibold',
          up ? 'text-bull' : 'text-bear',
        )}
      >
        <div>
          {up ? '+' : ''}
          {fmtMoney(pnl)}
        </div>
        <div className="text-[10px] font-normal opacity-70">
          {pips >= 0 ? '+' : ''}
          {pips.toFixed(1)} pips
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="h-7 px-2 text-bear hover:bg-bear/10 hover:text-bear"
            >
              <X className="h-3.5 w-3.5" /> Tutup
            </Button>
          </TooltipTrigger>
          <TooltipContent>Tutup posisi di market</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
})

// ─── All-Accounts Aggregation (r9-A) ─────────────────────────────────────────
interface PerAccountRow {
  accountId: string
  accountName: string
  broker: string
  balance: number
  equity: number
  openPositions: number
  todayPnl: number
  todayPnlPct: number
  connected: boolean
}

interface AggregatePayload {
  totalBalance: number
  totalEquity: number
  totalFreeMargin: number
  totalUsedMargin: number
  accountCount: number
  openPositionsTotal: number
  todayPnlTotal: number
  todayPnlPct: number
  perAccount: PerAccountRow[]
  symbols: SymbolQuote[]
  equitySpark: number[]
  riskUsage: RiskUsage
  sessions: TradingSession[]
}

// Segmented toggle: "Single" account vs "All Accounts" aggregate.
function ViewModeToggle({
  viewMode,
  onChange,
  accountCount,
}: {
  viewMode: 'single' | 'all'
  onChange: (mode: 'single' | 'all') => void
  accountCount: number
}) {
  const opts: { id: 'single' | 'all'; label: string; icon: ReactNode }[] = [
    { id: 'single', label: 'Single', icon: <Wallet className="h-3.5 w-3.5" /> },
    {
      id: 'all',
      label: `All Accounts${accountCount > 0 ? ` (${accountCount})` : ''}`,
      icon: <Layers className="h-3.5 w-3.5" />,
    },
  ]
  return (
    <div
      role="tablist"
      aria-label="Dashboard view mode"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1"
    >
      {opts.map((o) => {
        const active = viewMode === o.id
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-emerald-500/15 text-emerald-500 shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
            )}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// Variant-configurable KPI card for the aggregate view.
type AggKpiVariant = 'balance' | 'equity' | 'pnl' | 'positions'

function AggregateKpiCard({
  variant,
  value,
  sub,
  pct,
  spark,
}: {
  variant: AggKpiVariant
  value: string
  sub: string
  pct?: number
  spark?: number[]
}) {
  const isPnl = variant === 'pnl'
  const pnlUp = (pct ?? 0) >= 0
  const iconMap: Record<AggKpiVariant, ReactNode> = {
    balance: <Banknote className="h-3.5 w-3.5" />,
    equity: <Wallet className="h-3.5 w-3.5" />,
    pnl: pnlUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />,
    positions: <Layers className="h-3.5 w-3.5" />,
  }
  const labelMap: Record<AggKpiVariant, string> = {
    balance: 'Total Balance',
    equity: 'Total Equity',
    pnl: "Today's P&L",
    positions: 'Open Positions',
  }
  const accentMap: Record<AggKpiVariant, string> = {
    balance: 'from-emerald-500/15 to-transparent',
    equity: 'from-emerald-500/15 to-transparent',
    pnl: pnlUp ? 'from-emerald-500/15 to-transparent' : 'from-rose-500/15 to-transparent',
    positions: 'from-violet-500/15 to-transparent',
  }
  const glowMap: Record<AggKpiVariant, string> = {
    balance: 'bg-emerald-500/15',
    equity: 'bg-emerald-500/15',
    pnl: pnlUp ? 'bg-emerald-500/15' : 'bg-rose-500/15',
    positions: 'bg-violet-500/15',
  }
  const titleColor = isPnl
    ? pnlUp
      ? 'text-bull'
      : 'text-bear'
    : 'text-foreground'

  const sparkData = spark && spark.length >= 2 ? spark : []
  const gradientId = `agg-kpi-${variant}`

  return (
    <Card className={cn('relative overflow-hidden bg-gradient-to-br', accentMap[variant])}>
      <div
        className={cn(
          'pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl',
          glowMap[variant],
        )}
      />
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          {iconMap[variant]} {labelMap[variant]}
        </CardDescription>
        <CardTitle className={cn('text-2xl font-bold tabular', titleColor)}>
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{isPnl ? 'Return' : 'Detail'}</span>
          <span
            className={cn(
              'font-mono tabular font-semibold',
              isPnl
                ? pnlUp
                  ? 'text-bull'
                  : 'text-bear'
                : 'text-foreground',
            )}
          >
            {isPnl && typeof pct === 'number'
              ? fmtPct(pct)
              : sub}
          </span>
        </div>
        {!isPnl && (
          <div className="text-[11px] text-muted-foreground">{sub}</div>
        )}
        {sparkData.length >= 2 && (
          <>
            <Separator className="my-2" />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              style={{ height: 36, width: '100%' }}
            >
              <MiniSpark
                data={sparkData}
                color={isPnl ? (pnlUp ? 'var(--bull)' : 'var(--bear)') : 'var(--bull)'}
                gradientId={gradientId}
                height={36}
              />
            </motion.div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Per-account breakdown table — sorted by balance desc (server already sorts).
function PerAccountBreakdownTable({ rows }: { rows: PerAccountRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Building2 className="h-3.5 w-3.5" /> Per-Account Breakdown
        </CardDescription>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Account Performance</CardTitle>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {rows.length} account{rows.length === 1 ? '' : 's'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            text="Belum ada akun trading"
            sub="Tambahkan akun di tab Accounts"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Broker</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Equity</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Today P&amp;L</TableHead>
                  <TableHead className="text-right">Today %</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const up = r.todayPnl >= 0
                  return (
                    <TableRow key={r.accountId}>
                      <TableCell>
                        <span className="text-sm font-semibold">{r.accountName}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.broker}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {fmtMoney(r.balance)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular text-muted-foreground">
                        {fmtMoney(r.equity)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular">
                        {r.openPositions}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono tabular font-semibold',
                          up ? 'text-bull' : 'text-bear',
                        )}
                      >
                        {up ? '+' : ''}
                        {fmtMoney(r.todayPnl)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-mono tabular',
                          up ? 'text-bull' : 'text-bear',
                        )}
                      >
                        {fmtPct(r.todayPnlPct)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.connected ? (
                          <Badge
                            variant="outline"
                            className="border-bull/40 px-1.5 py-0 text-[10px] text-bull"
                          >
                            <CheckCircle2 className="mr-1 h-2.5 w-2.5" /> Connected
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-muted-foreground/40 px-1.5 py-0 text-[10px] text-muted-foreground"
                          >
                            <Unplug className="mr-1 h-2.5 w-2.5" /> Disconnected
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Aggregate overview container — composes 4 KPI cards + equity curve + table.
function AggregateOverview({ aggregate }: { aggregate: AggregatePayload }) {
  const pnlUp = aggregate.todayPnlTotal >= 0
  // Cumulative P&L sparkline: anchor at totalBalance, drift toward totalBalance + todayPnlTotal.
  const pnlSpark = useMemo(() => {
    const out: number[] = []
    const start = aggregate.totalBalance - aggregate.todayPnlTotal * 0.5
    const end = aggregate.totalBalance + aggregate.todayPnlTotal
    for (let i = 0; i < 40; i++) {
      const frac = i / 39
      const lin = start + (end - start) * frac
      const wobble = Math.sin(i / 3.1) * (aggregate.totalBalance * 0.0006 || 1)
      out.push(Number((lin + wobble).toFixed(2)))
    }
    return out
  }, [aggregate.totalBalance, aggregate.todayPnlTotal])

  // Positions-over-time synthetic sparkline for the Open Positions card.
  const positionsSpark = useMemo(() => {
    const current = aggregate.openPositionsTotal
    const peak = Math.max(current + 2, 5)
    return genSpark(Math.floor(current * 13) + 41, 20, peak, current, 0.25)
  }, [aggregate.openPositionsTotal])

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-4 p-4 md:p-6"
    >
      {/* Aggregate header strip */}
      <motion.div variants={itemVariants}>
        <Card className="bg-gradient-to-br from-violet-500/10 via-emerald-500/5 to-transparent">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/15 text-violet-500">
                <PieChart className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">All Accounts Aggregated</h2>
                  <Badge variant="outline" className="border-violet-500/30 text-violet-400 px-1.5 py-0 text-[10px]">
                    <Users className="mr-1 h-2.5 w-2.5" /> {aggregate.accountCount} account{aggregate.accountCount === 1 ? '' : 's'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Combined view across every trading account · Free Margin{' '}
                  <span className="font-mono tabular text-foreground">
                    {fmtMoney(aggregate.totalFreeMargin)}
                  </span>{' '}
                  · Used Margin{' '}
                  <span className="font-mono tabular text-foreground">
                    {fmtMoney(aggregate.totalUsedMargin)}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Positions</p>
                <p className="font-mono text-sm font-bold tabular">{aggregate.openPositionsTotal}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Today P&amp;L</p>
                <p
                  className={cn(
                    'font-mono text-sm font-bold tabular',
                    pnlUp ? 'text-bull' : 'text-bear',
                  )}
                >
                  {pnlUp ? '+' : ''}
                  {fmtMoney(aggregate.todayPnlTotal)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* KPI Row (4 cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div variants={itemVariants}>
          <AggregateKpiCard
            variant="balance"
            value={fmtMoney(aggregate.totalBalance)}
            sub={`${aggregate.accountCount} account${aggregate.accountCount === 1 ? '' : 's'}`}
            spark={aggregate.equitySpark}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <AggregateKpiCard
            variant="equity"
            value={fmtMoney(aggregate.totalEquity)}
            sub={`Free ${fmtMoney(aggregate.totalFreeMargin)}`}
            spark={aggregate.equitySpark}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <AggregateKpiCard
            variant="pnl"
            value={`${pnlUp ? '+' : ''}${fmtMoney(aggregate.todayPnlTotal)}`}
            sub=""
            pct={aggregate.todayPnlPct}
            spark={pnlSpark}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <AggregateKpiCard
            variant="positions"
            value={String(aggregate.openPositionsTotal)}
            sub={`Closed-today implied by sum`}
            spark={positionsSpark}
          />
        </motion.div>
      </div>

      {/* Aggregate Equity Curve + Sessions (reuse single-account components) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <motion.div variants={itemVariants} className="lg:col-span-8">
          <EquityCurveCard
            spark={aggregate.equitySpark}
            todayPnl={aggregate.todayPnlTotal}
            balance={aggregate.totalBalance}
          />
        </motion.div>
        <motion.div variants={itemVariants} className="lg:col-span-4">
          <SessionsCard sessions={aggregate.sessions} />
        </motion.div>
      </div>

      {/* Per-account breakdown table */}
      <motion.div variants={itemVariants}>
        <PerAccountBreakdownTable rows={aggregate.perAccount} />
      </motion.div>

      {/* Live Watchlist (same market data applies across all accounts) */}
      <motion.div variants={itemVariants}>
        <WatchlistCard fallbackSymbols={aggregate.symbols} />
      </motion.div>
    </motion.div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────
export function DashboardPanel() {
  const { activeAccountId, viewMode, setViewMode } = useActiveAccount()
  const query = useQuery({
    queryKey: ['dashboard', activeAccountId],
    queryFn: () => api.dashboard(activeAccountId ?? undefined),
    refetchInterval: 10000,
  })
  const data = query.data

  // Aggregate query — only fetched when viewMode === 'all' (React Query will still
  // mount the query but it's gated by enabled to avoid unnecessary network traffic).
  const aggregateQuery = useQuery({
    queryKey: ['dashboard-aggregate'],
    queryFn: () =>
      fetch('/api/dashboard/aggregate').then((r) => r.json()) as Promise<{
        aggregate: AggregatePayload
      }>,
    refetchInterval: 15_000,
    enabled: viewMode === 'all',
  })
  const aggregate = aggregateQuery.data?.aggregate

  // Topbar row: toggle between single & all-accounts view.
  const topbarToggle = (
    <div className="flex items-center justify-end px-4 pt-4 md:px-6 md:pt-6">
      <ViewModeToggle
        viewMode={viewMode}
        onChange={setViewMode}
        accountCount={aggregate?.accountCount ?? 0}
      />
    </div>
  )

  // "All Accounts" branch — render the AggregateOverview (with its own skeleton state).
  if (viewMode === 'all') {
    if (aggregateQuery.isLoading && !aggregate) {
      return (
        <>
          {topbarToggle}
          <DashboardSkeleton />
        </>
      )
    }
    if (aggregateQuery.isError || !aggregate) {
      return (
        <>
          {topbarToggle}
          <div className="p-6">
            <Card>
              <CardContent className="py-12 text-center">
                <p className="mb-3 text-sm text-muted-foreground">Gagal memuat aggregate dashboard.</p>
                <Button
                  onClick={() => aggregateQuery.refetch()}
                  variant="outline"
                  size="sm"
                >
                  Coba lagi
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )
    }
    return (
      <>
        {topbarToggle}
        <AggregateOverview aggregate={aggregate} />
      </>
    )
  }

  // Default: single-account view (unchanged behavior).
  if (query.isLoading && !data) {
    return (
      <>
        {topbarToggle}
        <DashboardSkeleton />
      </>
    )
  }

  if (query.isError || !data) {
    return (
      <>
        {topbarToggle}
        <div className="p-6">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="mb-3 text-sm text-muted-foreground">Gagal memuat dashboard.</p>
              <Button onClick={() => query.refetch()} variant="outline" size="sm">
                Coba lagi
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      {topbarToggle}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-4 p-4 md:p-6"
      >
        {/* KPI Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div variants={itemVariants}>
            <KpiAccountCard account={data.defaultAccount} spark={data.equitySpark} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiPnlCard
              pnl={data.todayPnl}
              pct={data.todayPnlPct}
              closedTrades={data.todayClosedTrades}
            />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiRiskCard risk={data.riskUsage} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KpiOpenPositionsCard
              trades={data.openTrades}
              closedCount={data.todayClosedTrades.length}
            />
          </motion.div>
        </div>

        {/* Next Economic Event Widget */}
        <motion.div variants={itemVariants}>
          <NextEventWidget />
        </motion.div>

        {/* Performance Today */}
        <motion.div variants={itemVariants}>
          <PerformanceTodayCard />
        </motion.div>

        {/* Equity Curve + Sessions */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <motion.div variants={itemVariants} className="lg:col-span-8">
            <EquityCurveCard
              spark={data.equitySpark}
              todayPnl={data.todayPnl}
              balance={data.defaultAccount?.balance ?? 0}
            />
          </motion.div>
          <motion.div variants={itemVariants} className="lg:col-span-4">
            <SessionsCard sessions={data.sessions} />
          </motion.div>
        </div>

        {/* Watchlist + AI Signals + Top News */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <motion.div variants={itemVariants} className="lg:col-span-4">
            <WatchlistCard fallbackSymbols={data.symbols} />
          </motion.div>
          <motion.div variants={itemVariants} className="lg:col-span-4">
            <AiSignalsCard signals={data.latestSignals} />
          </motion.div>
          <motion.div variants={itemVariants} className="lg:col-span-4">
            <TopNewsCard news={data.topNews} />
          </motion.div>
        </div>

        {/* Open Positions Table */}
        <motion.div variants={itemVariants}>
          <OpenPositionsCard trades={data.openTrades} />
        </motion.div>
      </motion.div>
    </>
  )
}
