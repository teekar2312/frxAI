'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useFeed } from '@/hooks/use-price-feed'
import { useActiveAccount, resolveAccount } from '@/hooks/use-active-account'
import { useClock, formatJakartaTime, formatJakartaDate, formatUtcTime, fmtMoney } from '@/lib/format'
import { NAV_ITEMS, SectionId } from './nav-config'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { Account } from '@/lib/types'
import {
  Wifi, WifiOff, Menu, Clock, Globe2, Radio, Bot,
  ChevronDown, FlaskConical, ShieldCheck, Wallet,
  LogOut, User as UserIcon, Lock, Crown, Eye, TrendingUp,
} from 'lucide-react'
import {
  Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/theme-toggle'

interface TopbarProps {
  active: SectionId
  onNavigate: (id: SectionId) => void
  autoPilotOn?: boolean
}

export function AppTopbar({ active, onNavigate, autoPilotOn = false }: TopbarProps) {
  const connected = useFeed((s) => s.connected)
  const systemStatus = useFeed((s) => s.systemStatus)
  const now = useClock()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { data: session } = useSession()
  const router = useRouter()

  // Global account switcher
  const { activeAccountId, setActiveAccountId } = useActiveAccount()
  const queryClient = useQueryClient()
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts(),
    refetchInterval: 30000,
  })
  const accounts = accountsData?.accounts ?? []
  const currentAccount = resolveAccount(accounts, activeAccountId)

  const currentItem = NAV_ITEMS.find((i) => i.id === active)

  const scalpingWindow = systemStatus?.scalpingWindow ?? false

  const handleSelectAccount = (id: string) => {
    setActiveAccountId(id)
    // Invalidate all account-scoped queries so every panel refetches.
    queryClient.invalidateQueries({ queryKey: ['trades'] })
    queryClient.invalidateQueries({ queryKey: ['analytics'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    queryClient.invalidateQueries({ queryKey: ['risk'] })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-md px-4 md:px-6">
      {/* Mobile menu */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="px-4 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-500" /> FinexFX AI
            </SheetTitle>
          </SheetHeader>
          <nav className="p-2 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = active === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => { onNavigate(item.id); setMobileOpen(false) }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Section title */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2">
          {currentItem && <currentItem.icon className="h-4 w-4 text-emerald-500 shrink-0" />}
          <h1 className="text-base md:text-lg font-bold tracking-tight truncate">{currentItem?.label ?? 'Dashboard'}</h1>
        </div>
        <p className="hidden sm:block text-[11px] text-muted-foreground truncate">{currentItem?.description}</p>
      </div>

      <div className="flex-1" />

      {/* Account switcher — global, available from any panel */}
      {accounts.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-9 gap-2 px-2.5 hidden sm:flex" aria-label="Switch account">
              <div className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md border',
                currentAccount?.accountType === 'live'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-400'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
              )}>
                {currentAccount?.accountType === 'live'
                  ? <ShieldCheck className="h-3.5 w-3.5" />
                  : <FlaskConical className="h-3.5 w-3.5" />}
              </div>
              <div className="flex flex-col items-start leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold max-w-[100px] truncate">
                    {currentAccount?.name ?? 'Pilih Akun'}
                  </span>
                  {currentAccount?.connected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground font-mono tabular">
                  {currentAccount ? fmtMoney(currentAccount.equity, currentAccount.currency) : '—'}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[300px]">
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3 w-3" /> Pilih Akun Trading
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accounts.map((a: Account) => {
              const isActiveAcc = a.id === currentAccount?.id
              return (
                <DropdownMenuItem
                  key={a.id}
                  onClick={() => handleSelectAccount(a.id)}
                  className="flex flex-col items-start gap-1 py-2"
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {isActiveAcc && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                      <span className={cn('text-sm', isActiveAcc ? 'font-bold' : 'font-semibold')}>{a.name}</span>
                    </div>
                    <Badge variant="outline" className={cn(
                      'px-1.5 py-0 text-[10px] uppercase',
                      a.accountType === 'live'
                        ? 'border-rose-500/40 text-rose-400'
                        : 'border-emerald-500/40 text-emerald-400',
                    )}>
                      {a.accountType}
                    </Badge>
                  </div>
                  <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground font-mono tabular">
                    <span className="truncate">{a.broker}</span>
                    <span>{fmtMoney(a.balance, a.currency)}</span>
                  </div>
                  <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground font-mono tabular">
                    <span className="flex items-center gap-1">
                      <span className={cn('h-1.5 w-1.5 rounded-full', a.connected ? 'bg-emerald-400 live-dot' : 'bg-muted-foreground/50')} />
                      {a.connected ? 'Terhubung' : 'Terputus'}
                    </span>
                    <span>{a.isDefault ? 'Default' : ''}</span>
                  </div>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Auto-pilot indicator */}
      {autoPilotOn && (
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-400">
          <Bot className="h-3 w-3" />
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 live-dot" />
          Auto-Pilot
        </div>
      )}

      {/* Scalping window badge */}
      <div className={cn(
        'hidden lg:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        scalpingWindow
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
          : 'border-border bg-muted/50 text-muted-foreground',
      )}>
        <span className={cn('h-1.5 w-1.5 rounded-full', scalpingWindow ? 'bg-emerald-400 live-dot' : 'bg-muted-foreground/50')} />
        {scalpingWindow ? 'London/Overlap Active' : 'Off-Session'}
      </div>

      {/* UTC time */}
      <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
        <Globe2 className="h-3.5 w-3.5" />
        {formatUtcTime(now)}
      </div>

      {/* Jakarta time */}
      <div className="hidden sm:flex flex-col items-end leading-tight">
        <div className="flex items-center gap-1.5 text-sm font-mono font-semibold tabular">
          <Clock className="h-3.5 w-3.5 text-emerald-500" />
          {formatJakartaTime(now)}
        </div>
        <span className="text-[10px] text-muted-foreground">{formatJakartaDate(now)} • WIB</span>
      </div>

      {/* Connection */}
      <div className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        connected
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-400',
      )}>
        {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {connected ? 'Live Feed' : 'Reconnecting'}
      </div>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* User menu */}
      {session?.user && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 pl-2 pr-3">
              <span className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                session.user.role === 'admin'
                  ? 'bg-violet-500/20 text-violet-300'
                  : session.user.role === 'trader'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300',
              )}>
                {session.user.role === 'admin' ? <Crown className="h-3.5 w-3.5" />
                  : session.user.role === 'trader' ? <TrendingUp className="h-3.5 w-3.5" />
                  : <Eye className="h-3.5 w-3.5" />}
              </span>
              <span className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-xs font-medium">{session.user.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{session.user.role}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-1">
              <span className="text-sm font-medium">{session.user.name}</span>
              <span className="text-xs text-muted-foreground font-normal">{session.user.email}</span>
              <Badge variant="outline" className={cn(
                'w-fit mt-1 text-[10px] capitalize',
                session.user.role === 'admin'
                  ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
                  : session.user.role === 'trader'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300',
              )}>
                {session.user.role === 'admin' && <Crown className="h-2.5 w-2.5 mr-1" />}
                {session.user.role === 'trader' && <TrendingUp className="h-2.5 w-2.5 mr-1" />}
                {session.user.role === 'viewer' && <Eye className="h-2.5 w-2.5 mr-1" />}
                {session.user.role}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onNavigate('settings')}>
              <UserIcon className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onNavigate('settings')}>
              <Lock className="mr-2 h-4 w-4" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ redirect: false }).then(() => router.push('/login'))}
              className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  )
}
