'use client'

import { useState, useEffect, lazy, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppTopbar } from '@/components/layout/app-topbar'
import { AppFooter } from '@/components/layout/app-footer'
import { SectionId } from '@/components/layout/nav-config'
import { usePriceFeed } from '@/hooks/use-price-feed'
import { useAutoPilot } from '@/hooks/use-auto-pilot'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'

// Lazy-load each panel so the shell renders instantly
const DashboardPanel = lazy(() => import('@/components/panels/dashboard-panel').then(m => ({ default: m.DashboardPanel })))
const TradingPanel = lazy(() => import('@/components/panels/trading-panel').then(m => ({ default: m.TradingPanel })))
const AiPanel = lazy(() => import('@/components/panels/ai-panel').then(m => ({ default: m.AiPanel })))
const NewsPanel = lazy(() => import('@/components/panels/news-panel').then(m => ({ default: m.NewsPanel })))
const IndicatorsPanel = lazy(() => import('@/components/panels/indicators-panel').then(m => ({ default: m.IndicatorsPanel })))
const BacktestPanel = lazy(() => import('@/components/panels/backtest-panel').then(m => ({ default: m.BacktestPanel })))
const CalendarPanel = lazy(() => import('@/components/panels/calendar-panel').then(m => ({ default: m.CalendarPanel })))
const AnalyticsPanel = lazy(() => import('@/components/panels/analytics-panel').then(m => ({ default: m.AnalyticsPanel })))
const RiskPanel = lazy(() => import('@/components/panels/risk-panel').then(m => ({ default: m.RiskPanel })))
const AlertsPanel = lazy(() => import('@/components/panels/alerts-panel').then(m => ({ default: m.AlertsPanel })))
const LogsPanel = lazy(() => import('@/components/panels/logs-panel').then(m => ({ default: m.LogsPanel })))
const SettingsPanel = lazy(() => import('@/components/panels/settings-panel').then(m => ({ default: m.SettingsPanel })))

function PanelSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

const PANELS: Record<SectionId, () => JSX.Element> = {
  dashboard: DashboardPanel,
  trading: TradingPanel,
  ai: AiPanel,
  calendar: CalendarPanel,
  news: NewsPanel,
  analytics: AnalyticsPanel,
  indicators: IndicatorsPanel,
  backtest: BacktestPanel,
  risk: RiskPanel,
  alerts: AlertsPanel,
  logs: LogsPanel,
  settings: SettingsPanel,
}

export default function Home() {
  const { status } = useSession()
  const [section, setSection] = useState<SectionId>(() => {
    if (typeof window === 'undefined') return 'dashboard'
    const hash = window.location.hash.replace('#', '') as SectionId
    return hash && PANELS[hash] ? hash : 'dashboard'
  })
  usePriceFeed()
  const { autoEnabled: autoPilotOn } = useAutoPilot()

  // Listen for hashchange (direct URL navigation / back-forward)
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace('#', '') as SectionId
      if (hash && PANELS[hash] && hash !== section) setSection(hash)
    }
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [section])

  // Persist active section in hash for shareable links
  useEffect(() => {
    if (window.location.hash.replace('#', '') !== section) {
      window.location.hash = section
    }
  }, [section])

  // While session is loading, show a spinner. Middleware will redirect to /login
  // if unauthenticated, but this prevents flash of dashboard content.
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <p className="text-sm text-muted-foreground">Loading session...</p>
        </div>
      </div>
    )
  }

  const Panel = PANELS[section]

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <AppSidebar active={section} onNavigate={setSection} />
      <div className="flex min-h-screen flex-1 flex-col">
        <AppTopbar active={section} onNavigate={setSection} autoPilotOn={autoPilotOn} />
        <main className="flex-1">
          <Suspense fallback={<PanelSkeleton />}>
            <Panel />
          </Suspense>
        </main>
        <AppFooter />
      </div>
    </div>
  )
}
