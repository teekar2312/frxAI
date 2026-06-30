'use client'

// Trade Analytics Panel — Task ID: r5-NOTES (subagent 3)
// Performance journal: win rate, P&L by pair/session/source, equity curve,
// streak analysis, P&L distribution. Plus a Trade Journal section with
// inline note editing, hashtag tag system, and tag-based filtering.

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  BarChart3, TrendingUp, TrendingDown, Trophy, Flame, Target,
  Activity, Clock, Award, Zap, Calendar, Percent, DollarSign,
  Loader2, BarChart2, PieChart as PieIcon, LineChart as LineIcon,
  Download, FileSpreadsheet, FileText, Gauge, Shield, TrendingDown as TrendDown,
  ArrowUpDown, Crosshair, PlayCircle,
  NotebookPen, Tag, Pencil, Save, X, Hash, ListFilter, MessageSquareText,
} from 'lucide-react'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
  CartesianGrid, BarChart, Bar, Cell, PieChart, Pie, LineChart, Line,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'

import { api } from '@/lib/api'
import type { TradeAnalytics as Analytics, Trade } from '@/lib/types'
import { fmtMoney, fmtPct, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useActiveAccount } from '@/hooks/use-active-account'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip, TooltipTrigger, TooltipContent,
} from '@/components/ui/tooltip'

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  auto: 'Auto (AI)',
  ai: 'AI Signal',
}

const SESSION_COLORS: Record<string, string> = {
  Overlap: '#10b981',
  London: '#22d3ee',
  'New York': '#a78bfa',
  Tokyo: '#f59e0b',
  Sydney: '#f43f5e',
  'Off-Session': '#64748b',
}

// ===== Trade Journal helpers (Task r5-NOTES) =====

const NOTE_MAX = 500
const SUGGESTED_TAGS = [
  'momentum', 'news-spike', 'scalp', 'London-open',
  'NY-open', 'Asian-range', 'breakout', 'reversal',
]

// Tailwind palette cycle for tags (must match tagColor index). Keys here
// mirror the order in TAG_PALETTE so they can be referenced together.
const TAG_PALETTE = [
  { badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
  { badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30', dot: 'bg-violet-400' },
  { badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30', dot: 'bg-sky-400' },
  { badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30', dot: 'bg-rose-400' },
  { badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30', dot: 'bg-teal-400' },
]

// Parse hashtags from a comment string. Returns lowercased, de-duplicated list
// without the leading '#'. Supports letters, digits, dashes and underscores.
function parseTags(comment: string | null | undefined): string[] {
  if (!comment) return []
  const matches = comment.match(/#([a-zA-Z0-9][a-zA-Z0-9_-]*)/g) || []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of matches) {
    const tag = m.slice(1).toLowerCase()
    if (!seen.has(tag)) {
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}

// Stable hash → tag color index. Ensures the same tag always renders with the
// same color across renders and trades.
function tagColor(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) | 0
  }
  const idx = Math.abs(h) % TAG_PALETTE.length
  return TAG_PALETTE[idx].badge
}

function tagDot(tag: string): string {
  let h = 0
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) | 0
  }
  const idx = Math.abs(h) % TAG_PALETTE.length
  return TAG_PALETTE[idx].dot
}

function KpiCard({
  label, value, sublabel, icon: Icon, color = 'emerald', trend,
}: {
  label: string
  value: string
  sublabel?: string
  icon: any
  color?: 'emerald' | 'rose' | 'amber' | 'cyan' | 'violet'
  trend?: 'up' | 'down' | 'flat'
}) {
  const colorMap = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    rose: 'text-rose-400 bg-rose-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', colorMap[color])}>
              <Icon className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className={cn(
            'text-2xl font-bold tabular',
            trend === 'up' && 'text-bull',
            trend === 'down' && 'text-bear',
          )}>
            {value}
          </p>
          {sublabel && <p className="text-[11px] text-muted-foreground mt-0.5">{sublabel}</p>}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function WinRateGauge({ winRate, wins, losses }: { winRate: number; wins: number; losses: number }) {
  const data = [{ name: 'winRate', value: winRate, fill: winRate >= 60 ? 'var(--bull)' : winRate >= 45 ? 'var(--warn)' : 'var(--bear)' }]
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Percent className="h-4 w-4 text-emerald-500" />
          Win Rate
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        <div className="relative">
          <ResponsiveContainer width={180} height={140}>
            <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background={{ fill: 'var(--muted)' }} dataKey="value" cornerRadius={10} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tabular">{winRate.toFixed(1)}%</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 ml-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-bull" />
            <span className="text-xs text-muted-foreground">Wins</span>
            <span className="text-sm font-bold tabular text-bull">{wins}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-bear" />
            <span className="text-xs text-muted-foreground">Losses</span>
            <span className="text-sm font-bold tabular text-bear">{losses}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EquityCurve({ data }: { data: { t: string; equity: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <LineIcon className="h-4 w-4 text-emerald-500" />
            Equity Curve (Cumulative P&L)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
          <div className="text-center">
            <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
            Belum ada trade closed untuk ditampilkan
          </div>
        </CardContent>
      </Card>
    )
  }
  const chartData = data.map((d) => ({ ...d, label: new Date(d.t).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) }))
  const isPositive = data[data.length - 1]?.equity >= 0
  const stroke = isPositive ? 'var(--bull)' : 'var(--bear)'
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <LineIcon className="h-4 w-4 text-emerald-500" />
            Equity Curve (Cumulative P&L)
          </CardTitle>
          <Badge variant="outline" className={cn('text-xs', isPositive ? 'text-bull border-bull/30' : 'text-bear border-bear/30')}>
            {isPositive ? '+' : ''}{fmtMoney(data[data.length - 1]?.equity || 0)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={30} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} />
            <RTooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted-foreground)' }}
              formatter={(v: any) => [fmtMoney(Number(v)), 'Cumulative P&L']}
            />
            <Area type="monotone" dataKey="equity" stroke={stroke} strokeWidth={2} fill="url(#eqGrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function PnlDistribution({ data }: { data: { range: string; count: number }[] }) {
  const colors = ['var(--bear)', '#f87171', '#fbbf24', '#86efac', 'var(--bull)', 'var(--bull)']
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-emerald-500" />
          Distribusi P&L per Trade
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="range" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <RTooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={colors[i] || 'var(--muted-foreground)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function ByPairChart({ data }: { data: { symbol: string; trades: number; winRate: number; netPnl: number }[] }) {
  if (!data || data.length === 0) {
    return <EmptyChart title="Performa per Pair" icon={Trophy} />
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-emerald-500" />
          Performa per Pair
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.map((d) => (
            <div key={d.symbol} className="flex items-center gap-3">
              <span className="w-16 text-xs font-mono font-semibold shrink-0">{d.symbol}</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-6 rounded bg-muted overflow-hidden relative">
                  <div
                    className={cn('h-full rounded', d.netPnl >= 0 ? 'bg-bull/70' : 'bg-bear/70')}
                    style={{ width: `${Math.min(100, Math.abs(d.netPnl) / Math.max(1, Math.max(...data.map((x) => Math.abs(x.netPnl)))) * 100)}%` }}
                  />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-mono font-bold tabular">
                    {d.netPnl >= 0 ? '+' : ''}{fmtMoney(d.netPnl)}
                  </span>
                </div>
              </div>
              <div className="w-16 text-right shrink-0">
                <span className="text-[10px] text-muted-foreground">{d.trades} trade</span>
                <span className={cn('block text-[11px] font-mono font-bold', d.winRate >= 50 ? 'text-bull' : 'text-bear')}>
                  {d.winRate.toFixed(0)}% win
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function BySessionChart({ data }: { data: { session: string; trades: number; winRate: number; netPnl: number }[] }) {
  if (!data || data.length === 0) {
    return <EmptyChart title="Performa per Sesi Trading" icon={Clock} />
  }
  const chartData = data.map((d) => ({ ...d, fill: SESSION_COLORS[d.session] || 'var(--muted-foreground)' }))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-500" />
          P&L per Sesi Trading
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} />
            <YAxis type="category" dataKey="session" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={70} />
            <RTooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
              formatter={(v: any, _n: any, p: any) => [fmtMoney(Number(v)), `P&L (${p.payload.trades} trade, ${p.payload.winRate.toFixed(0)}% win)`]}
            />
            <Bar dataKey="netPnl" radius={[0, 4, 4, 0]}>
              {chartData.map((d, i) => <Cell key={i} fill={d.netPnl >= 0 ? d.fill : 'var(--bear)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function BySourceChart({ data }: { data: { source: string; trades: number; winRate: number; netPnl: number }[] }) {
  if (!data || data.length === 0) {
    return <EmptyChart title="Performa per Sumber (Manual/Auto/AI)" icon={Zap} />
  }
  const total = data.reduce((s, d) => s + d.trades, 0)
  const pieData = data.map((d) => ({ name: SOURCE_LABELS[d.source] || d.source, value: d.trades, pnl: d.netPnl, winRate: d.winRate, fill: d.source === 'ai' ? 'var(--chart-5)' : d.source === 'auto' ? 'var(--chart-3)' : 'var(--chart-1)' }))
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <PieIcon className="h-4 w-4 text-emerald-500" />
          Sumber Trade
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <RTooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: any, _n: any, p: any) => [`${v} trade (${p.payload.winRate.toFixed(0)}% win, ${fmtMoney(p.payload.pnl)})`, p.payload.name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1.5">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.fill }} />
                  {d.name}
                </span>
                <span className="font-mono tabular text-muted-foreground">
                  {d.value} ({total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ─── Advanced Performance Metrics Card ─────────────────────────────────── */

interface AdvancedMetrics {
  expectancy?: number
  avgRR?: number
  maxDrawdown?: number
  maxDrawdownPct?: number
  sharpeRatio?: number
  sortinoRatio?: number
  largestWin?: number
  largestLoss?: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  netProfit: number
  winRate: number
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: any
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'bull' | 'bear' | 'warn' | 'violet'
}) {
  const toneClass = {
    default: 'text-foreground',
    bull: 'text-emerald-500',
    bear: 'text-rose-500',
    warn: 'text-amber-500',
    violet: 'text-violet-500',
  }[tone]
  const glowClass = {
    default: 'bg-muted/20',
    bull: 'bg-emerald-500/10',
    bear: 'bg-rose-500/10',
    warn: 'bg-amber-500/10',
    violet: 'bg-violet-500/10',
  }[tone]
  return (
    <div className="relative rounded-lg border border-border/60 bg-card/50 p-3 overflow-hidden hover:border-border transition-colors">
      <div className={cn('pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full blur-2xl', glowClass)} />
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('h-3 w-3', toneClass)} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className={cn('text-lg font-bold tabular font-mono', toneClass)}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function AdvancedMetricsCard({ m }: { m: AdvancedMetrics }) {
  const expectancy = m.expectancy ?? 0
  const expTone = expectancy >= 0 ? 'bull' : 'bear'
  const sharpe = m.sharpeRatio ?? 0
  const sharpeTone = sharpe >= 1 ? 'bull' : sharpe >= 0 ? 'warn' : 'bear'
  const sortino = m.sortinoRatio ?? 0
  const sortinoTone = sortino >= 1 ? 'bull' : sortino >= 0 ? 'warn' : 'bear'
  const ddPct = m.maxDrawdownPct ?? 0
  const ddTone = ddPct < 5 ? 'bull' : ddPct < 15 ? 'warn' : 'bear'
  const rr = m.avgRR ?? 0
  const rrTone = rr >= 1.5 ? 'bull' : rr >= 1 ? 'warn' : 'bear'
  const pf = m.profitFactor
  const pfTone = pf >= 1.5 ? 'bull' : pf >= 1 ? 'warn' : 'bear'

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15">
              <Gauge className="h-4 w-4 text-violet-500" />
            </div>
            <div>
              <CardTitle className="text-base">Advanced Performance Metrics</CardTitle>
              <CardDescription className="text-xs">Risk-adjusted return analysis · Sharpe, Sortino, Drawdown, Expectancy</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="border-violet-500/40 text-violet-500 shrink-0">
            <Activity className="h-3 w-3 mr-1" />
            {m.winRate.toFixed(0)}% WR
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <MetricTile
            icon={DollarSign}
            label="Expectancy"
            value={`$${expectancy.toFixed(2)}`}
            sub="per trade"
            tone={expTone}
          />
          <MetricTile
            icon={ArrowUpDown}
            label="Avg R:R"
            value={`1:${rr.toFixed(2)}`}
            sub={`win $${m.avgWin.toFixed(0)} / loss $${Math.abs(m.avgLoss).toFixed(0)}`}
            tone={rrTone}
          />
          <MetricTile
            icon={TrendDown}
            label="Max Drawdown"
            value={`-${ddPct.toFixed(1)}%`}
            sub={`$${Math.abs(m.maxDrawdown ?? 0).toFixed(2)}`}
            tone={ddTone}
          />
          <MetricTile
            icon={Gauge}
            label="Profit Factor"
            value={pf.toFixed(2)}
            sub={pf >= 1.5 ? 'Excellent' : pf >= 1 ? 'Profitable' : 'Unprofitable'}
            tone={pfTone}
          />
          <MetricTile
            icon={Zap}
            label="Sharpe Ratio"
            value={sharpe.toFixed(2)}
            sub="annualized"
            tone={sharpeTone}
          />
          <MetricTile
            icon={Crosshair}
            label="Sortino Ratio"
            value={sortino.toFixed(2)}
            sub="downside-adjusted"
            tone={sortinoTone}
          />
          <MetricTile
            icon={TrendingUp}
            label="Largest Win"
            value={`+$${(m.largestWin ?? 0).toFixed(2)}`}
            sub="single trade"
            tone="bull"
          />
          <MetricTile
            icon={TrendingDown}
            label="Largest Loss"
            value={`-$${Math.abs(m.largestLoss ?? 0).toFixed(2)}`}
            sub="single trade"
            tone="bear"
          />
        </div>

        {/* Interpretation bar */}
        <div className="mt-4 rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Interpretasi: </span>
              {expectancy >= 0
                ? `Sistem menghasilkan rata-rata +$${expectancy.toFixed(2)} per trade. `
                : `Sistem rugi rata-rata $${Math.abs(expectancy).toFixed(2)} per trade. `}
              {pf >= 1.5
                ? 'Profit factor sangat sehat (>1.5). '
                : pf >= 1
                  ? 'Profit factor profitable (>1.0). '
                  : 'Profit factor di bawah 1.0 — perlu evaluasi. '}
              {ddPct < 5
                ? 'Drawdown terkendali (<5%).'
                : ddPct < 15
                  ? 'Drawdown moderat (5-15%).'
                  : 'Drawdown tinggi (>15%) — perlu manajemen risk lebih ketat.'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DailyPnlChart({ data }: { data: { day: string; trades: number; netPnl: number }[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4 text-emerald-500" />
          P&L Harian (30 hari terakhir)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) }))} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(0)}`} />
            <RTooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
              formatter={(v: any, _n, p: any) => [fmtMoney(Number(v)), `P&L (${p.payload.trades} trade)`]}
            />
            <Bar dataKey="netPnl" radius={[3, 3, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.netPnl >= 0 ? 'var(--bull)' : 'var(--bear)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function StreakCard({ analytics }: { analytics: Analytics }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-500" />
          Streak Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Current Win Streak</span>
          <Badge className={cn('font-mono', analytics.consecutiveWins > 0 ? 'bg-bull/15 text-bull' : 'bg-muted text-muted-foreground')}>
            {analytics.consecutiveWins} 🔥
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Current Loss Streak</span>
          <Badge className={cn('font-mono', analytics.consecutiveLosses > 0 ? 'bg-bear/15 text-bear' : 'bg-muted text-muted-foreground')}>
            {analytics.consecutiveLosses} ❄️
          </Badge>
        </div>
        <div className="border-t border-border pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Award className="h-3 w-3 text-amber-400" /> Max Win Streak
            </span>
            <span className="text-sm font-bold tabular text-bull">{analytics.maxConsecutiveWins}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-rose-400" /> Max Loss Streak
            </span>
            <span className="text-sm font-bold tabular text-bear">{analytics.maxConsecutiveLosses}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyChart({ title, icon: Icon }: { title: string; icon: any }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
        <div className="text-center">
          <Icon className="h-8 w-8 mx-auto mb-2 opacity-30" />
          Belum ada data trade
        </div>
      </CardContent>
    </Card>
  )
}

// ===== Trade Journal subcomponents (Task r5-NOTES) =====

function TagBadge({ tag, onClick, active }: { tag: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors',
        tagColor(tag),
        onClick && 'hover:scale-[1.04] hover:brightness-125 cursor-pointer',
        active && 'ring-2 ring-offset-1 ring-offset-background ring-emerald-400',
      )}
    >
      <Hash className="h-2.5 w-2.5 opacity-70" />
      {tag}
    </button>
  )
}

function NoteEditorDialog({
  trade, open, onOpenChange, onSave,
}: {
  trade: Trade | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSave: (comment: string) => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  // Sync local text whenever a new trade is opened for editing.
  useEffect(() => {
    if (open && trade) {
      setText(trade.comment ?? '')
    }
  }, [open, trade?.id])

  const insertTag = (tag: string) => {
    setText((prev) => {
      const tagToken = `#${tag}`
      // Avoid duplicate tag tokens.
      if (new RegExp(`#${tag}(\\b|$)`, 'i').test(prev)) return prev
      const trimmed = prev.replace(/\s+$/, '')
      const sep = trimmed.length === 0 ? '' : (trimmed.endsWith('\n') ? '' : ' ')
      const next = `${trimmed}${sep}${tagToken}`
      return next.length > NOTE_MAX ? next.slice(0, NOTE_MAX) : next
    })
  }

  const handleSave = () => {
    setSaving(true)
    try {
      onSave(text.slice(0, NOTE_MAX))
    } finally {
      setSaving(false)
    }
  }

  const over = text.length > NOTE_MAX
  const count = Math.min(text.length, NOTE_MAX)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <NotebookPen className="h-4 w-4 text-emerald-500" />
            Catatan Trade
          </DialogTitle>
          <DialogDescription>
            {trade ? (
              <span className="font-mono">
                {trade.side.toUpperCase()} {trade.symbol} · {trade.lotSize} lot · P&L{' '}
                <span className={trade.pnl >= 0 ? 'text-bull' : 'text-bear'}>
                  {fmtMoney(trade.pnl)}
                </span>
              </span>
            ) : null}
            {' '}— tambahkan hashtag (mis. <span className="font-mono">#momentum</span>) untuk tag otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tulis catatan trading: setup, alasan entry, pelajaran, dll. Gunakan #tag untuk mengkategorikan."
              className="min-h-[120px] resize-y text-sm"
              maxLength={NOTE_MAX + 50}
              autoFocus
            />
            <span
              className={cn(
                'absolute bottom-2 right-3 text-[10px] font-mono tabular px-1.5 py-0.5 rounded',
                over ? 'bg-rose-500/20 text-rose-300' : 'bg-muted text-muted-foreground',
              )}
            >
              {count} / {NOTE_MAX}
            </span>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Tag cepat
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map((t) => (
                <TagBadge key={t} tag={t} onClick={() => insertTag(t)} />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={saving}>
              <X className="h-4 w-4" /> Batal
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || over}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Catatan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function JournalStatsRow({ trades }: { trades: Trade[] }) {
  const stats = useMemo(() => {
    let notesCount = 0
    let taggedCount = 0
    const tagFreq = new Map<string, number>()
    for (const t of trades) {
      const tags = parseTags(t.comment)
      if (t.comment && t.comment.trim().length > 0) notesCount++
      if (tags.length > 0) {
        taggedCount++
        for (const tag of tags) {
          tagFreq.set(tag, (tagFreq.get(tag) || 0) + 1)
        }
      }
    }
    let topTag: string | null = null
    let topCount = 0
    for (const [tag, c] of tagFreq.entries()) {
      if (c > topCount) {
        topCount = c
        topTag = tag
      }
    }
    return {
      notesCount,
      taggedCount,
      total: trades.length,
      topTag,
      topCount,
      uniqueTags: tagFreq.size,
    }
  }, [trades])

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-emerald-300">
        <MessageSquareText className="h-3 w-3" />
        <span className="font-semibold">{stats.notesCount}</span>
        <span className="opacity-70">catatan</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 border border-violet-500/20 px-2 py-1 text-violet-300">
        <Tag className="h-3 w-3" />
        <span className="font-semibold">{stats.taggedCount} / {stats.total}</span>
        <span className="opacity-70">trade ditandai</span>
      </span>
      {stats.topTag ? (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-amber-300">
          <Flame className="h-3 w-3" />
          <span className="opacity-70">Tag terpopuler:</span>
          <TagBadge tag={stats.topTag} />
          <span className="font-mono opacity-70">×{stats.topCount}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted border border-border px-2 py-1 text-muted-foreground">
          <Tag className="h-3 w-3" />
          Belum ada tag
        </span>
      )}
      {stats.uniqueTags > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted border border-border px-2 py-1 text-muted-foreground">
          <Hash className="h-3 w-3" />
          <span className="font-semibold">{stats.uniqueTags}</span> tag unik
        </span>
      )}
    </div>
  )
}

function TradeJournalSection({ trades }: { trades: Trade[] }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Trade | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [replayTrade, setReplayTrade] = useState<Trade | null>(null)
  const [replayOpen, setReplayOpen] = useState(false)

  // All unique tags across the loaded trades, sorted by frequency desc.
  const allTags = useMemo(() => {
    const freq = new Map<string, number>()
    for (const t of trades) {
      for (const tag of parseTags(t.comment)) {
        freq.set(tag, (freq.get(tag) || 0) + 1)
      }
    }
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [trades])

  const filteredTrades = useMemo(() => {
    const list = activeTag
      ? trades.filter((t) => parseTags(t.comment).includes(activeTag))
      : trades
    return list
  }, [trades, activeTag])

  const noteMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.updateTradeNotes(id, comment.trim() === '' ? null : comment.trim()),
    onSuccess: (_res, vars) => {
      toast.success('📝 Catatan trade disimpan', {
        description: vars.comment.trim() === '' ? 'Catatan dikosongkan' : 'Trade diperbarui di journal',
      })
      qc.invalidateQueries({ queryKey: ['trades', 'closed'] })
      qc.invalidateQueries({ queryKey: ['analytics'] })
      setDialogOpen(false)
      setEditing(null)
    },
    onError: (e: any) => toast.error('Gagal menyimpan catatan', { description: e.message }),
  })

  const openEditor = (trade: Trade) => {
    setEditing(trade)
    setDialogOpen(true)
  }

  if (trades.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-emerald-500" />
              Trade Journal
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {filteredTrades.length} trade · klik catatan untuk edit · gunakan <span className="font-mono">#tag</span> untuk kategori
            </CardDescription>
          </div>
          <JournalStatsRow trades={trades} />
        </div>

        {/* Tag filter bar */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 mt-2 border-t border-border">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
              <ListFilter className="h-3 w-3" /> Filter:
            </span>
            <AnimatePresence mode="popLayout">
              {allTags.map((tag) => (
                <motion.div
                  key={tag}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                >
                  <TagBadge
                    tag={tag}
                    active={activeTag === tag}
                    onClick={() => setActiveTag((cur) => (cur === tag ? null : tag))}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {activeTag && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                onClick={() => setActiveTag(null)}
              >
                <X className="h-3 w-3" /> Hapus filter
              </Button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="rounded-lg border border-border overflow-hidden">
          <div
            className="max-h-96 overflow-y-auto"
            style={{ scrollbarWidth: 'thin' }}
          >
            <style>{`
              .fj-scroll::-webkit-scrollbar { width: 8px; }
              .fj-scroll::-webkit-scrollbar-track { background: transparent; }
              .fj-scroll::-webkit-scrollbar-thumb { background: hsl(var(--border)); border-radius: 4px; }
              .fj-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground)); }
            `}</style>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="hover:bg-transparent border-border">
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3">Waktu</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3">Symbol</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3">Side</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3 text-right">Lot</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3 text-right">P&L</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3 text-right">Pips</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3">Source</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3 min-w-[220px]">Catatan</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground h-8 px-3 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {filteredTrades.map((t) => {
                    const tags = parseTags(t.comment)
                    const isWin = t.pnl >= 0
                    return (
                      <motion.tr
                        key={t.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          'border-b border-border/60 transition-colors group',
                          isWin ? 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.09]' : 'bg-rose-500/[0.04] hover:bg-rose-500/[0.09]',
                        )}
                      >
                        <TableCell className="text-[11px] text-muted-foreground px-3 py-2 whitespace-nowrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{relativeTime(t.closeTime || t.openTime)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(t.closeTime || t.openTime).toLocaleString('id-ID')}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <span className="font-mono font-semibold text-xs">{t.symbol}</span>
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0',
                              t.side === 'buy'
                                ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                                : 'border-rose-500/40 text-rose-300 bg-rose-500/10',
                            )}
                          >
                            {t.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right font-mono text-xs tabular">{t.lotSize.toFixed(2)}</TableCell>
                        <TableCell className={cn('px-3 py-2 text-right font-mono text-xs tabular font-bold', isWin ? 'text-bull' : 'text-bear')}>
                          {t.pnl >= 0 ? '+' : ''}{fmtMoney(t.pnl)}
                        </TableCell>
                        <TableCell className={cn('px-3 py-2 text-right font-mono text-xs tabular', isWin ? 'text-bull' : 'text-bear')}>
                          {t.pips >= 0 ? '+' : ''}{t.pips.toFixed(1)}
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0',
                              t.source === 'ai' ? 'border-violet-500/40 text-violet-300 bg-violet-500/10' : 'border-border text-muted-foreground',
                            )}
                          >
                            {SOURCE_LABELS[t.source] || t.source}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => openEditor(t)}
                            className="text-left w-full min-h-[28px] rounded hover:bg-background/60 px-1.5 py-1 -mx-1.5 transition-colors"
                          >
                            {t.comment && t.comment.trim().length > 0 ? (
                              <span className="flex flex-wrap items-center gap-1">
                                <span className="text-[11px] text-foreground/90 line-clamp-1">{t.comment.replace(/#[a-zA-Z0-9_-]+/g, '').trim()}</span>
                                {tags.map((tag) => (
                                  <TagBadge key={tag} tag={tag} />
                                ))}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/60 italic">Tambah catatan...</span>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-sky-400 hover:bg-sky-500/10"
                                  onClick={() => { setReplayTrade(t); setReplayOpen(true) }}
                                >
                                  <PlayCircle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Replay trade</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-emerald-300 hover:bg-emerald-500/10"
                                  onClick={() => openEditor(t)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit catatan</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
                {filteredTrades.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                      Tidak ada trade dengan tag <span className="font-mono">#{activeTag}</span>
                    </td>
                  </tr>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
          <MessageSquareText className="h-3 w-3" />
          Klik kolom catatan atau ikon pensil untuk menambah/mengubah catatan. Gunakan hashtag untuk otomatis membuat tag.
        </p>
      </CardContent>

      <NoteEditorDialog
        trade={editing}
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v)
          if (!v) setEditing(null)
        }}
        onSave={(comment) => {
          if (editing) {
            noteMutation.mutate({ id: editing.id, comment })
          }
        }}
      />

      <TradeReplayDialog
        trade={replayTrade}
        open={replayOpen}
        onOpenChange={(v) => {
          setReplayOpen(v)
          if (!v) setReplayTrade(null)
        }}
      />
    </Card>
  )
}

/* ─── Trade Replay Dialog ──────────────────────────────────────────────── */

function TradeReplayDialog({
  trade,
  open,
  onOpenChange,
}: {
  trade: Trade | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  // r13-REPLAY: Fetch real bars from MT5 bridge via API (falls back to synthetic)
  const replayQ = useQuery({
    queryKey: ['trade-replay', trade?.id],
    queryFn: () => api.getTradeReplay(trade!.id),
    enabled: !!trade && open,
    staleTime: 60_000, // cache for 1 min — bars don't change
  })

  const chartData = replayQ.data?.bars ?? []
  const dataSource = replayQ.data?.source ?? 'loading'
  const isRealData = dataSource === 'mt5-bridge'

  if (!trade) return null

  const isBuy = trade.side === 'buy'
  const openPrice = trade.openPrice
  const closePrice = trade.closePrice ?? 0
  const sl = trade.stopLoss
  const tp = trade.takeProfit
  const pnl = trade.pnl
  const pips = trade.pips
  const won = pnl >= 0

  // Y-axis domain: include all price levels
  const allPrices = chartData.length > 0 ? chartData.map((d) => d.price) : [openPrice]
  if (sl) allPrices.push(sl)
  if (tp) allPrices.push(tp)
  allPrices.push(openPrice)
  if (closePrice) allPrices.push(closePrice)
  const minP = Math.min(...allPrices)
  const maxP = Math.max(...allPrices)
  const padding = (maxP - minP) * 0.1 || 0.001

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <PlayCircle className="h-4 w-4 text-sky-500" />
            Trade Replay: {trade.symbol} {trade.side.toUpperCase()}
            <Badge variant="outline" className={won ? 'border-emerald-500/40 text-emerald-500' : 'border-rose-500/40 text-rose-500'}>
              {won ? 'WIN' : 'LOSS'} {pips >= 0 ? '+' : ''}{pips.toFixed(1)}p
            </Badge>
            <Badge variant="secondary" className="capitalize">{trade.source}</Badge>
            {/* r13-REPLAY: data source badge */}
            {dataSource === 'loading' ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                Loading...
              </Badge>
            ) : isRealData ? (
              <Badge variant="outline" className="text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                ● Real MT5 Data
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300">
                ○ Synthetic Fallback
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {trade.lotSize} lot · Entry {openPrice} → Exit {closePrice || '—'} · P&L {won ? '+' : ''}${pnl.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        {/* Price chart with markers */}
        <div className="h-64 w-full rounded-lg border border-border/50 bg-card/30 p-2 relative">
          {replayQ.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="replayGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={won ? 'var(--bull)' : 'var(--bear)'} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={won ? 'var(--bull)' : 'var(--bear)'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                <XAxis dataKey="time" tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} />
                <YAxis domain={[minP - padding, maxP + padding]} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} tickFormatter={(v) => v.toFixed(5)} width={70} />
                <RTooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '11px' }}
                  labelStyle={{ color: 'var(--muted-foreground)' }}
                  formatter={(v: any) => [Number(v).toFixed(5), 'Price']}
                />
                <Area type="monotone" dataKey="price" stroke={won ? 'var(--bull)' : 'var(--bear)'} strokeWidth={1.5} fill="url(#replayGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Level markers legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Entry</div>
            <div className="font-mono tabular font-semibold text-sky-400">{openPrice}</div>
          </div>
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Stop Loss</div>
            <div className="font-mono tabular font-semibold text-rose-400">{sl ?? '—'}</div>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
            <div className="text-[10px] text-muted-foreground uppercase">Take Profit</div>
            <div className="font-mono tabular font-semibold text-emerald-400">{tp ?? '—'}</div>
          </div>
          <div className={cn('rounded-lg border p-2', won ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5')}>
            <div className="text-[10px] text-muted-foreground uppercase">Exit</div>
            <div className={cn('font-mono tabular font-semibold', won ? 'text-emerald-400' : 'text-rose-400')}>{closePrice || '—'}</div>
          </div>
        </div>

        {/* Trade details */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          <div className="flex justify-between p-2 rounded bg-muted/20">
            <span className="text-muted-foreground">Open Time</span>
            <span className="font-mono">{new Date(trade.openTime).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-muted/20">
            <span className="text-muted-foreground">Close Time</span>
            <span className="font-mono">{trade.closeTime ? new Date(trade.closeTime).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '—'}</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-muted/20">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-mono">{trade.closeTime ? `${Math.round((closeT - openT) / 60000)} min` : '—'}</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-muted/20">
            <span className="text-muted-foreground">Lot Size</span>
            <span className="font-mono">{trade.lotSize}</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-muted/20">
            <span className="text-muted-foreground">Commission</span>
            <span className="font-mono">${trade.commission}</span>
          </div>
          <div className="flex justify-between p-2 rounded bg-muted/20">
            <span className="text-muted-foreground">Net P&L</span>
            <span className={cn('font-mono font-semibold', won ? 'text-emerald-500' : 'text-rose-500')}>{won ? '+' : ''}${pnl.toFixed(2)}</span>
          </div>
        </div>

        {trade.comment && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-1">Journal Note</div>
            <p className="text-xs">{trade.comment}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AnalyticsPanel() {
  const [days, setDays] = useState('30')
  const [exporting, setExporting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const { activeAccountId } = useActiveAccount()

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', days, activeAccountId],
    queryFn: () => api.analytics({ days: parseInt(days), accountId: activeAccountId ?? undefined }),
    refetchInterval: 15000,
  })

  // Closed-trade list for the Trade Journal section (last 50). Scoped to the
  // active account so journal entries stay in sync with the analytics cards.
  const { data: closedTradesData } = useQuery({
    queryKey: ['trades', 'closed', 'journal', activeAccountId],
    queryFn: () => api.trades({ status: 'closed', accountId: activeAccountId ?? undefined, limit: 50 }),
    refetchInterval: 20000,
  })

  const a = data?.analytics
  const closedTrades = closedTradesData?.trades ?? []

  const onExportCsv = async () => {
    setExporting(true)
    try {
      await api.downloadTradesCsv({ status: 'closed' })
      toast.success('CSV berhasil diunduh', {
        description: 'Semua trade closed diekspor sebagai CSV (Excel-compatible)',
      })
    } catch (e: any) {
      toast.error('Gagal ekspor CSV', { description: e.message })
    } finally {
      setExporting(false)
    }
  }

  const onExportPdf = async () => {
    setExportingPdf(true)
    try {
      await api.downloadAnalyticsPdf({ days: parseInt(days), accountId: activeAccountId ?? undefined })
      toast.success('📊 Laporan PDF berhasil diunduh', {
        description: `Laporan HTML siap cetak untuk periode ${days} hari terakhir`,
      })
    } catch (e: any) {
      toast.error('Gagal ekspor PDF', { description: e.message })
    } finally {
      setExportingPdf(false)
    }
  }

  if (isLoading || !a) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-7 w-64 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    )
  }

  const hasData = a.totalClosed > 0

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-500" />
            Trade Analytics & Journal
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Performa trading: win rate, P&L per pair/sesi/sumber, equity curve, streak analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            disabled={exporting || a.totalClosed === 0}
            className="gap-2 h-9"
            title="Ekspor semua trade closed sebagai CSV (Excel-compatible)"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportPdf}
            disabled={exportingPdf || a.totalClosed === 0}
            className="gap-2 h-9 border-violet-500/40 bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200"
            title="Unduh laporan performa lengkap (HTML siap cetak ke PDF)"
          >
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 hari terakhir</SelectItem>
              <SelectItem value="14">14 hari terakhir</SelectItem>
              <SelectItem value="30">30 hari terakhir</SelectItem>
              <SelectItem value="90">90 hari terakhir</SelectItem>
              <SelectItem value="365">1 tahun terakhir</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Net Profit"
          value={fmtMoney(a.netProfit)}
          sublabel={`${a.totalClosed} trade closed`}
          icon={DollarSign}
          color={a.netProfit >= 0 ? 'emerald' : 'rose'}
          trend={a.netProfit >= 0 ? 'up' : 'down'}
        />
        <KpiCard
          label="Profit Factor"
          value={a.profitFactor.toFixed(2)}
          sublabel={a.profitFactor >= 1.5 ? 'Excellent' : a.profitFactor >= 1 ? 'Profitable' : 'Need improvement'}
          icon={Target}
          color={a.profitFactor >= 1.5 ? 'emerald' : a.profitFactor >= 1 ? 'amber' : 'rose'}
        />
        <KpiCard
          label="Avg Win / Avg Loss"
          value={`$${a.avgWin.toFixed(0)} / $${a.avgLoss.toFixed(0)}`}
          sublabel={`Ratio ${(a.avgLoss > 0 ? a.avgWin / a.avgLoss : 0).toFixed(2)}`}
          icon={Activity}
          color="cyan"
        />
        <KpiCard
          label="Avg Hold Time"
          value={a.avgHoldMinutes < 60 ? `${a.avgHoldMinutes.toFixed(0)}m` : `${(a.avgHoldMinutes / 60).toFixed(1)}h`}
          sublabel={`Best: ${fmtMoney(a.bestTrade)} · Worst: ${fmtMoney(a.worstTrade)}`}
          icon={Clock}
          color="violet"
        />
      </div>

      {!hasData && (
        <Card className="border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="py-8 text-center">
            <Activity className="h-10 w-10 mx-auto mb-3 text-amber-400 opacity-60" />
            <p className="text-sm font-medium text-amber-400 mb-1">Belum ada trade yang ditutup</p>
            <p className="text-xs text-muted-foreground">
              Buka dan tutup posisi di panel Live Trading untuk mulai mengisi journal analytics.
              Coba juga jalankan backtest di panel Backtesting untuk melihat simulasi performa.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Win rate gauge + streak */}
      <div className="grid gap-4 lg:grid-cols-3">
        <WinRateGauge winRate={a.winRate} wins={a.wins} losses={a.losses} />
        <StreakCard analytics={a} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Gross Profit</span>
              <span className="font-mono font-bold text-bull">{fmtMoney(a.grossProfit)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Gross Loss</span>
              <span className="font-mono font-bold text-bear">-{fmtMoney(a.grossLoss)}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-border pt-2">
              <span className="text-muted-foreground">Net Profit</span>
              <span className={cn('font-mono font-bold', a.netProfit >= 0 ? 'text-bull' : 'text-bear')}>{fmtMoney(a.netProfit)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Best Trade</span>
              <span className="font-mono font-bold text-bull">{fmtMoney(a.bestTrade)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Worst Trade</span>
              <span className="font-mono font-bold text-bear">{fmtMoney(a.worstTrade)}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-border pt-2">
              <span className="text-muted-foreground">Total Trades</span>
              <span className="font-mono font-bold">{a.totalClosed}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Win Rate</span>
              <span className="font-mono font-bold">{a.winRate.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Equity curve */}
      <EquityCurve data={a.equityCurve} />

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ByPairChart data={a.byPair} />
        <BySessionChart data={a.bySession} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BySourceChart data={a.bySource} />
        <PnlDistribution data={a.pnlDistribution} />
      </div>

      {/* Daily P&L */}
      <DailyPnlChart data={a.byDay} />

      {/* Advanced Performance Metrics */}
      <AdvancedMetricsCard m={{
        expectancy: a.expectancy,
        avgRR: a.avgRR,
        maxDrawdown: a.maxDrawdown,
        maxDrawdownPct: a.maxDrawdownPct,
        sharpeRatio: a.sharpeRatio,
        sortinoRatio: a.sortinoRatio,
        largestWin: a.largestWin,
        largestLoss: a.largestLoss,
        profitFactor: a.profitFactor,
        avgWin: a.avgWin,
        avgLoss: a.avgLoss,
        netProfit: a.netProfit,
        winRate: a.winRate,
      }} />

      {/* Trade Journal — last 50 closed trades with inline notes + hashtag tags */}
      <TradeJournalSection trades={closedTrades} />
    </div>
  )
}
