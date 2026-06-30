'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Cpu, TrendingUp, Waves, BarChart3, Activity, LayoutGrid, ChartLine,
  ChevronDown, Info, Zap, Brain, Sparkles, Power,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Indicator } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

type Category = Indicator['category']

const CATEGORY_META: Record<
  Category,
  { label: string; badge: string; text: string; icon: typeof Cpu; glow: string }
> = {
  trend:      { label: 'Trend',      badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', text: 'text-emerald-400', icon: TrendingUp, glow: 'bg-emerald-500/15' },
  oscillator: { label: 'Oscillator', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300',       text: 'text-amber-400',   icon: Activity,   glow: 'bg-amber-500/15' },
  volume:     { label: 'Volume',     badge: 'border-cyan-600/40 bg-cyan-600/10 text-cyan-300',           text: 'text-cyan-400',    icon: BarChart3,  glow: 'bg-cyan-500/15' },
  volatility: { label: 'Volatility', badge: 'border-rose-500/40 bg-rose-500/10 text-rose-300',           text: 'text-rose-400',    icon: Waves,      glow: 'bg-rose-500/15' },
  channel:    { label: 'Channel',    badge: 'border-violet-500/40 bg-violet-500/10 text-violet-300',    text: 'text-violet-400',  icon: LayoutGrid, glow: 'bg-violet-500/15' },
  regression: { label: 'Regression', badge: 'border-orange-500/40 bg-orange-500/10 text-orange-300',    text: 'text-orange-400',  icon: ChartLine,  glow: 'bg-orange-500/15' },
}

const CATEGORY_ORDER: Category[] = ['trend', 'oscillator', 'volume', 'volatility', 'channel', 'regression']

const lineClamp = (n: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: n,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
})

function prettyJson(s: string | null): string {
  if (!s) return '—'
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

function paramsDiffer(def: string, preset: string | null): boolean {
  if (!preset) return false
  try {
    return JSON.stringify(JSON.parse(def)) !== JSON.stringify(JSON.parse(preset))
  } catch {
    return def !== preset
  }
}

export function IndicatorsPanel() {
  const qc = useQueryClient()

  const indQ = useQuery({
    queryKey: ['indicators'],
    queryFn: () => api.indicators(),
  })

  const aiSelectMut = useMutation({
    mutationFn: () => api.aiSelectIndicators(),
    onSuccess: (data) => {
      const n = data.indicators.filter((i) => i.enabled).length
      toast.success(`AI memilih ulang ${n} indikator`)
      qc.invalidateQueries({ queryKey: ['indicators'] })
    },
    onError: () => toast.error('AI auto-select gagal'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Indicator> }) =>
      api.updateIndicator(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['indicators'] })
      const prev = qc.getQueryData<{ indicators: Indicator[] }>(['indicators'])
      if (prev) {
        qc.setQueryData<{ indicators: Indicator[] }>(['indicators'], {
          indicators: prev.indicators.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['indicators'], ctx.prev)
      toast.error('Gagal memperbarui indikator')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['indicators'] }),
  })

  const all = indQ.data?.indicators ?? []

  const byCategory = useMemo(() => {
    const m: Record<Category, Indicator[]> = {
      trend: [], oscillator: [], volume: [], volatility: [], channel: [], regression: [],
    }
    for (const i of all) m[i.category].push(i)
    return m
  }, [all])

  const stats = useMemo(
    () => ({
      total: all.length,
      enabled: all.filter((i) => i.enabled).length,
      autoManaged: all.filter((i) => i.autoManaged).length,
    }),
    [all],
  )

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
            <Cpu className="h-5 w-5 text-violet-400" />
            <span className="pointer-events-none absolute -right-2 -top-2 h-3 w-3 rounded-full bg-violet-400/40 blur-md" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">
              Indikator Pool — 30 indikator teknikal (preset scalping M5)
            </h2>
            <p className="text-xs text-muted-foreground">
              {stats.enabled}/{stats.total} aktif · {stats.autoManaged} AI-managed · preset dioptimalkan untuk M5
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatChip label="Total" value={stats.total} color="text-foreground" glow="bg-foreground/10" />
          <StatChip label="Enabled" value={stats.enabled} color="text-emerald-300" glow="bg-emerald-500/15" />
          <StatChip label="AI Managed" value={stats.autoManaged} color="text-violet-300" glow="bg-violet-500/15" />
          <Button
            size="sm"
            onClick={() => aiSelectMut.mutate()}
            disabled={aiSelectMut.isPending}
            variant="outline"
            className="gap-1.5 border-violet-500/40 bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 text-violet-200 shadow-sm shadow-violet-500/20 hover:from-violet-500/40 hover:to-fuchsia-500/40 hover:text-violet-100"
          >
            {aiSelectMut.isPending ? (
              <Sparkles className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {aiSelectMut.isPending ? 'AI memilih…' : 'AI Auto-Select'}
          </Button>
        </div>
      </div>

      {/* Active scalping set summary */}
      <ActiveSetCard indicators={all} />

      {/* Indicator groups by category — collapsible sections */}
      {indQ.isLoading ? (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        <Card className="relative overflow-hidden">
          <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-500/15 blur-2xl" />
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="relative">
              <Cpu className="h-12 w-12 text-muted-foreground/40" />
              <span className="pointer-events-none absolute inset-0 -z-10 m-auto h-12 w-12 rounded-full bg-muted-foreground/10 blur-xl" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Belum ada indikator tersedia</p>
              <p className="text-xs text-muted-foreground/70">
                Jalankan AI Auto-Select atau tambahkan indikator baru melalui seed database.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const items = byCategory[cat]
            if (!items.length) return null
            return (
              <CategorySection
                key={cat}
                category={cat}
                indicators={items}
                onToggle={(id, field, value) =>
                  updateMut.mutate({ id, patch: { [field]: value } })
                }
                onWeightChange={(id, w) => updateMut.mutate({ id, patch: { weight: w } })}
              />
            )
          })}
        </div>
      )}

      {/* Legend / info card */}
      <Card className="relative overflow-hidden border-emerald-500/20 bg-emerald-500/[0.04]">
        <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl" />
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="h-5 w-5 shrink-0 text-emerald-400" />
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-emerald-300">Indikator dengan Auto-Managed ON</span> dapat
              di-toggle/di-weight ulang oleh AI berdasarkan kondisi pasar.
            </p>
            <p>
              <span className="font-medium text-amber-300">Preset scalping</span> dioptimalkan untuk M5.
              Saat berbeda dari default, badge &ldquo;Preset scalping aktif&rdquo; muncul pada card indikator.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatChip({
  label,
  value,
  color,
  glow,
}: {
  label: string
  value: number
  color: string
  glow: string
}) {
  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-muted/30 px-3 py-1">
      <span className={cn('pointer-events-none absolute -right-3 -top-3 h-10 w-10 rounded-full blur-2xl', glow)} />
      <div className="relative flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={cn('font-mono text-base font-semibold tabular', color)}>{value}</span>
      </div>
    </div>
  )
}

function CategorySection({
  category,
  indicators,
  onToggle,
  onWeightChange,
}: {
  category: Category
  indicators: Indicator[]
  onToggle: (id: string, field: 'enabled' | 'autoManaged', value: boolean) => void
  onWeightChange: (id: string, w: number) => void
}) {
  const meta = CATEGORY_META[category]
  const Icon = meta.icon
  const [open, setOpen] = useState(true)
  const enabledCount = indicators.filter((i) => i.enabled).length
  const aiCount = indicators.filter((i) => i.autoManaged).length

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="relative overflow-hidden">
        <span
          className={cn(
            'pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl',
            meta.glow,
          )}
        />
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between bg-gradient-to-r from-violet-500/[0.05] to-transparent px-4 py-3 text-left transition-colors hover:from-violet-500/[0.1]"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md border',
                  meta.badge,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-semibold">{meta.label}</span>
              <Badge variant="secondary" className="text-[10px] tabular">{indicators.length}</Badge>
              <span className="text-[11px] text-muted-foreground">
                · {enabledCount} aktif{aiCount > 0 ? ` · ${aiCount} AI` : ''}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="grid gap-4 p-4 pt-3 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {indicators.map((ind, i) => (
                <IndicatorCard
                  key={ind.id}
                  indicator={ind}
                  index={i}
                  onToggle={(field, value) => onToggle(ind.id, field, value)}
                  onWeightChange={(w) => onWeightChange(ind.id, w)}
                />
              ))}
            </AnimatePresence>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function ActiveSetCard({ indicators }: { indicators: Indicator[] }) {
  const enabled = useMemo(
    () => indicators.filter((i) => i.enabled).sort((a, b) => b.weight - a.weight),
    [indicators],
  )
  const byCat = useMemo(() => {
    const m: Record<string, Indicator[]> = {}
    for (const i of enabled) (m[i.category] ??= []).push(i)
    return m
  }, [enabled])
  const maxWeight = Math.max(...enabled.map((i) => i.weight), 1)

  return (
    <Card className="relative overflow-hidden">
      <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-500/15 blur-2xl" />
      <CardHeader className="bg-gradient-to-r from-violet-500/[0.05] to-transparent pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Set Scalping Aktif — {enabled.length} indikator
          </span>
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
            M5 preset
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {enabled.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="relative">
              <Sparkles className="h-6 w-6 text-muted-foreground/40" />
              <span className="pointer-events-none absolute inset-0 -z-10 m-auto h-6 w-6 rounded-full bg-muted-foreground/10 blur-lg" />
            </div>
            <p className="text-xs text-muted-foreground">
              Belum ada indikator aktif. Jalankan AI Auto-Select atau aktifkan manual di bawah.
            </p>
          </div>
        ) : (
          (Object.keys(byCat) as Category[]).map((cat) => {
            const meta = CATEGORY_META[cat]
            const Icon = meta.icon
            return (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Icon className={cn('h-3 w-3', meta.text)} /> {meta.label}
                  <span className="tabular">({byCat[cat].length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {byCat[cat].map((ind) => (
                    <Tooltip key={ind.id} delayDuration={200}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 transition-colors hover:bg-muted/60',
                            meta.badge,
                          )}
                        >
                          <span className="text-[11px] font-medium">{ind.name}</span>
                          <div className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-current opacity-70"
                              style={{ width: `${(ind.weight / maxWeight) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] tabular opacity-70">
                            {ind.weight.toFixed(2)}
                          </span>
                          {ind.autoManaged && <Brain className="h-2.5 w-2.5 opacity-70" />}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <span className="font-medium">{ind.name}</span>
                        {' · weight '}
                        <span className="tabular">{ind.weight.toFixed(2)}</span>
                        {ind.autoManaged ? ' · AI-managed' : ''}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function IndicatorCard({
  indicator: ind,
  index,
  onToggle,
  onWeightChange,
}: {
  indicator: Indicator
  index: number
  onToggle: (field: 'enabled' | 'autoManaged', value: boolean) => void
  onWeightChange: (w: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [weight, setWeight] = useState(ind.weight)
  const [prevServerWeight, setPrevServerWeight] = useState(ind.weight)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const meta = CATEGORY_META[ind.category]
  const Icon = meta.icon
  const differs = paramsDiffer(ind.defaultParams, ind.scalpingPreset)
  const weightPct = Math.round(weight * 100)

  // Sync local slider state when the server value changes (e.g. AI auto-select).
  // Derived-state-during-render pattern recommended by React docs instead of setState-in-effect.
  if (ind.weight !== prevServerWeight) {
    setPrevServerWeight(ind.weight)
    setWeight(ind.weight)
  }

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleWeight = (v: number[]) => {
    const w = v[0] / 100
    setWeight(w)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onWeightChange(w), 400)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: Math.min(index * 0.02, 0.2) }}
      layout
      className={cn('h-full transition-opacity', !ind.enabled && 'opacity-60')}
    >
      <Card
        className={cn(
          'relative h-full overflow-hidden transition-all hover:shadow-lg',
          ind.enabled
            ? ind.autoManaged
              ? 'border-violet-500/40 bg-violet-500/[0.04] hover:border-violet-500/60 hover:shadow-violet-500/10'
              : 'border-emerald-500/40 bg-emerald-500/[0.03] hover:border-emerald-500/60 hover:shadow-emerald-500/10'
            : 'border-border hover:border-border/80',
        )}
      >
        {ind.autoManaged && (
          <span className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-violet-500/15 blur-2xl" />
        )}
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                  meta.badge,
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5 text-sm">
                  {ind.name}
                  {ind.autoManaged && (
                    <Badge
                      variant="outline"
                      className="gap-0.5 border-violet-500/50 bg-violet-500/15 px-1 py-0 text-[9px] text-violet-200"
                    >
                      <Brain className="h-2.5 w-2.5" /> AI
                    </Badge>
                  )}
                </CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground" style={lineClamp(2)}>
                  {ind.description}
                </p>
              </div>
            </div>
            <Badge variant="outline" className={cn('shrink-0 px-1.5 py-0 text-[10px]', meta.badge)}>
              {meta.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Toggles */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={ind.enabled}
                onCheckedChange={(v) => onToggle('enabled', v)}
                aria-label={`Toggle enabled for ${ind.name}`}
              />
              <span className="text-xs font-medium">
                {ind.enabled ? (
                  <span className="flex items-center gap-1 text-emerald-300">
                    <Power className="h-3 w-3" /> Enabled
                  </span>
                ) : (
                  <span className="text-muted-foreground">Disabled</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Auto-Managed</span>
              <Switch
                checked={ind.autoManaged}
                onCheckedChange={(v) => onToggle('autoManaged', v)}
                aria-label={`Toggle auto-managed for ${ind.name}`}
              />
            </div>
          </div>

          {/* Weight slider with gradient track + percentage badge */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Weight</span>
              <Badge
                variant="outline"
                className={cn(
                  'px-1.5 py-0 font-mono text-[10px] tabular',
                  weightPct >= 67
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    : weightPct >= 34
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                )}
              >
                {weightPct}%
              </Badge>
            </div>
            <div className="relative py-1">
              {/* Gradient spectrum track (emerald → amber → rose) */}
              <div className="pointer-events-none absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 opacity-60" />
              <Slider
                value={[weightPct]}
                onValueChange={handleWeight}
                min={0}
                max={100}
                step={1}
                className="relative z-10 [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-range]]:bg-transparent"
              />
            </div>
          </div>

          {/* Expandable params */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <span className="flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> Parameters
              {differs && (
                <Badge
                  variant="outline"
                  className="ml-1 gap-0.5 border-amber-500/40 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-300"
                >
                  <Zap className="h-2.5 w-2.5" /> Preset scalping aktif
                </Badge>
              )}
            </span>
            <ChevronDown
              className={cn(
                'h-3 w-3 transition-transform duration-200',
                expanded && 'rotate-180',
              )}
            />
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-2 gap-2 overflow-hidden"
              >
                <div className="rounded-md border border-border bg-background/40 p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Default</p>
                  <pre className="overflow-x-auto scroll-thin font-mono text-[10px] leading-tight text-foreground/80">
                    {prettyJson(ind.defaultParams)}
                  </pre>
                </div>
                <div
                  className={cn(
                    'rounded-md border p-2',
                    differs ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-border bg-background/40',
                  )}
                >
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-amber-300">Scalping Preset</p>
                  <pre className="overflow-x-auto scroll-thin font-mono text-[10px] leading-tight text-foreground/80">
                    {prettyJson(ind.scalpingPreset)}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}
