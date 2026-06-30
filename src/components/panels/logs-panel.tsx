'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Terminal, Search, Trash2, Download, RefreshCw, Filter,
  Info, AlertTriangle, AlertOctagon, Bug, ChevronRight, ChevronDown,
  CircleDot, Radio, Plug, Brain, ShieldAlert, Cpu, Globe, FlaskConical,
} from 'lucide-react'

import { api } from '@/lib/api'
import { relativeTime } from '@/lib/format'
import type { Log } from '@/lib/types'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Level = Log['level']
type Source = Log['source']

const LEVELS: { value: Level | 'all'; label: string; icon: typeof Info }[] = [
  { value: 'all', label: 'All', icon: CircleDot },
  { value: 'info', label: 'Info', icon: Info },
  { value: 'warn', label: 'Warn', icon: AlertTriangle },
  { value: 'error', label: 'Error', icon: AlertOctagon },
  { value: 'debug', label: 'Debug', icon: Bug },
]

const SOURCES: { value: Source | 'all'; label: string; icon: typeof Radio }[] = [
  { value: 'all', label: 'All Sources', icon: Filter },
  { value: 'mt5', label: 'MT5', icon: Plug },
  { value: 'ai', label: 'AI', icon: Brain },
  { value: 'risk', label: 'Risk', icon: ShieldAlert },
  { value: 'api', label: 'API', icon: Cpu },
  { value: 'ws', label: 'WebSocket', icon: Radio },
  { value: 'backtest', label: 'Backtest', icon: FlaskConical },
  { value: 'system', label: 'System', icon: Globe },
]

const LEVEL_COLOR: Record<Level, string> = {
  info: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  warn: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
  error: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
  debug: 'text-muted-foreground bg-muted/40 border-border',
}

const LEVEL_BORDER: Record<Level, string> = {
  info: 'border-l-emerald-500/60',
  warn: 'border-l-amber-500/60',
  error: 'border-l-rose-500/60',
  debug: 'border-l-border',
}

const SOURCE_COLOR: Record<Source, string> = {
  mt5: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
  ai: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
  risk: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  api: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  ws: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
  backtest: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20',
  system: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
}

function formatExact(d: Date): string {
  return d.toLocaleString('id-ID', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

/* ---------- Stats card ---------- */
function StatCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string
  value: number
  sub?: string
  color: string
  icon: typeof Info
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className={cn('h-3.5 w-3.5', color)} />
        </div>
        <div className={cn('mt-1 font-mono text-2xl font-bold tabular', color)}>
          {value}
        </div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

/* ---------- Single log row ---------- */
function LogRow({ log }: { log: Log }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = !!(log.stack || log.context)
  const dt = new Date(log.createdAt)
  const LevelIcon = LEVELS.find((l) => l.value === log.level)?.icon ?? Info
  const SourceIcon = SOURCES.find((s) => s.value === log.source)?.icon ?? Cpu

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'rounded-md border border-l-2 bg-card/60 px-3 py-2 text-xs',
        LEVEL_BORDER[log.level],
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Level badge */}
        <span className={cn(
          'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
          LEVEL_COLOR[log.level],
        )}>
          <LevelIcon className="h-3 w-3" />
          {log.level}
        </span>

        {/* Source badge */}
        <span className={cn(
          'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium',
          SOURCE_COLOR[log.source],
        )}>
          <SourceIcon className="h-3 w-3" />
          {log.source}
        </span>

        {/* Message */}
        <span className="font-mono text-xs leading-tight text-foreground/90 flex-1 min-w-[200px] break-all">
          {log.message}
        </span>

        {/* Timestamp */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap cursor-help">
              {relativeTime(log.createdAt)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">
            <span className="font-mono text-[10px]">{formatExact(dt)}</span>
          </TooltipContent>
        </Tooltip>

        {/* Expand toggle */}
        {hasDetail && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Toggle detail"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Detail */}
      {hasDetail && expanded && (
        <div className="mt-2 space-y-1.5">
          {log.context && (
            <pre className="overflow-x-auto rounded bg-muted/60 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground scroll-thin">
              {log.context}
            </pre>
          )}
          {log.stack && (
            <pre className="overflow-x-auto rounded bg-rose-500/5 p-2 font-mono text-[10px] leading-relaxed text-rose-300/80 scroll-thin border border-rose-500/20">
              {log.stack}
            </pre>
          )}
        </div>
      )}
    </motion.div>
  )
}

/* ---------- Main panel ---------- */
export function LogsPanel() {
  const qc = useQueryClient()
  const [level, setLevel] = useState<Level | 'all'>('all')
  const [source, setSource] = useState<Source | 'all'>('all')
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['logs', level, source],
    queryFn: () => api.logs({ level: level === 'all' ? undefined : level, source: source === 'all' ? undefined : source, limit: 200 }),
    refetchInterval: autoRefresh ? 5_000 : false,
  })

  const clearMut = useMutation({
    mutationFn: () => api.clearLogs(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['logs'] })
      toast.success('Semua log dibersihkan')
      setConfirmClear(false)
    },
    onError: (e: Error) => toast.error('Gagal membersihkan log', { description: e.message }),
  })

  const logs = data?.logs ?? []

  // 24h stats
  const stats = useMemo(() => {
    const now = Date.now()
    const dayAgo = now - 24 * 3600 * 1000
    const last24 = logs.filter((l) => new Date(l.createdAt).getTime() >= dayAgo)
    return {
      total: logs.length,
      total24: last24.length,
      errors: last24.filter((l) => l.level === 'error').length,
      warnings: last24.filter((l) => l.level === 'warn').length,
      info: last24.filter((l) => l.level === 'info').length,
    }
  }, [logs])

  // Client-side text filter
  const filtered = useMemo(() => {
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter((l) =>
      l.message.toLowerCase().includes(q) ||
      l.source.toLowerCase().includes(q) ||
      l.level.toLowerCase().includes(q) ||
      (l.context ?? '').toLowerCase().includes(q) ||
      (l.stack ?? '').toLowerCase().includes(q),
    )
  }, [logs, search])

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finexfx-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Log diekspor', { description: `${filtered.length} entri · ${a.download}` })
  }

  // Level counts for chips
  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: logs.length, info: 0, warn: 0, error: 0, debug: 0 }
    for (const l of logs) counts[l.level] = (counts[l.level] ?? 0) + 1
    return counts
  }, [logs])

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Terminal className="h-5 w-5 text-emerald-400" />
            System Logs
          </h2>
          <p className="text-xs text-muted-foreground">
            MT5 • AI • Risk • API • WebSocket • Backtest
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
            {autoRefresh ? 'Live' : 'Paused'}
          </span>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <RefreshCw className={cn('h-3 w-3', autoRefresh && 'animate-spin')} />
            <span>Auto-refresh</span>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Logs" value={stats.total} sub={`${stats.total24} dalam 24 jam terakhir`} color="text-foreground" icon={Terminal} />
        <StatCard label="Errors (24h)" value={stats.errors} sub="butuh perhatian" color="text-rose-400" icon={AlertOctagon} />
        <StatCard label="Warnings (24h)" value={stats.warnings} sub="periksa kondisi" color="text-amber-400" icon={AlertTriangle} />
        <StatCard label="Info (24h)" value={stats.info} sub="normal operations" color="text-emerald-400" icon={Info} />
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Level chips */}
          <div className="flex flex-wrap items-center gap-2">
            {LEVELS.map((l) => {
              const Icon = l.icon
              const isActive = level === l.value
              const count = levelCounts[l.value] ?? 0
              return (
                <button
                  key={l.value}
                  onClick={() => setLevel(l.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
                    isActive
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {l.label}
                  <span className="font-mono text-[10px] opacity-70 tabular">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Search + source + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari pesan, source, level…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>

            <Select value={source} onValueChange={(v) => setSource(v as Source | 'all')}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => {
                  const Icon = s.icon
                  return (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        {s.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={exportJson} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(true)}
              disabled={logs.length === 0}
              className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4 text-emerald-400" />
            Log Feed
            <Badge variant="outline" className="ml-1">{filtered.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Newest first. Klik chevron untuk lihat stack/context. Border warna = level severity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Terminal className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Tidak ada log.</p>
              <p className="text-xs text-muted-foreground/70">
                {logs.length === 0 ? 'Sistem bersih — belum ada event.' : 'Filter tidak menghasilkan match.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[600px] space-y-1.5 overflow-y-auto scroll-thin pr-1">
              <AnimatePresence mode="popLayout">
                {filtered.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clear confirm */}
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bersihkan semua log?</AlertDialogTitle>
            <AlertDialogDescription>
              {logs.length} log entry akan dihapus permanen dari database. Aksi ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => clearMut.mutate()}
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default LogsPanel
