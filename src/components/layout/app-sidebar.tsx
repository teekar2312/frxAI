'use client'

import { NAV_ITEMS, SectionId } from './nav-config'
import { cn } from '@/lib/utils'
import { Activity, TrendingUp } from 'lucide-react'

interface SidebarProps {
  active: SectionId
  onNavigate: (id: SectionId) => void
}

const GROUP_LABELS: Record<string, string> = {
  monitor: 'MONITORING',
  trade: 'TRADING',
  system: 'SYSTEM',
}

export function AppSidebar({ active, onNavigate }: SidebarProps) {
  const groups = ['monitor', 'trade', 'system'] as const
  return (
    <aside className="hidden md:flex h-screen w-60 flex-col border-r border-border bg-sidebar text-sidebar-foreground sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-sidebar-border">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/20">
          <TrendingUp className="h-5 w-5" />
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 live-dot ring-2 ring-sidebar" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-sm tracking-tight">FinexFX AI</span>
          <span className="text-[10px] text-muted-foreground font-mono">v1.0 • MT5 • M5</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scroll-thin px-2 py-3 space-y-4">
        {groups.map((g) => {
          const items = NAV_ITEMS.filter((i) => i.group === g)
          return (
            <div key={g} className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70">
                {GROUP_LABELS[g]}
              </div>
              {items.map((item) => {
                const Icon = item.icon
                const isActive = active === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                    )}
                    title={item.description}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 -translate-y-1/2 w-0.5 rounded-r bg-sidebar-primary" />
                    )}
                    <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-sidebar-primary' : '')} />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer status */}
      <div className="border-t border-sidebar-border px-3 py-3 space-y-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-emerald-500" />
            <span className="font-mono">Engine: Python 3.14</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-mono">Broker: FINEX ID</span>
          <span className="font-mono">Lev 1:100</span>
        </div>
      </div>
    </aside>
  )
}
