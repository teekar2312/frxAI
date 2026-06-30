'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AlertOctagon,
  BadgeCheck,
  Calculator,
  CheckCircle2,
  Loader2,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import type { RiskUsage } from '@/lib/types'
import { SUPPORTED_SYMBOLS, SYMBOL_BASE, SYMBOL_LABEL } from '@/lib/types'
import { fmtMoney, fmtPct } from '@/lib/format'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

/* ---------------- types & defaults ---------------- */

interface RiskForm {
  riskPerTradePct: number
  stopLossPipsMin: number
  stopLossPipsMax: number
  riskRewardRatio: number
  maxOpenPositions: number
  dailyRiskLimitPct: number
  dailyTargetPct: number
  // r10-risk: server-side enforcement settings
  riskEnforcementEnabled: boolean
  maxLotSizePerTrade: number
  maxTotalLotSize: number
  maxRiskPerTradePct: number
  marginCallLevel: number
  avoidHighImpactNews: boolean
  autoSelectPair: boolean
  autoSelectTimeframe: boolean
  autoSelectIndicators: boolean
  tradingSessions: string[]
  autoTradingEnabled: boolean
  autoTradeConfidenceThreshold: number
  autoTradeSignalMaxAgeMin: number
  trailingStopMode: 'manual' | 'auto'
  trailingStopPips: number
  mlSelfLearning: boolean
}

const DEFAULT_FORM: RiskForm = {
  riskPerTradePct: 0.75,
  stopLossPipsMin: 5,
  stopLossPipsMax: 15,
  riskRewardRatio: 1.5,
  maxOpenPositions: 3,
  dailyRiskLimitPct: 2.5,
  dailyTargetPct: 2,
  riskEnforcementEnabled: true,
  maxLotSizePerTrade: 1.0,
  maxTotalLotSize: 5.0,
  maxRiskPerTradePct: 1.0,
  marginCallLevel: 50,
  avoidHighImpactNews: true,
  autoSelectPair: true,
  autoSelectTimeframe: true,
  autoSelectIndicators: true,
  tradingSessions: ['london', 'overlap'],
  autoTradingEnabled: false,
  autoTradeConfidenceThreshold: 70,
  autoTradeSignalMaxAgeMin: 10,
  trailingStopMode: 'auto',
  trailingStopPips: 5,
  mlSelfLearning: true,
}

const SESSION_OPTIONS = [
  { id: 'london', label: 'London' },
  { id: 'overlap', label: 'London-NY Overlap' },
  { id: 'tokyo', label: 'Tokyo' },
  { id: 'ny', label: 'New York' },
  { id: 'sydney', label: 'Sydney' },
] as const

/* ---------------- parse settings ---------------- */

function parseSettings(raw: Record<string, string>): RiskForm {
  const num = (k: string, def: number) => {
    const v = raw[k]
    const n = v === undefined ? NaN : parseFloat(v)
    return Number.isFinite(n) ? n : def
  }
  const bool = (k: string, def: boolean) => {
    const v = raw[k]
    return v === undefined ? def : v === 'true'
  }
  const sessions = (raw.tradingSessions || 'london,overlap')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const mode = raw.trailingStopMode === 'manual' ? 'manual' : 'auto'
  return {
    riskPerTradePct: num('riskPerTradePct', 0.75),
    stopLossPipsMin: num('stopLossPipsMin', 5),
    stopLossPipsMax: num('stopLossPipsMax', 15),
    riskRewardRatio: num('riskRewardRatio', 1.5),
    maxOpenPositions: num('maxOpenPositions', 3),
    dailyRiskLimitPct: num('dailyRiskLimitPct', 2.5),
    dailyTargetPct: num('dailyTargetPct', 2),
    riskEnforcementEnabled: bool('riskEnforcementEnabled', true),
    maxLotSizePerTrade: num('maxLotSizePerTrade', 1.0),
    maxTotalLotSize: num('maxTotalLotSize', 5.0),
    maxRiskPerTradePct: num('maxRiskPerTradePct', 1.0),
    marginCallLevel: num('marginCallLevel', 50),
    avoidHighImpactNews: bool('avoidHighImpactNews', true),
    autoSelectPair: bool('autoSelectPair', true),
    autoSelectTimeframe: bool('autoSelectTimeframe', true),
    autoSelectIndicators: bool('autoSelectIndicators', true),
    tradingSessions: sessions,
    autoTradingEnabled: bool('autoTradingEnabled', false),
    autoTradeConfidenceThreshold: num('autoTradeConfidenceThreshold', 70),
    autoTradeSignalMaxAgeMin: num('autoTradeSignalMaxAgeMin', 10),
    trailingStopMode: mode,
    trailingStopPips: num('trailingStopPips', 5),
    mlSelfLearning: bool('mlSelfLearning', true),
  }
}

function serializeForm(f: RiskForm): Record<string, string> {
  return {
    riskPerTradePct: String(f.riskPerTradePct),
    stopLossPipsMin: String(f.stopLossPipsMin),
    stopLossPipsMax: String(f.stopLossPipsMax),
    riskRewardRatio: String(f.riskRewardRatio),
    maxOpenPositions: String(f.maxOpenPositions),
    dailyRiskLimitPct: String(f.dailyRiskLimitPct),
    dailyTargetPct: String(f.dailyTargetPct),
    riskEnforcementEnabled: String(f.riskEnforcementEnabled),
    maxLotSizePerTrade: String(f.maxLotSizePerTrade),
    maxTotalLotSize: String(f.maxTotalLotSize),
    maxRiskPerTradePct: String(f.maxRiskPerTradePct),
    marginCallLevel: String(f.marginCallLevel),
    avoidHighImpactNews: String(f.avoidHighImpactNews),
    autoSelectPair: String(f.autoSelectPair),
    autoSelectTimeframe: String(f.autoSelectTimeframe),
    autoSelectIndicators: String(f.autoSelectIndicators),
    tradingSessions: f.tradingSessions.join(','),
    autoTradingEnabled: String(f.autoTradingEnabled),
    autoTradeConfidenceThreshold: String(f.autoTradeConfidenceThreshold),
    autoTradeSignalMaxAgeMin: String(f.autoTradeSignalMaxAgeMin),
    trailingStopMode: f.trailingStopMode,
    trailingStopPips: String(f.trailingStopPips),
    mlSelfLearning: String(f.mlSelfLearning),
  }
}

/* ---------------- circular gauge ---------------- */

function CircularGauge({
  pct,
  color,
  size = 180,
}: {
  pct: number
  color: string
  size?: number
}) {
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(Math.max(pct, 0), 100)
  const dash = (clamped / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
          opacity={0.35}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
          initial={false}
          animate={{ strokeDasharray: `${dash} ${c - dash}`, stroke: color }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </svg>
    </div>
  )
}

/* ---------------- sub stat ---------------- */

function SubStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'bull' | 'bear' | 'warn' | 'neutral'
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
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-semibold tabular ${toneClass}`}>{value}</div>
    </div>
  )
}

/* ---------------- setting row ---------------- */

function SettingRow({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {helper && <div className="text-[11px] text-muted-foreground">{helper}</div>}
      </div>
      <div className="sm:justify-self-end">{children}</div>
    </div>
  )
}

function SliderRow({
  label,
  helper,
  value,
  min,
  max,
  step,
  onChange,
  display,
  tone = 'bull',
}: {
  label: string
  helper?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  display: string
  tone?: 'bull' | 'bear' | 'warn'
}) {
  const badgeClass =
    tone === 'bear' ? 'border-bear/40 text-bear' : tone === 'warn' ? 'border-warn/40 text-warn' : 'border-bull/40 text-bull'
  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          {helper && <div className="text-[11px] text-muted-foreground">{helper}</div>}
        </div>
        <Badge variant="outline" className={`tabular ${badgeClass}`}>
          {display}
        </Badge>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

/* ---------------- lot size calculator ---------------- */

function valuePerPipPerLot(symbol: string, refPrice: number): number {
  const pip = SYMBOL_BASE[symbol]?.pip ?? 0.0001
  if (symbol === 'USDJPY') return (100000 * pip) / refPrice
  if (symbol === 'XAUUSD') return 100 * pip
  return 100000 * pip // EURUSD, GBPUSD
}

function LotCalculator({ initialBalance }: { initialBalance: number }) {
  const [symbol, setSymbol] = useState<string>('EURUSD')
  const [balance, setBalance] = useState<number>(initialBalance)
  const [riskPct, setRiskPct] = useState<number>(0.75)
  const [slPips, setSlPips] = useState<number>(10)

  const refPrice = SYMBOL_BASE[symbol]?.price ?? 1
  const vpp = valuePerPipPerLot(symbol, refPrice)
  const riskAmount = balance * (riskPct / 100)
  const denom = slPips * vpp
  const lot = denom > 0 ? riskAmount / denom : 0
  const lotRounded = Math.max(0.01, Math.floor(lot * 100) / 100)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-bull" />
          Lot Size Calculator
        </CardTitle>
        <CardDescription>Hitung lot optimal berdasarkan risk & SL.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
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
            <Label htmlFor="lot-bal" className="text-xs">Balance ($)</Label>
            <Input
              id="lot-bal"
              type="number"
              min={0}
              step={100}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lot-risk" className="text-xs">Risk (%)</Label>
            <Input
              id="lot-risk"
              type="number"
              min={0.1}
              max={5}
              step={0.05}
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lot-sl" className="text-xs">SL (pips)</Label>
            <Input
              id="lot-sl"
              type="number"
              min={1}
              max={50}
              step={1}
              value={slPips}
              onChange={(e) => setSlPips(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5 text-xs text-muted-foreground">
          <div className="flex justify-between tabular">
            <span>Risk Amount</span>
            <span className="text-bear font-medium">{fmtMoney(riskAmount)}</span>
          </div>
          <div className="flex justify-between tabular">
            <span>SL Distance</span>
            <span>{slPips} pips</span>
          </div>
          <div className="flex justify-between tabular">
            <span>Value per Pip / Lot</span>
            <span>{fmtMoney(vpp)}</span>
          </div>
          <div className="flex justify-between tabular">
            <span>Reference Price</span>
            <span>{refPrice}</span>
          </div>
        </div>

        <div className="rounded-md border border-bull/30 bg-bull/10 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Rekomendasi Lot
          </div>
          <div className="mt-0.5 text-2xl font-bold tabular text-bull">
            {lotRounded.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground tabular">
            Risk {fmtMoney(riskAmount)} → SL {slPips} pips × {fmtMoney(vpp)}/lot → Lot {lotRounded.toFixed(2)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------- rules checklist ---------------- */

interface Rule {
  label: string
  pass: boolean
  value: string
}

function RulesChecklist({ form }: { form: RiskForm }) {
  const rules: Rule[] = [
    {
      label: 'Risk per Trade 0.5% – 1%',
      pass: form.riskPerTradePct >= 0.5 && form.riskPerTradePct <= 1.0,
      value: `${form.riskPerTradePct.toFixed(2)}%`,
    },
    {
      label: 'Stop Loss 5 – 15 pips',
      pass: form.stopLossPipsMax >= 5 && form.stopLossPipsMax <= 15,
      value: `${form.stopLossPipsMin} – ${form.stopLossPipsMax} pips`,
    },
    {
      label: 'Risk : Reward ≥ 1 : 1.5',
      pass: form.riskRewardRatio >= 1.5,
      value: `1 : ${form.riskRewardRatio.toFixed(1)}`,
    },
    {
      label: 'Maksimal 1 – 3 Open Positions',
      pass: form.maxOpenPositions >= 1 && form.maxOpenPositions <= 3,
      value: `${form.maxOpenPositions} posisi`,
    },
    {
      label: 'Daily Risk Limit 2% – 3%',
      pass: form.dailyRiskLimitPct >= 2 && form.dailyRiskLimitPct <= 3,
      value: `${form.dailyRiskLimitPct.toFixed(1)}%`,
    },
    {
      label: 'Hindari News High-Impact',
      pass: form.avoidHighImpactNews,
      value: form.avoidHighImpactNews ? 'On' : 'Off',
    },
    {
      label: 'Target Harian 1% – 3%',
      pass: form.dailyTargetPct >= 1 && form.dailyTargetPct <= 3,
      value: `${form.dailyTargetPct.toFixed(1)}%`,
    },
    {
      label: 'Trailing Stop dikonfigurasi',
      pass: form.trailingStopPips >= 3 && form.trailingStopPips <= 20,
      value: `${form.trailingStopMode} • ${form.trailingStopPips} pips`,
    },
  ]

  const passed = rules.filter((r) => r.pass).length
  const allPass = passed === rules.length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeCheck className="h-4 w-4 text-bull" />
            Compliance Money Management
          </CardTitle>
          <Badge
            variant="outline"
            className={
              allPass
                ? 'border-bull/40 text-bull'
                : passed >= 6
                  ? 'border-warn/40 text-warn'
                  : 'border-bear/40 text-bear'
            }
          >
            {passed} / {rules.length}
          </Badge>
        </div>
        <CardDescription>
          8 aturan inti Anti-MC dari spesifikasi trading.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {rules.map((r) => (
            <div
              key={r.label}
              className={`flex items-center gap-2 rounded-md border p-2.5 ${
                r.pass
                  ? 'border-bull/30 bg-bull/5'
                  : 'border-bear/30 bg-bear/5'
              }`}
            >
              {r.pass ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-bull" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-bear" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">{r.label}</div>
                <div className="text-[10px] text-muted-foreground tabular">{r.value}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------- main panel ---------------- */

export function RiskPanel() {
  const qc = useQueryClient()

  const usageQuery = useQuery({
    queryKey: ['risk-usage'],
    queryFn: () => api.riskUsage(),
    refetchInterval: 5000,
  })

  const settingsQuery = useQuery({
    queryKey: ['risk-settings'],
    queryFn: () => api.risk(),
    staleTime: Infinity,
  })

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts(),
    staleTime: 60 * 1000,
  })
  const defaultAccount =
    accountsQuery.data?.accounts.find((a) => a.isDefault) ??
    accountsQuery.data?.accounts[0] ??
    null

  const serverForm = useMemo(
    () => (settingsQuery.data ? parseSettings(settingsQuery.data.settings) : DEFAULT_FORM),
    [settingsQuery.data],
  )
  const [form, setForm] = useState<RiskForm>(DEFAULT_FORM)
  const [initialized, setInitialized] = useState(false)

  // Hydrate form from server on first data arrival (render-time setState — React-blessed pattern).
  if (!initialized && settingsQuery.data) {
    setInitialized(true)
    setForm(parseSettings(settingsQuery.data.settings))
  }

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(serverForm),
    [form, serverForm],
  )

  const update = <K extends keyof RiskForm>(key: K, value: RiskForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const saveMut = useMutation({
    mutationFn: () => api.updateRisk(serializeForm(form)),
    onSuccess: (data) => {
      // Sync cache so serverForm updates immediately and dirty flag clears.
      qc.setQueryData(['risk-settings'], { settings: data.settings })
      setForm(parseSettings(data.settings))
      toast.success('Pengaturan risiko disimpan', {
        description: 'Konfigurasi Anti-MC diperbarui.',
      })
      qc.invalidateQueries({ queryKey: ['risk-settings'] })
      qc.invalidateQueries({ queryKey: ['risk-usage'] })
    },
    onError: (e: unknown) => {
      toast.error('Gagal menyimpan', {
        description: e instanceof Error ? e.message : 'Unknown error',
      })
    },
  })

  // broker settings (read-only) — read from system config keys present in risk settings or seed defaults
  const broker = useMemo(
    () => ({
      spreadMajorFrom: settingsQuery.data?.settings?.brokerSpreadMajorFromPip ?? '0.0',
      commissionPerLot: settingsQuery.data?.settings?.brokerCommissionPerLot ?? '2.5',
      maxLeverage: settingsQuery.data?.settings?.brokerMaxLeverage ?? '1:100',
    }),
    [settingsQuery.data],
  )

  const usage: RiskUsage | null = usageQuery.data ?? null
  const usedPct = usage?.usedPct ?? 0
  const limitPct = usage?.limitPct ?? 2.5
  const ratio = limitPct > 0 ? usedPct / limitPct : 0
  const overLimit = usedPct >= limitPct
  const zone: 'bull' | 'warn' | 'bear' =
    ratio >= 0.8 ? 'bear' : ratio >= 0.5 ? 'warn' : 'bull'
  const gaugeColor =
    zone === 'bull' ? 'var(--bull)' : zone === 'warn' ? 'var(--warn)' : 'var(--bear)'
  const gaugePct = Math.min(ratio * 100, 100)

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-bull" />
            Risk Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pusat kontrol aturan money management & Anti-MC untuk scalping M5.
          </p>
        </div>
        <Badge
          variant="outline"
          className={`gap-1.5 ${
            overLimit
              ? 'border-bear/50 text-bear'
              : zone === 'warn'
                ? 'border-warn/40 text-warn'
                : 'border-bull/40 text-bull'
          }`}
        >
          <span
            className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${
              overLimit ? 'bg-bear' : zone === 'warn' ? 'bg-warn' : 'bg-bull'
            }`}
          />
          {overLimit ? 'STOP TRADING' : zone === 'warn' ? 'CAUTION' : 'HEALTHY'}
        </Badge>
      </div>

      {/* over-limit banner */}
      {overLimit && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-lg border border-bear/60 bg-bear/15 p-4"
        >
          <AlertOctagon className="h-6 w-6 shrink-0 text-bear" />
          <div>
            <div className="font-semibold text-bear">
              DAILY RISK LIMIT TERCAPAI
            </div>
            <div className="text-sm text-bear/80">
              Trading dihentikan otomatis (Anti MC Rule). Tutup posisi yang merugi atau tunggu reset hari berikutnya.
            </div>
          </div>
        </motion.div>
      )}

      {/* hero card */}
      <Card className="overflow-hidden">
        <CardContent className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[auto_1fr] md:items-center">
          {/* gauge */}
          <div className="flex items-center justify-center">
            {usageQuery.isLoading ? (
              <Skeleton className="h-[180px] w-[180px] rounded-full" />
            ) : (
              <div className="relative">
                <CircularGauge pct={gaugePct} color={gaugeColor} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className="text-3xl font-bold tabular"
                    style={{ color: gaugeColor }}
                  >
                    {usedPct.toFixed(2)}%
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    of {limitPct.toFixed(1)}% limit
                  </span>
                  <span
                    className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                    style={{
                      color: gaugeColor,
                      background: `${gaugeColor}22`,
                    }}
                  >
                    {zone === 'bull' ? 'Aman' : zone === 'warn' ? 'Waspada' : 'Stop'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* sub stats */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-3">
            <SubStat
              label="Open Risk %"
              value={`${(usage?.openRiskPct ?? 0).toFixed(2)}%`}
              tone={(usage?.openRiskPct ?? 0) > 1 ? 'bear' : 'neutral'}
            />
            <SubStat
              label="Daily P&L %"
              value={fmtPct(usage?.dailyPnlPct ?? 0)}
              tone={(usage?.dailyPnlPct ?? 0) >= 0 ? 'bull' : 'bear'}
            />
            <SubStat
              label="Open Positions"
              value={`${usage?.openPositions ?? 0} / ${usage?.maxPositions ?? 0}`}
              tone={
                (usage?.openPositions ?? 0) >= (usage?.maxPositions ?? 0) ? 'bear' : 'neutral'
              }
            />
            <SubStat
              label="Daily P&L"
              value={fmtMoney(usage?.dailyPnl ?? 0)}
              tone={(usage?.dailyPnl ?? 0) >= 0 ? 'bull' : 'bear'}
            />
            <SubStat
              label="Balance"
              value={fmtMoney(usage?.balance ?? 0)}
            />
            <SubStat
              label="Risk Remaining"
              value={`${Math.max(0, limitPct - usedPct).toFixed(2)}%`}
              tone={Math.max(0, limitPct - usedPct) <= limitPct * 0.2 ? 'bear' : 'bull'}
            />
          </div>
        </CardContent>
      </Card>

      {/* main grid: settings + lot calculator */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* settings form */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sliders className="h-4 w-4 text-bull" />
                  Pengaturan Risk Management
                </CardTitle>
                <CardDescription>
                  Aturan inti scalping M5. Perubahan diterapkan ke semua strategi.
                </CardDescription>
              </div>
              {dirty && (
                <Badge variant="outline" className="border-warn/40 text-warn">
                  Unsaved changes
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {settingsQuery.isLoading && !initialized ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <SliderRow
                  label="Risk per Trade"
                  helper="0.5% – 1% per posisi"
                  value={form.riskPerTradePct}
                  min={0.5}
                  max={1.0}
                  step={0.05}
                  onChange={(v) => update('riskPerTradePct', v)}
                  display={`${form.riskPerTradePct.toFixed(2)}%`}
                />
                <Separator />

                <div className="py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">Stop Loss (pips)</div>
                      <div className="text-[11px] text-muted-foreground">5 – 15 pips range</div>
                    </div>
                    <Badge variant="outline" className="tabular border-warn/40 text-warn">
                      {form.stopLossPipsMin} – {form.stopLossPipsMax} pips
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Min</Label>
                      <Input
                        type="number"
                        min={1}
                        max={form.stopLossPipsMax}
                        value={form.stopLossPipsMin}
                        onChange={(e) =>
                          update('stopLossPipsMin', Math.min(Number(e.target.value) || 0, form.stopLossPipsMax))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Max</Label>
                      <Input
                        type="number"
                        min={form.stopLossPipsMin}
                        max={50}
                        value={form.stopLossPipsMax}
                        onChange={(e) =>
                          update('stopLossPipsMax', Math.max(Number(e.target.value) || 0, form.stopLossPipsMin))
                        }
                      />
                    </div>
                  </div>
                </div>
                <Separator />

                <SliderRow
                  label="Risk : Reward Ratio"
                  helper="Minimal 1 : 1.5 untuk scalping"
                  value={form.riskRewardRatio}
                  min={1.0}
                  max={3.0}
                  step={0.1}
                  onChange={(v) => update('riskRewardRatio', v)}
                  display={`1 : ${form.riskRewardRatio.toFixed(1)}`}
                />
                <Separator />

                <SliderRow
                  label="Maksimal Open Position"
                  helper="1 – 3 posisi bersamaan"
                  value={form.maxOpenPositions}
                  min={1}
                  max={5}
                  step={1}
                  onChange={(v) => update('maxOpenPositions', v)}
                  display={`${form.maxOpenPositions}`}
                  tone={form.maxOpenPositions > 3 ? 'warn' : 'bull'}
                />
                <Separator />

                <SliderRow
                  label="Daily Risk Limit"
                  helper="2% – 3% dari modal (Anti MC)"
                  value={form.dailyRiskLimitPct}
                  min={2}
                  max={3}
                  step={0.1}
                  onChange={(v) => update('dailyRiskLimitPct', v)}
                  display={`${form.dailyRiskLimitPct.toFixed(1)}%`}
                  tone="bear"
                />
                <Separator />

                <SliderRow
                  label="Target Harian"
                  helper="1% – 3% per hari"
                  value={form.dailyTargetPct}
                  min={1}
                  max={3}
                  step={0.1}
                  onChange={(v) => update('dailyTargetPct', v)}
                  display={`${form.dailyTargetPct.toFixed(1)}%`}
                />
                <Separator />

                {/* ─── r10-risk: Server-Side Enforcement ─── */}
                <SettingRow
                  label="Risk Enforcement (Server-Side)"
                  helper="Hard block trades yang melanggar rule di server"
                >
                  <Switch
                    checked={form.riskEnforcementEnabled}
                    onCheckedChange={(v) => update('riskEnforcementEnabled', v)}
                  />
                </SettingRow>
                <Separator />

                <SliderRow
                  label="Max Lot per Trade"
                  helper="Lot maksimum untuk 1 posisi"
                  value={form.maxLotSizePerTrade}
                  min={0.01}
                  max={5.0}
                  step={0.01}
                  onChange={(v) => update('maxLotSizePerTrade', v)}
                  display={`${form.maxLotSizePerTrade.toFixed(2)} lot`}
                  tone={form.maxLotSizePerTrade > 2 ? 'warn' : 'bull'}
                />
                <Separator />

                <SliderRow
                  label="Max Total Lot"
                  helper="Total lot semua posisi terbuka"
                  value={form.maxTotalLotSize}
                  min={0.1}
                  max={20.0}
                  step={0.1}
                  onChange={(v) => update('maxTotalLotSize', v)}
                  display={`${form.maxTotalLotSize.toFixed(1)} lot`}
                  tone={form.maxTotalLotSize > 10 ? 'warn' : 'bull'}
                />
                <Separator />

                <SliderRow
                  label="Max Risk per Trade"
                  helper="% balance yang boleh di-risk per posisi (dari SL)"
                  value={form.maxRiskPerTradePct}
                  min={0.25}
                  max={3.0}
                  step={0.25}
                  onChange={(v) => update('maxRiskPerTradePct', v)}
                  display={`${form.maxRiskPerTradePct.toFixed(2)}%`}
                  tone={form.maxRiskPerTradePct > 2 ? 'warn' : 'bull'}
                />
                <Separator />

                <SliderRow
                  label="Margin Call Level"
                  helper="Block trade baru jika margin level < ini"
                  value={form.marginCallLevel}
                  min={20}
                  max={100}
                  step={5}
                  onChange={(v) => update('marginCallLevel', v)}
                  display={`${form.marginCallLevel}%`}
                  tone={form.marginCallLevel < 50 ? 'bear' : 'bull'}
                />
                <Separator />

                <SettingRow
                  label="Hindari News Besar"
                  helper="Saat scalping, hindari news high-impact"
                >
                  <Switch
                    checked={form.avoidHighImpactNews}
                    onCheckedChange={(v) => update('avoidHighImpactNews', v)}
                  />
                </SettingRow>
                <Separator />

                <div className="py-3">
                  <div className="mb-2 text-sm font-medium text-foreground">
                    Auto-select Pair / Timeframe / Indicators
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    AI memilih konfigurasi optimal berdasarkan kondisi pasar.
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      ['autoSelectPair', 'Pair'],
                      ['autoSelectTimeframe', 'Timeframe'],
                      ['autoSelectIndicators', 'Indicators'],
                    ] as const).map(([key, lbl]) => (
                      <label
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/40 p-2.5"
                      >
                        <span className="text-xs text-foreground">{lbl}</span>
                        <Switch
                          checked={form[key]}
                          onCheckedChange={(v) => update(key, v)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <Separator />

                <div className="py-3">
                  <div className="mb-2 text-sm font-medium text-foreground">
                    Trading Sessions
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Sesi aktif untuk entry scalping.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SESSION_OPTIONS.map((s) => {
                      const on = form.tradingSessions.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            update(
                              'tradingSessions',
                              on
                                ? form.tradingSessions.filter((x) => x !== s.id)
                                : [...form.tradingSessions, s.id],
                            )
                          }
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                            on
                              ? 'border-bull/50 bg-bull/15 text-bull'
                              : 'border-border bg-card/40 text-muted-foreground hover:bg-muted/60'
                          }`}
                        >
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <Separator />

                <SettingRow
                  label="Auto Trading Enabled"
                  helper="Bot akan open/close otomatis berdasarkan sinyal AI"
                >
                  <div className="flex items-center gap-2">
                    {form.autoTradingEnabled && (
                      <Badge variant="outline" className="border-warn/40 text-warn">
                        Aktif
                      </Badge>
                    )}
                    <Switch
                      checked={form.autoTradingEnabled}
                      onCheckedChange={(v) => update('autoTradingEnabled', v)}
                    />
                  </div>
                </SettingRow>
                {form.autoTradingEnabled && (
                  <div className="flex items-center gap-2 rounded-md border border-warn/30 bg-warn/10 p-2.5 text-xs text-warn">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    Auto-trading aktif. Pastikan risk settings sudah sesuai sebelum meninggalkan terminal.
                  </div>
                )}
                {form.autoTradingEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md border border-border bg-muted/30 p-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <div className="text-xs font-medium">Confidence Threshold</div>
                          <div className="text-[10px] text-muted-foreground">Min confidence AI signal untuk auto-execute</div>
                        </div>
                        <Badge variant="outline" className="tabular text-[10px]">{form.autoTradeConfidenceThreshold}%</Badge>
                      </div>
                      <Slider
                        value={[form.autoTradeConfidenceThreshold]}
                        min={50}
                        max={95}
                        step={5}
                        onValueChange={(v) => update('autoTradeConfidenceThreshold', v[0])}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <div className="text-xs font-medium">Signal Max Age (menit)</div>
                          <div className="text-[10px] text-muted-foreground">Sinyal lebih lama dari ini diabaikan</div>
                        </div>
                        <Badge variant="outline" className="tabular text-[10px]">{form.autoTradeSignalMaxAgeMin}m</Badge>
                      </div>
                      <Slider
                        value={[form.autoTradeSignalMaxAgeMin]}
                        min={1}
                        max={30}
                        step={1}
                        onValueChange={(v) => update('autoTradeSignalMaxAgeMin', v[0])}
                      />
                    </div>
                  </div>
                )}
                <Separator />

                <div className="py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-foreground">Trailing Stop</div>
                      <div className="text-[11px] text-muted-foreground">
                        Mode & jarak trailing (3 – 20 pips)
                      </div>
                    </div>
                    <Badge variant="outline" className="tabular border-bull/40 text-bull">
                      {form.trailingStopMode} • {form.trailingStopPips} pips
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      value={form.trailingStopMode}
                      onValueChange={(v) => update('trailingStopMode', v as 'manual' | 'auto')}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[form.trailingStopPips]}
                        min={3}
                        max={20}
                        step={1}
                        onValueChange={(v) => update('trailingStopPips', v[0])}
                        className="flex-1"
                      />
                      <span className="w-10 text-right text-xs tabular text-muted-foreground">
                        {form.trailingStopPips}
                      </span>
                    </div>
                  </div>
                </div>
                <Separator />

                <SettingRow
                  label="ML Self-Learning"
                  helper="Model AI terus melatih ulang dari hasil trade terbaru"
                >
                  <Switch
                    checked={form.mlSelfLearning}
                    onCheckedChange={(v) => update('mlSelfLearning', v)}
                  />
                </SettingRow>
                <Separator />

                {/* broker (read-only) */}
                <div className="py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-medium text-foreground">
                      Broker Settings
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Read-only
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded-md border border-border bg-card/40 p-2.5">
                      <div className="text-muted-foreground">Spread Major from</div>
                      <div className="mt-0.5 font-medium tabular text-foreground">
                        {broker.spreadMajorFrom} pip
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-card/40 p-2.5">
                      <div className="text-muted-foreground">Commission</div>
                      <div className="mt-0.5 font-medium tabular text-foreground">
                        ${broker.commissionPerLot}/lot
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-card/40 p-2.5">
                      <div className="text-muted-foreground">Max Leverage</div>
                      <div className="mt-0.5 font-medium tabular text-foreground">
                        {broker.maxLeverage}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 -mx-6 mt-3 flex items-center justify-end gap-2 border-t border-border bg-card/95 px-6 py-3 backdrop-blur">
                  {dirty && (
                    <Button
                      variant="ghost"
                      onClick={() => setForm(serverForm)}
                      disabled={saveMut.isPending}
                    >
                      Reset
                    </Button>
                  )}
                  <Button
                    className="bg-bull text-bull-foreground hover:bg-bull/90"
                    disabled={!dirty || saveMut.isPending}
                    onClick={() => saveMut.mutate()}
                  >
                    {saveMut.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Simpan Pengaturan
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* right column: lot calculator */}
        <div className="space-y-4">
          <LotCalculator
            key={defaultAccount?.id ?? 'loading'}
            initialBalance={defaultAccount?.balance ?? 10000}
          />
        </div>
      </div>

      {/* rules checklist (full width) */}
      <RulesChecklist form={form} />
    </div>
  )
}
