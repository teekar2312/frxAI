'use client'

// Economic Calendar Panel — Task ID: r6-STYLE-1 (visual polish pass)
// Tracks high-impact macro events: NFP, CPI, PPI, GDP, unemployment, retail, PMI,
// central bank rate decisions, speeches. Directly supports the 7 analysis dimensions.

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  CalendarClock, RefreshCw, AlertOctagon, Flag, Clock, TrendingUp,
  TrendingDown, Minus, Loader2, Filter, Zap, Globe2, ChevronRight,
  Info, Sparkles,
} from 'lucide-react'
import {
  BarChart, Bar, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
  CartesianGrid,
} from 'recharts'

import { api } from '@/lib/api'
import type { EconomicEvent } from '@/lib/types'
import { useClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const COUNTRY_INFO: Record<string, { flag: string; name: string; color: string }> = {
  US: { flag: '🇺🇸', name: 'United States', color: 'text-sky-400' },
  EU: { flag: '🇪🇺', name: 'Eurozone', color: 'text-blue-400' },
  GB: { flag: '🇬🇧', name: 'United Kingdom', color: 'text-indigo-400' },
  JP: { flag: '🇯🇵', name: 'Japan', color: 'text-rose-400' },
}

const CATEGORY_LABELS: Record<string, string> = {
  interest_rate: 'Bank Sentral',
  nfp: 'NFP',
  cpi: 'CPI',
  ppi: 'PPI',
  gdp: 'GDP',
  unemployment: 'Unemployment',
  retail: 'Retail Sales',
  pmi: 'PMI',
  speech: 'Speech',
  other: 'Lainnya',
}

const CATEGORY_COLORS: Record<string, string> = {
  interest_rate: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  nfp: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  cpi: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  ppi: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  gdp: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  unemployment: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  retail: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  pmi: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  speech: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
  other: 'bg-muted text-muted-foreground border-border',
}

function impactColor(impact: string) {
  return impact === 'high' ? 'bg-rose-500' : impact === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground'
}

function impactBadge(impact: string) {
  return impact === 'high'
    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
    : impact === 'medium'
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    : 'bg-muted text-muted-foreground border-border'
}

// Parse a value like "5.5%", "230K", "1.2T", "-0.3%" into a number for comparison.
function parseValue(v: string | null): number | null {
  if (!v) return null
  const cleaned = v.replace(/[^\d.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const num = parseFloat(cleaned)
  if (Number.isNaN(num)) return null
  // Apply scale suffixes
  if (/K/i.test(v)) return num * 1_000
  if (/M/i.test(v)) return num * 1_000_000
  if (/B/i.test(v)) return num * 1_000_000_000
  if (/T/i.test(v)) return num * 1_000_000_000_000
  return num
}

// Compare forecast vs previous → 'up' | 'down' | 'flat' | null
function forecastTrend(forecast: string | null, previous: string | null): 'up' | 'down' | 'flat' | null {
  const f = parseValue(forecast)
  const p = parseValue(previous)
  if (f == null || p == null) return null
  if (f > p) return 'up'
  if (f < p) return 'down'
  return 'flat'
}

// Countdown to event
function useCountdown(targetIso: string) {
  const now = useClock()
  const target = new Date(targetIso).getTime()
  const diff = target - now.getTime()
  if (diff <= 0) return { past: true, text: 'Lewat', days: 0, hours: 0, mins: 0, secs: 0, totalMs: 0 }
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  return {
    past: false,
    days,
    hours,
    mins,
    secs,
    totalMs: diff,
    text: days > 0 ? `${days}h ${hours}j` : hours > 0 ? `${hours}j ${mins}m` : `${mins}m ${secs}d`,
  }
}

/* ---------- Single Event Card (rich) ---------- */
function EventCard({ event, index }: { event: EconomicEvent; index: number }) {
  const cd = useCountdown(event.eventTime)
  const country = COUNTRY_INFO[event.country] || { flag: '🏳️', name: event.country, color: '' }
  const isUpcoming = event.status === 'upcoming'
  const isReleased = event.status === 'released'

  // Time buckets for styling
  const isVerySoon = isUpcoming && cd.totalMs > 0 && cd.totalMs <= 15 * 60 * 1000 // < 15 min
  const isSoon = isUpcoming && cd.totalMs > 15 * 60 * 1000 && cd.totalMs <= 60 * 60 * 1000 // < 1 hour

  // Parse surprise direction
  let surpriseDir: 'up' | 'down' | 'flat' = 'flat'
  if (event.surprise) {
    if (/beat|above|strong|hawkish|positive/i.test(event.surprise)) surpriseDir = 'up'
    else if (/below|miss|weak|dovish|negative/i.test(event.surprise)) surpriseDir = 'down'
  }

  // Forecast vs previous trend
  const fTrend = forecastTrend(event.forecast, event.previous)
  const affectedPairs = event.symbols ? event.symbols.split(',').map((s) => s.trim()).filter(Boolean) : []

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, transition: { duration: 0.15 } }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.4) }}
      whileHover={{ y: -2 }}
      className={cn(
        'group relative flex items-stretch gap-3 rounded-lg border bg-card/60 p-3 transition-all hover:bg-accent/30 hover:shadow-md',
        isVerySoon
          ? 'border-rose-500/60 bg-rose-500/[0.05] shadow-rose-500/10 shadow-lg'
          : isSoon
            ? 'border-amber-500/40 bg-amber-500/[0.04]'
            : event.impact === 'high' && isUpcoming
              ? 'border-rose-500/30 bg-rose-500/[0.03]'
              : 'border-border',
      )}
    >
      {/* Glow for very-soon events */}
      {isVerySoon && (
        <div className="pointer-events-none absolute -inset-0.5 -z-10 animate-pulse rounded-lg bg-rose-500/30 blur-md" />
      )}

      {/* Impact bar with pulse for high-impact upcoming */}
      <div className={cn(
        'relative w-1 shrink-0 rounded-full',
        impactColor(event.impact),
        event.impact === 'high' && isUpcoming && 'animate-pulse',
      )} />

      {/* Time + country with timeline dot */}
      <div className="relative flex w-20 shrink-0 flex-col items-center justify-center gap-0.5">
        <span className="text-lg leading-none">{country.flag}</span>
        <span className="text-[11px] font-mono font-semibold">{event.currency}</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {new Date(event.eventTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
        </span>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-sm font-semibold truncate">{event.title}</h4>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', CATEGORY_COLORS[event.category] || CATEGORY_COLORS.other)}>
                {CATEGORY_LABELS[event.category] || event.category}
              </span>
              <span className={cn(
                'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border font-medium',
                impactBadge(event.impact),
              )}>
                {event.impact === 'high' && isUpcoming && (
                  <span className="h-1 w-1 rounded-full bg-rose-400 live-dot" />
                )}
                {event.impact.toUpperCase()}
              </span>
              {/* Affected trading pairs badges */}
              {affectedPairs.length > 0 && affectedPairs.slice(0, 4).map((s) => (
                <span
                  key={s}
                  className="rounded border border-emerald-500/20 bg-emerald-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-300/90"
                  title={`Dampak ke ${s}`}
                >
                  {s}
                </span>
              ))}
              {affectedPairs.length > 4 && (
                <span className="text-[10px] text-muted-foreground">+{affectedPairs.length - 4}</span>
              )}
            </div>
          </div>
          {/* Countdown / status */}
          <div className="shrink-0 text-right">
            {isReleased ? (
              <Badge variant="outline" className="text-[10px] gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Released
              </Badge>
            ) : isUpcoming ? (
              <div className={cn(
                'flex flex-col items-end gap-0.5 rounded-md px-2 py-1',
                isVerySoon
                  ? 'bg-rose-500/15 text-rose-300'
                  : isSoon
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-muted-foreground',
              )}>
                <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider">
                  {(isVerySoon || isSoon) && <Clock className="h-2.5 w-2.5 animate-pulse" />}
                  {isVerySoon ? 'Segera!' : 'Countdown'}
                </span>
                <span className={cn(
                  'font-mono text-sm font-bold tabular',
                  isVerySoon && 'animate-pulse',
                )}>
                  {cd.text}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Values: Actual / Forecast / Previous */}
        {(event.actual || event.forecast || event.previous) && (
          <div className="flex items-center gap-4 text-xs mt-1">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase">Actual</span>
              <span className={cn('font-mono font-bold tabular', event.actual ? (surpriseDir === 'up' ? 'text-bull' : surpriseDir === 'down' ? 'text-bear' : '') : 'text-muted-foreground')}>
                {event.actual || '—'}
              </span>
            </div>
            <Separator orientation="vertical" className="h-7" />
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
                Forecast
                {fTrend === 'up' && <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />}
                {fTrend === 'down' && <TrendingDown className="h-2.5 w-2.5 text-rose-400" />}
                {fTrend === 'flat' && <Minus className="h-2.5 w-2.5 text-muted-foreground" />}
              </span>
              <span className="font-mono tabular text-muted-foreground">{event.forecast || '—'}</span>
            </div>
            <Separator orientation="vertical" className="h-7" />
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase">Previous</span>
              <span className="font-mono tabular text-muted-foreground">{event.previous || '—'}</span>
            </div>
            {event.surprise && (
              <>
                <Separator orientation="vertical" className="h-7" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground uppercase">Surprise</span>
                  <span className={cn('text-xs font-medium', surpriseDir === 'up' ? 'text-bull' : surpriseDir === 'down' ? 'text-bear' : 'text-muted-foreground')}>
                    {surpriseDir === 'up' ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : surpriseDir === 'down' ? <TrendingDown className="inline h-3 w-3 mr-0.5" /> : <Minus className="inline h-3 w-3 mr-0.5" />}
                    {event.surprise}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ---------- Timeline wrapper for a list of events ---------- */
function EventTimeline({ events }: { events: EconomicEvent[] }) {
  if (events.length === 0) return null
  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="pointer-events-none absolute left-[51px] top-3 bottom-3 w-px bg-gradient-to-b from-emerald-500/40 via-border to-border" />
      <AnimatePresence mode="popLayout">
        {events.map((e, i) => (
          <div key={e.id} className="relative">
            {/* Timeline dot */}
            <div className={cn(
              'pointer-events-none absolute left-[47px] top-4 z-10 h-2.5 w-2.5 rounded-full border-2 border-card',
              e.impact === 'high' ? 'bg-rose-500' : e.impact === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground',
            )} />
            <EventCard event={e} index={i} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function NextEventCard({ events }: { events: EconomicEvent[] }) {
  const now = useClock()
  const upcoming = events.filter((e) => new Date(e.eventTime).getTime() > now.getTime() && e.status === 'upcoming')
  const next = upcoming[0]
  // Always call the hook (even if next is undefined) to respect rules-of-hooks
  const cd = useCountdown(next?.eventTime ?? new Date(Date.now() + 86400000).toISOString())
  const country = COUNTRY_INFO[next?.country] || { flag: '🏳️', name: '', color: '' }

  if (!next || upcoming.length === 0) return null

  return (
    <Card className="relative overflow-hidden border-rose-500/30 bg-gradient-to-br from-rose-500/[0.06] via-card to-card">
      <div className="absolute inset-0 grid-bg opacity-30" />
      {/* Corner blur glow */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-rose-500/20 blur-2xl" />
      <CardContent className="relative p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
            <Zap className="h-4 w-4" />
            <div className="absolute inset-0 animate-ping rounded-lg bg-rose-500/15" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Event High-Impact Berikutnya</p>
            <p className="text-[10px] text-muted-foreground/70">Hindari scalping 5 menit sebelum & sesudah event</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{country.flag}</span>
              <h3 className="text-lg font-bold truncate">{next.title}</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', CATEGORY_COLORS[next.category])}>
                {CATEGORY_LABELS[next.category]}
              </span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', impactBadge(next.impact))}>
                {next.impact.toUpperCase()}
              </span>
              {next.forecast && (
                <span className="text-[11px] text-muted-foreground font-mono">Forecast: {next.forecast}</span>
              )}
              {next.previous && (
                <span className="text-[11px] text-muted-foreground font-mono">Prev: {next.previous}</span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Dimulai dalam</p>
            <div className="flex items-baseline gap-1 font-mono font-bold tabular">
              {cd.days > 0 && <span className="text-2xl text-rose-400">{cd.days}<span className="text-xs text-muted-foreground ml-0.5">h</span></span>}
              <span className="text-2xl text-rose-400">{String(cd.hours).padStart(2, '0')}<span className="text-xs text-muted-foreground ml-0.5">j</span></span>
              <span className="text-2xl text-rose-400">{String(cd.mins).padStart(2, '0')}<span className="text-xs text-muted-foreground ml-0.5">m</span></span>
              <span className="text-lg text-muted-foreground">{String(cd.secs).padStart(2, '0')}<span className="text-xs ml-0.5">d</span></span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {new Date(next.eventTime).toLocaleString('id-ID', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })} WIB
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function WeeklyImpactChart({ events }: { events: EconomicEvent[] }) {
  const now = new Date()
  const data = useMemo(() => {
    const days: { day: string; label: string; high: number; medium: number; low: number }[] = []
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() + i)
      const dayStr = d.toISOString().slice(0, 10)
      const dayEvents = events.filter((e) => e.eventTime.slice(0, 10) === dayStr)
      days.push({
        day: dayStr,
        label: dayNames[d.getUTCDay()],
        high: dayEvents.filter((e) => e.impact === 'high').length,
        medium: dayEvents.filter((e) => e.impact === 'medium').length,
        low: dayEvents.filter((e) => e.impact === 'low').length,
      })
    }
    return days
  }, [events])

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-emerald-500/[0.06] to-transparent" />
      <CardHeader className="relative pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-emerald-500" />
          Distribusi Event 7 Hari
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <RTooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
            />
            <Bar dataKey="high" stackId="a" fill="var(--bear)" radius={[0, 0, 0, 0]} name="High" />
            <Bar dataKey="medium" stackId="a" fill="var(--warn)" name="Medium" />
            <Bar dataKey="low" stackId="a" fill="var(--muted-foreground)" radius={[3, 3, 0, 0]} name="Low" />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500" /> High</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500" /> Medium</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted-foreground" /> Low</span>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Filter pill button ---------- */
function FilterPill({
  active,
  onClick,
  children,
  tone = 'muted',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: 'muted' | 'rose' | 'amber' | 'emerald'
}) {
  const tones: Record<string, { on: string; off: string }> = {
    muted: {
      on: 'border-foreground/30 bg-foreground/10 text-foreground',
      off: 'border-border bg-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground',
    },
    rose: {
      on: 'border-rose-500/50 bg-rose-500/15 text-rose-300',
      off: 'border-border bg-transparent text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300',
    },
    amber: {
      on: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
      off: 'border-border bg-transparent text-muted-foreground hover:bg-amber-500/10 hover:text-amber-300',
    },
    emerald: {
      on: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300',
      off: 'border-border bg-transparent text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-300',
    },
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
        active ? tones[tone].on : tones[tone].off,
      )}
    >
      {children}
    </button>
  )
}

/* ---------- Filter bar (pill-style, sticky) ---------- */
function FilterBar({
  impact, country, status,
  onImpact, onCountry, onStatus,
}: {
  impact: string
  country: string
  status: string
  onImpact: (v: string) => void
  onCountry: (v: string) => void
  onStatus: (v: string) => void
}) {
  const anyFilterActive = impact !== 'all' || country !== 'all' || status !== 'all'
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-r from-emerald-500/[0.06] via-emerald-500/[0.02] to-transparent" />
      <CardHeader className="relative pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filter Event
          {anyFilterActive && (
            <button
              type="button"
              onClick={() => { onImpact('all'); onCountry('all'); onStatus('all') }}
              className="ml-auto text-[10px] font-medium text-rose-400 hover:text-rose-300 hover:underline"
            >
              Reset filter
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-2.5">
        {/* Impact pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">Impact</span>
          <FilterPill active={impact === 'all'} onClick={() => onImpact('all')}>Semua</FilterPill>
          <FilterPill active={impact === 'high'} onClick={() => onImpact('high')} tone="rose">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 live-dot" /> High
            </span>
          </FilterPill>
          <FilterPill active={impact === 'medium'} onClick={() => onImpact('medium')} tone="amber">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Medium
            </span>
          </FilterPill>
          <FilterPill active={impact === 'low'} onClick={() => onImpact('low')}>Low</FilterPill>
        </div>
        {/* Country pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">Negara</span>
          <FilterPill active={country === 'all'} onClick={() => onCountry('all')}>Semua</FilterPill>
          <FilterPill active={country === 'US'} onClick={() => onCountry('US')} tone="emerald">🇺🇸 US</FilterPill>
          <FilterPill active={country === 'EU'} onClick={() => onCountry('EU')} tone="emerald">🇪🇺 EU</FilterPill>
          <FilterPill active={country === 'GB'} onClick={() => onCountry('GB')} tone="emerald">🇬🇧 GB</FilterPill>
          <FilterPill active={country === 'JP'} onClick={() => onCountry('JP')} tone="emerald">🇯🇵 JP</FilterPill>
        </div>
        {/* Status pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-muted-foreground">Status</span>
          <FilterPill active={status === 'all'} onClick={() => onStatus('all')}>Semua</FilterPill>
          <FilterPill active={status === 'upcoming'} onClick={() => onStatus('upcoming')} tone="emerald">
            <span className="flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> Mendatang
            </span>
          </FilterPill>
          <FilterPill active={status === 'released'} onClick={() => onStatus('released')}>
            <span className="flex items-center gap-1">
              <ChevronRight className="h-2.5 w-2.5" /> Released
            </span>
          </FilterPill>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Stats card with corner glow ---------- */
function StatCard({
  label, value, icon, tone, hint,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  tone: 'emerald' | 'rose' | 'amber' | 'cyan'
  hint?: string
}) {
  const tones: Record<string, { bg: string; text: string; blur: string }> = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', blur: 'bg-emerald-500/15' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', blur: 'bg-rose-500/15' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', blur: 'bg-amber-500/15' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', blur: 'bg-cyan-500/15' },
  }
  return (
    <Card className="relative overflow-hidden">
      <div className={cn('pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl', tones[tone].blur)} />
      <CardContent className="relative p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={cn('text-2xl font-bold tabular', tones[tone].text)}>{value}</p>
            {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tones[tone].bg, tones[tone].text)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Loading skeleton ---------- */
function EventSkeletonCard() {
  return (
    <div className="flex items-stretch gap-3 rounded-lg border border-border bg-card/60 p-3">
      <Skeleton className="w-1 shrink-0 rounded-full" />
      <div className="flex w-20 shrink-0 flex-col items-center gap-1">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-2.5 w-12" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex gap-1.5">
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-14 rounded" />
        </div>
        <div className="flex gap-4 pt-1">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-6 w-12" />
        </div>
      </div>
    </div>
  )
}

function CalendarLoadingState() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-3 w-72" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <EventSkeletonCard key={i} />)}
        </div>
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <EventSkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  )
}

/* ---------- Empty state ---------- */
function EmptyEventState({ kind }: { kind: 'upcoming' | 'released' }) {
  const cfg = kind === 'upcoming'
    ? { icon: CalendarClock, title: 'Tidak ada event mendatang', hint: 'Coba ubah filter di atas atau refresh kalender untuk menarik event terbaru.', tone: 'emerald' as const }
    : { icon: Flag, title: 'Belum ada event yang released', hint: 'Event yang sudah lewat waktu akan muncul di sini setelah datanya dirilis.', tone: 'muted' as const }
  const Icon = cfg.icon
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="relative">
        <div className={cn(
          'pointer-events-none absolute inset-0 -z-10 rounded-full blur-2xl',
          cfg.tone === 'emerald' ? 'bg-emerald-500/10' : 'bg-muted-foreground/10',
        )} />
        <div className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full border border-dashed',
          cfg.tone === 'emerald'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-border bg-muted/30',
        )}>
          <Icon className={cn('h-7 w-7', cfg.tone === 'emerald' ? 'text-emerald-400/60' : 'text-muted-foreground/60')} />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{cfg.title}</p>
        <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto">{cfg.hint}</p>
      </div>
    </div>
  )
}

export function CalendarPanel() {
  const qc = useQueryClient()
  const [filterImpact, setFilterImpact] = useState<string>('all')
  const [filterCountry, setFilterCountry] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['economic-calendar', '14'],
    queryFn: () => api.economicCalendar({ days: 14, limit: 100 }),
    refetchInterval: 30000,
  })

  const refreshMut = useMutation({
    mutationFn: () => api.refreshEconomicCalendar(),
    onSuccess: (res) => {
      toast.success(`${res.added} event baru ditambahkan ke kalender`)
      qc.invalidateQueries({ queryKey: ['economic-calendar'] })
    },
    onError: () => toast.error('Gagal refresh kalender ekonomi'),
  })

  const events = data?.events || []

  // Filter client-side
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filterImpact !== 'all' && e.impact !== filterImpact) return false
      if (filterCountry !== 'all' && e.country !== filterCountry) return false
      if (filterStatus !== 'all' && e.status !== filterStatus) return false
      return true
    })
  }, [events, filterImpact, filterCountry, filterStatus])

  // Split into upcoming + released
  const now = Date.now()
  const upcoming = filtered.filter((e) => new Date(e.eventTime).getTime() >= now)
  const released = filtered.filter((e) => new Date(e.eventTime).getTime() < now).reverse()

  // Stats
  const highImpactCount = upcoming.filter((e) => e.impact === 'high').length
  const todayCount = upcoming.filter((e) => {
    const d = new Date(e.eventTime)
    const today = new Date()
    return d.getUTCDate() === today.getUTCDate() && d.getUTCMonth() === today.getUTCMonth()
  }).length

  if (isLoading) {
    return <CalendarLoadingState />
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                <CalendarClock className="h-5 w-5" />
              </span>
              Economic Calendar
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Event makro high-impact: NFP, CPI, PPI, GDP, Unemployment, Retail, PMI, Bank Sentral — 7 dimensi analisa AI
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className="gap-2"
          >
            {refreshMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh Events
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Event (14h)"
            value={events.length}
            icon={<CalendarClock className="h-5 w-5" />}
            tone="emerald"
          />
          <StatCard
            label="High-Impact Mendatang"
            value={highImpactCount}
            icon={<AlertOctagon className="h-5 w-5" />}
            tone="rose"
          />
          <StatCard
            label="Event Hari Ini"
            value={todayCount}
            icon={<Clock className="h-5 w-5" />}
            tone="amber"
          />
          <StatCard
            label="Negara Dipantau"
            value="4"
            icon={<Globe2 className="h-5 w-5" />}
            tone="cyan"
            hint="US · EU · GB · JP"
          />
        </div>

        {/* Next high-impact event */}
        {upcoming.length > 0 && <NextEventCard events={upcoming} />}

        {/* Filters + weekly chart */}
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <FilterBar
            impact={filterImpact}
            country={filterCountry}
            status={filterStatus}
            onImpact={setFilterImpact}
            onCountry={setFilterCountry}
            onStatus={setFilterStatus}
          />
          <WeeklyImpactChart events={events} />
        </div>

        {/* Event list */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Upcoming */}
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-emerald-500/[0.06] to-transparent" />
            <CardHeader className="relative pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-500" />
                  Event Mendatang
                  <Badge variant="secondary" className="text-[10px]">{upcoming.length}</Badge>
                </CardTitle>
              </div>
              <CardDescription className="text-xs flex items-center gap-1">
                <Info className="h-2.5 w-2.5" />
                Timeline vertikal · dot warna = impact level
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[640px] pr-3 scroll-thin">
                <div className="space-y-2 pr-1">
                  {upcoming.length === 0 ? (
                    <EmptyEventState kind="upcoming" />
                  ) : (
                    <EventTimeline events={upcoming} />
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Released */}
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-muted-foreground/[0.06] to-transparent" />
            <CardHeader className="relative pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  Event Terlewat (Released)
                  <Badge variant="secondary" className="text-[10px]">{released.length}</Badge>
                </CardTitle>
              </div>
              <CardDescription className="text-xs flex items-center gap-1">
                <Info className="h-2.5 w-2.5" />
                Aktual + surprise vs forecast
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[640px] pr-3 scroll-thin">
                <div className="space-y-2 pr-1">
                  {released.length === 0 ? (
                    <EmptyEventState kind="released" />
                  ) : (
                    <EventTimeline events={released} />
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Warning footer */}
        <Card className="relative overflow-hidden border-amber-500/30 bg-amber-500/[0.04]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-amber-500/[0.08] to-transparent" />
          <CardContent className="relative p-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
              <AlertOctagon className="h-5 w-5" />
            </div>
            <div className="text-sm">
              <p className="font-semibold text-amber-400 mb-1 flex items-center gap-1.5">
                Peringatan Scalping Saat News
                <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-300">
                  <Sparkles className="h-2.5 w-2.5" /> Rule Anti-MC
                </span>
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Hindari membuka posisi scalping 5 menit sebelum dan sesudah event high-impact (terutama NFP, CPI, FOMC, ECB).
                Spread dapat melebar signifikan dan slippage tinggi dapat mengakibatkan stop loss tersentuh di luar rencana.
                Rule Anti-MC: Daily risk limit 2-3% sudah memperhitungkan exposure news.
              </p>
            </div>
          </CardContent>
        </Card>
    </div>
  )
}
