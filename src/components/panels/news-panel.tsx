'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  RefreshCw, Newspaper, TrendingUp, TrendingDown, Minus,
  ExternalLink, Clock, Zap, Activity, Filter, Calendar, Radio,
  Landmark, Users, Factory, BarChart3, Briefcase, ShoppingBag,
  ClipboardList, Globe, Coins, Gem, Inbox,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { NewsItem, NewsCategory } from '@/lib/types'
import { NEWS_CATEGORIES, SUPPORTED_SYMBOLS, SYMBOL_LABEL } from '@/lib/types'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

type SourceFilter = 'all' | 'finnhub' | 'marketaux' | 'breaking'
type ImpactFilter = 'all' | 'high' | 'medium' | 'low'

const CATEGORY_COLOR: Record<NewsCategory, string> = {
  central_bank: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  nfp: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  cpi: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  ppi: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  gdp: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  unemployment: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  retail: 'border-cyan-600/40 bg-cyan-600/10 text-cyan-300',
  pmi: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  geopolitical: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  fiscal: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  commodity: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  sentiment: 'border-cyan-600/40 bg-cyan-600/10 text-cyan-300',
  breaking: 'border-rose-500/60 bg-rose-500/15 text-rose-200',
}

// Category icon mapping — used in pill bar, card header and detail sheet
const CATEGORY_ICON: Record<NewsCategory, typeof Newspaper> = {
  central_bank: Landmark,
  nfp: Users,
  cpi: TrendingUp,
  ppi: Factory,
  gdp: BarChart3,
  unemployment: Briefcase,
  retail: ShoppingBag,
  pmi: ClipboardList,
  geopolitical: Globe,
  fiscal: Coins,
  commodity: Gem,
  sentiment: Activity,
  breaking: Radio,
}

const SOURCE_COLOR: Record<string, string> = {
  finnhub: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  marketaux: 'border-cyan-600/40 bg-cyan-600/10 text-cyan-300',
}
const SOURCE_LABEL: Record<string, string> = {
  finnhub: 'Finnhub',
  marketaux: 'MARKETAUX',
}

const IMPACT_STYLE: Record<NewsItem['impact'], { dot: string; badge: string; label: string }> = {
  high:   { dot: 'bg-rose-500 live-dot',                   badge: 'border-rose-500/50 bg-rose-500/15 text-rose-200',  label: 'High' },
  medium: { dot: 'bg-amber-400',                           badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300', label: 'Medium' },
  low:    { dot: 'bg-muted-foreground/60',                 badge: 'border-border bg-muted/40 text-muted-foreground',     label: 'Low' },
}

const lineClamp = (n: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: n,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

function parseSymbols(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'finnhub', label: 'Finnhub' },
  { value: 'marketaux', label: 'MARKETAUX' },
  { value: 'breaking', label: 'Breaking' },
]
const IMPACT_FILTERS: { value: ImpactFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

function SentimentIcon({ s }: { s: NewsItem['sentiment'] }) {
  if (s === 'bullish') return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
  if (s === 'bearish') return <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

function SentimentLabel({ s }: { s: NewsItem['sentiment'] }) {
  if (s === 'bullish') return <span className="text-emerald-400">Bullish &#9650;</span>
  if (s === 'bearish') return <span className="text-rose-400">Bearish &#9660;</span>
  return <span className="text-muted-foreground">Neutral &#9670;</span>
}

export function NewsPanel() {
  const qc = useQueryClient()
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<NewsCategory | 'all'>('all')
  const [impactFilter, setImpactFilter] = useState<ImpactFilter>('all')
  const [selected, setSelected] = useState<NewsItem | null>(null)

  const newsQ = useQuery({
    queryKey: ['news'],
    queryFn: () => api.news({ limit: 100 }),
    refetchInterval: 60_000,
  })
  const configQ = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api.systemConfig(),
    staleTime: 5 * 60_000,
  })

  const refreshMut = useMutation({
    mutationFn: () => api.refreshNews(),
    onSuccess: (data) => {
      toast.success(`${data.news.length} berita baru disintesis`)
      qc.invalidateQueries({ queryKey: ['news'] })
    },
    onError: () => toast.error('Gagal menyegarkan berita'),
  })

  const allNews = newsQ.data?.news ?? []
  const refreshMinutes = Number(configQ.data?.config?.newsRefreshMinutes ?? 15)

  const breakingItems = useMemo(
    () => allNews.filter((n) => n.category === 'breaking'),
    [allNews],
  )

  const filtered = useMemo(() => {
    return allNews.filter((n) => {
      if (sourceFilter === 'finnhub' && n.source !== 'finnhub') return false
      if (sourceFilter === 'marketaux' && n.source !== 'marketaux') return false
      if (sourceFilter === 'breaking' && n.category !== 'breaking') return false
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false
      if (impactFilter !== 'all' && n.impact !== impactFilter) return false
      return true
    })
  }, [allNews, sourceFilter, categoryFilter, impactFilter])

  const sentiment = useMemo(() => {
    const b = filtered.filter((n) => n.sentiment === 'bullish').length
    const r = filtered.filter((n) => n.sentiment === 'bearish').length
    const u = filtered.filter((n) => n.sentiment === 'neutral').length
    const total = b + r + u || 1
    return {
      bull: b,
      bear: r,
      neutral: u,
      total: b + r + u,
      bullPct: (b / total) * 100,
      bearPct: (r / total) * 100,
      neuPct: (u / total) * 100,
    }
  }, [filtered])

  const perSymbol = useMemo(() => {
    return SUPPORTED_SYMBOLS.map((sym) => {
      const items = filtered.filter((n) => parseSymbols(n.symbols).includes(sym))
      const b = items.filter((n) => n.sentiment === 'bullish').length
      const r = items.filter((n) => n.sentiment === 'bearish').length
      const u = items.filter((n) => n.sentiment === 'neutral').length
      return { symbol: sym, bull: b, bear: r, neutral: u, total: items.length, net: b - r }
    })
  }, [filtered])

  const calendar = useMemo(() => {
    const high = filtered.filter((n) => n.impact === 'high')
    const now = new Date()
    const groups: { label: string; items: NewsItem[] }[] = []
    for (let i = 0; i < 3; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999)
      const items = high.filter((n) => {
        const p = new Date(n.publishedAt)
        return p >= dayStart && p <= dayEnd
      })
      const label = i === 0 ? 'Hari ini' : i === 1 ? 'Kemarin' : '2 hari lalu'
      if (items.length) groups.push({ label, items })
    }
    return groups
  }, [filtered])

  const categoryCount = useMemo(() => {
    const m: Record<string, number> = {}
    for (const n of allNews) m[n.category] = (m[n.category] ?? 0) + 1
    return m
  }, [allNews])

  const latestBreaking = breakingItems[0]
  const isLoading = newsQ.isLoading
  const resetFilters = () => {
    setSourceFilter('all'); setCategoryFilter('all'); setImpactFilter('all')
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10">
              <Newspaper className="h-5 w-5 text-sky-400" />
              <span className="pointer-events-none absolute -right-2 -top-2 h-3 w-3 rounded-full bg-sky-400/40 blur-md" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">News Intelligence — Finnhub + MARKETAUX</h2>
              <p className="text-xs text-muted-foreground">
                {allNews.length} berita · {filtered.length} terfilter · 7 dimensi analisa + breaking
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
              <Radio className="h-3 w-3 text-emerald-400 live-dot" />
              Auto-refresh {refreshMinutes}m
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refreshMut.mutate()}
              disabled={refreshMut.isPending}
              className="gap-1.5 border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:text-sky-200"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshMut.isPending && 'animate-spin')} />
              {refreshMut.isPending ? 'Menyegarkan…' : 'Refresh News'}
            </Button>
          </div>
        </div>

        {/* Source filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Sumber:</span>
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setSourceFilter(f.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-all hover:scale-[1.03]',
                sourceFilter === f.value
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-sm shadow-emerald-500/20'
                  : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Breaking news banner */}
      <AnimatePresence>
        {latestBreaking && (
          <motion.div
            key={latestBreaking.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="relative overflow-hidden border-l-4 border-l-rose-500 border-rose-500/40 bg-rose-500/[0.06] py-3 transition-all hover:bg-rose-500/[0.1] hover:shadow-lg hover:shadow-rose-500/10">
              <span className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-rose-500/20 blur-2xl" />
              <CardContent
                className="flex cursor-pointer flex-col gap-2 px-4 py-0 md:flex-row md:items-center md:gap-4"
                onClick={() => setSelected(latestBreaking)}
              >
                <Badge className="w-fit gap-1 border-rose-500/60 bg-rose-500/20 text-rose-200 live-dot">
                  <Zap className="h-3 w-3" /> BREAKING
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{latestBreaking.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{latestBreaking.summary}</p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <div className="flex flex-wrap gap-1">
                    {parseSymbols(latestBreaking.symbols).slice(0, 3).map((s) => (
                      <span key={s} className="rounded bg-muted/60 px-1.5 py-0.5 font-mono">{s}</span>
                    ))}
                  </div>
                  <span className="whitespace-nowrap tabular">{relativeTime(latestBreaking.publishedAt)}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sentiment summary card with corner glow */}
      <Card className="relative overflow-hidden bg-gradient-to-r from-sky-500/[0.04] via-transparent to-transparent">
        <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl" />
        <CardHeader className="bg-gradient-to-r from-sky-500/5 to-transparent pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Sentimen Pasar — {filtered.length} berita terfilter
            </span>
            <span className="text-[11px] text-muted-foreground tabular">
              {sentiment.bull} bull · {sentiment.bear} bear · {sentiment.neutral} neutral
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${sentiment.bullPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="bg-emerald-500"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${sentiment.bearPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
              className="bg-rose-500"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${sentiment.neuPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
              className="bg-amber-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <SentimentStat
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Bullish"
              count={sentiment.bull}
              pct={sentiment.bullPct}
              colorClass="text-emerald-300"
              glow="bg-emerald-500/15"
              borderClass="border-emerald-500/30 bg-emerald-500/5"
            />
            <SentimentStat
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              label="Bearish"
              count={sentiment.bear}
              pct={sentiment.bearPct}
              colorClass="text-rose-300"
              glow="bg-rose-500/15"
              borderClass="border-rose-500/30 bg-rose-500/5"
            />
            <SentimentStat
              icon={<Minus className="h-3.5 w-3.5" />}
              label="Neutral"
              count={sentiment.neutral}
              pct={sentiment.neuPct}
              colorClass="text-amber-300"
              glow="bg-amber-500/15"
              borderClass="border-amber-500/30 bg-amber-500/5"
            />
          </div>
        </CardContent>
      </Card>

      {/* Category filter — horizontal scrollable pill bar with icons */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3 w-3" /> Kategori
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto scroll-thin px-1 pb-1">
          <CategoryPill
            active={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
            icon={<Filter className="h-3 w-3" />}
            label="Semua"
            count={allNews.length}
          />
          {NEWS_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c.value]
            const count = categoryCount[c.value] ?? 0
            return (
              <CategoryPill
                key={c.value}
                active={categoryFilter === c.value}
                onClick={() => setCategoryFilter(c.value)}
                icon={<Icon className="h-3 w-3" />}
                label={c.label}
                colorClass={categoryFilter === c.value ? CATEGORY_COLOR[c.value] : undefined}
                count={count}
              />
            )
          })}
        </div>
      </div>

      {/* Main grid: filters + feed */}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Sidebar filters */}
        <div className="flex flex-col gap-4">
          <Card className="relative overflow-hidden">
            <span className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-amber-500/15 blur-2xl" />
            <CardHeader className="bg-gradient-to-r from-amber-500/5 to-transparent pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-amber-400" /> Impact
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {IMPACT_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setImpactFilter(f.value)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all hover:scale-[1.03]',
                    impactFilter === f.value
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 shadow-sm shadow-amber-500/20'
                      : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Per-symbol sentiment */}
          <Card className="relative overflow-hidden">
            <span className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-cyan-500/15 blur-2xl" />
            <CardHeader className="bg-gradient-to-r from-cyan-500/5 to-transparent pb-2">
              <CardTitle className="text-sm">Sentimen per Pair</CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 space-y-2 overflow-y-auto scroll-thin">
              {perSymbol.map((p) => {
                const total = p.total || 1
                return (
                  <div
                    key={p.symbol}
                    className="rounded-md border border-border bg-muted/30 p-2 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold">{SYMBOL_LABEL[p.symbol]}</span>
                      <span
                        className={cn(
                          'font-mono text-[11px] tabular',
                          p.net > 0 ? 'text-emerald-400' : p.net < 0 ? 'text-rose-400' : 'text-muted-foreground',
                        )}
                      >
                        net {p.net > 0 ? '+' : ''}
                        {p.net}
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="bg-emerald-500" style={{ width: `${(p.bull / total) * 100}%` }} />
                      <div className="bg-rose-500" style={{ width: `${(p.bear / total) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(p.neutral / total) * 100}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] tabular">
                      <span className="text-emerald-400">&#9650;{p.bull}</span>
                      <span className="text-rose-400">&#9660;{p.bear}</span>
                      <span className="text-amber-400">&#9670;{p.neutral}</span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* News feed */}
        <Card className="relative flex flex-col overflow-hidden">
          <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-500/15 blur-2xl" />
          <CardHeader className="bg-gradient-to-r from-sky-500/5 to-transparent pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-sky-400" /> News Feed
              </span>
              <span className="text-[11px] text-muted-foreground tabular">{filtered.length} items</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-4 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-20" />
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-14" />
                    </div>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <div className="relative">
                  <Inbox className="h-12 w-12 text-muted-foreground/40" />
                  <span className="pointer-events-none absolute inset-0 -z-10 m-auto h-12 w-12 rounded-full bg-muted-foreground/10 blur-xl" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Tidak ada berita sesuai filter</p>
                  <p className="text-xs text-muted-foreground/70">
                    Coba ubah filter kategori atau impact, atau reset untuk melihat semua berita.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
                  <RefreshCw className="h-3 w-3" /> Reset filter
                </Button>
              </div>
            ) : (
              <ScrollArea className="max-h-[600px]">
                <div className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {filtered.map((n, i) => (
                      <NewsRow key={n.id} item={n} index={i} onClick={() => setSelected(n)} />
                    ))}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Impact calendar */}
      {calendar.length > 0 && (
        <Card className="relative overflow-hidden">
          <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-500/15 blur-2xl" />
          <CardHeader className="bg-gradient-to-r from-amber-500/5 to-transparent pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-amber-400" /> Impact Calendar — High-impact timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {calendar.map((g) => (
              <div key={g.label} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">{g.label}</span>
                  <Badge variant="secondary" className="text-[10px] tabular">{g.items.length} high</Badge>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto scroll-thin">
                  {g.items.map((n) => {
                    const impactStyle = IMPACT_STYLE[n.impact]
                    const Icon = CATEGORY_ICON[n.category]
                    return (
                      <div
                        key={n.id}
                        className="rounded-md border border-border bg-background/40 p-2 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-start gap-2">
                          <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', impactStyle.dot)} />
                          <button
                            onClick={() => setSelected(n)}
                            className="min-w-0 flex-1 text-left text-xs font-medium transition-colors hover:text-emerald-300"
                            style={lineClamp(2)}
                          >
                            {n.title}
                          </button>
                          <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="tabular">{relativeTime(n.publishedAt)}</span>
                          <SentimentIcon s={n.sentiment} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* News detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto scroll-thin sm:max-w-lg">
          {selected && (
            <>
              <SheetHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2 pr-6">
                  <span className={cn('h-2.5 w-2.5 rounded-full', IMPACT_STYLE[selected.impact].dot)} />
                  {(() => {
                    const Icon = CATEGORY_ICON[selected.category]
                    return (
                      <Badge
                        variant="outline"
                        className={cn('gap-0.5 px-1.5 py-0 text-[10px]', CATEGORY_COLOR[selected.category])}
                      >
                        <Icon className="h-2.5 w-2.5" />
                        {NEWS_CATEGORIES.find((c) => c.value === selected.category)?.label ?? selected.category}
                      </Badge>
                    )
                  })()}
                  <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', SOURCE_COLOR[selected.source] ?? '')}>
                    {SOURCE_LABEL[selected.source] ?? selected.source}
                  </Badge>
                  <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', IMPACT_STYLE[selected.impact].badge)}>
                    {IMPACT_STYLE[selected.impact].label} Impact
                  </Badge>
                </div>
                <SheetTitle className="text-left text-base leading-snug">{selected.title}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 text-xs">
                  <Clock className="h-3 w-3" />
                  <span className="tabular">{relativeTime(selected.publishedAt)}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="tabular">{new Date(selected.publishedAt).toLocaleString('id-ID')}</span>
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <SentimentIcon s={selected.sentiment} />
                    <span>Sentimen:</span>
                    <SentimentLabel s={selected.sentiment} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parseSymbols(selected.symbols).map((s) => (
                      <span key={s} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {SYMBOL_LABEL[s] ?? s}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Ringkasan
                  </h4>
                  <p className="text-sm leading-relaxed text-foreground/90">{selected.summary}</p>
                </div>
                {selected.url && (
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" /> Buka sumber
                    </Button>
                  </a>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function CategoryPill({
  active,
  onClick,
  icon,
  label,
  count,
  colorClass,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count: number
  colorClass?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.03]',
        active
          ? colorClass ?? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-sm shadow-emerald-500/20'
          : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
      )}
    >
      {icon}
      <span>{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 text-[10px] tabular',
          active ? 'bg-foreground/15' : 'bg-muted-foreground/15',
        )}
      >
        {count}
      </span>
    </button>
  )
}

function SentimentStat({
  icon,
  label,
  count,
  pct,
  colorClass,
  glow,
  borderClass,
}: {
  icon: React.ReactNode
  label: string
  count: number
  pct: number
  colorClass: string
  glow: string
  borderClass: string
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-md border p-2', borderClass)}>
      <span className={cn('pointer-events-none absolute -right-4 -top-4 h-12 w-12 rounded-full blur-2xl', glow)} />
      <div className={cn('flex items-center gap-1', colorClass)}>
        {icon} {label}
      </div>
      <div className={cn('mt-1 font-mono text-lg font-semibold tabular', colorClass)}>
        {count} <span className="text-[10px] text-muted-foreground">({pct.toFixed(0)}%)</span>
      </div>
    </div>
  )
}

function NewsRow({
  item,
  index,
  onClick,
}: {
  item: NewsItem
  index: number
  onClick: () => void
}) {
  const impactStyle = IMPACT_STYLE[item.impact]
  const Icon = CATEGORY_ICON[item.category]
  const isBreaking = item.category === 'breaking'
  const isHigh = item.impact === 'high'
  const symbols = parseSymbols(item.symbols)

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ delay: Math.min(index * 0.025, 0.3) }}
      onClick={onClick}
      aria-label={`Baca berita: ${item.title}`}
      className={cn(
        'group relative flex w-full items-start gap-3 px-4 py-3 text-left transition-all hover:bg-accent/40 hover:shadow-sm',
        isBreaking && 'bg-rose-500/[0.04] hover:bg-rose-500/[0.08]',
        isHigh && !isBreaking && 'bg-rose-500/[0.02] hover:bg-rose-500/[0.06]',
      )}
    >
      {/* Left accent bar — visible for high/breaking, fades in on hover otherwise */}
      <span
        className={cn(
          'absolute left-0 top-0 h-full w-0.5 transition-opacity',
          isBreaking || isHigh
            ? 'bg-rose-500 opacity-100'
            : 'bg-emerald-500 opacity-0 group-hover:opacity-100',
        )}
      />
      <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', impactStyle.dot)} />
      <div className="min-w-0 flex-1">
        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {isBreaking && (
            <Badge className="gap-0.5 border-rose-500/60 bg-rose-500/20 px-1.5 py-0 text-[10px] text-rose-200 live-dot">
              <Zap className="h-2.5 w-2.5" /> BREAKING
            </Badge>
          )}
          <Badge variant="outline" className={cn('gap-0.5 px-1.5 py-0 text-[10px]', CATEGORY_COLOR[item.category])}>
            <Icon className="h-2.5 w-2.5" />
            {NEWS_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category}
          </Badge>
          <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', SOURCE_COLOR[item.source] ?? '')}>
            {SOURCE_LABEL[item.source] ?? item.source}
          </Badge>
          <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', impactStyle.badge)}>
            {impactStyle.label}
          </Badge>
        </div>
        <p
          className="mt-1 text-sm font-semibold leading-snug transition-colors group-hover:text-emerald-300"
          style={lineClamp(2)}
        >
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground" style={lineClamp(3)}>
          {item.summary}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <SentimentIcon s={item.sentiment} /> <SentimentLabel s={item.sentiment} />
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="flex items-center gap-1 tabular">
            <Clock className="h-3 w-3" /> {relativeTime(item.publishedAt)}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <div className="flex flex-wrap gap-1">
            {symbols.slice(0, 4).map((s) => (
              <span
                key={s}
                className="rounded border border-border bg-muted/60 px-1 py-0 font-mono text-[10px]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.button>
  )
}
