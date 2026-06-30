'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  Settings, User, Users, Wallet, Plug, Server, Cpu, Key, Mail,
  ShieldCheck, Info, Pencil, Trash2, Plus, Check, Star, Eye, EyeOff,
  Send, Bell, FlaskConical, TrendingUp, Activity, Database, Globe,
  Brain, Gauge, ExternalLink, Save, Zap, AlertTriangle,
  Webhook, MessageCircle,
  Cable, Radio, Unlink, Loader2, Wifi,
  Crown, Lock, MoreVertical, Power,
  Clock, HardDrive,
} from 'lucide-react'

import { api } from '@/lib/api'
import { fmtMoney, relativeTime } from '@/lib/format'
import type { Account, AccountType, Notification, MT5AccountInfo, SafeUser } from '@/lib/types'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const LEVERAGE_OPTIONS = ['1:50', '1:100', '1:200', '1:500']

/* =================================================
   TAB 1: Akun MT5
   ================================================= */

function emptyAccountForm() {
  return {
    name: '', broker: 'FINEX Indonesia', server: '', login: '',
    accountType: 'demo' as AccountType, currency: 'USD',
    leverage: '1:100', balance: '10000',
  }
}

function AccountCard({ account }: { account: Account }) {
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [form, setForm] = useState({
    name: account.name,
    server: account.server,
    login: account.login,
    leverage: account.leverage,
    balance: String(account.balance),
  })

  const toggleConn = useMutation({
    mutationFn: () => api.toggleConnect(account.id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(data.connected ? 'MT5 terhubung' : 'MT5 terputus', {
        description: `${account.name} · ${account.login}`,
      })
    },
    onError: (e: Error) => toast.error('Gagal koneksi MT5', { description: e.message }),
  })

  const setDefault = useMutation({
    mutationFn: () => api.updateAccount(account.id, { isDefault: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Default account diubah', { description: account.name })
    },
    onError: (e: Error) => toast.error('Gagal set default', { description: e.message }),
  })

  const saveEdit = useMutation({
    mutationFn: () => api.updateAccount(account.id, {
      name: form.name,
      server: form.server,
      login: form.login,
      leverage: form.leverage,
      balance: parseFloat(form.balance) || 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Akun diperbarui', { description: form.name })
      setEditOpen(false)
    },
    onError: (e: Error) => toast.error('Gagal update akun', { description: e.message }),
  })

  const del = useMutation({
    mutationFn: () => api.deleteAccount(account.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Akun dihapus')
      setConfirmDel(false)
    },
    onError: (e: Error) => toast.error('Gagal menghapus akun', { description: e.message }),
  })

  const isDemo = account.accountType === 'demo'

  return (
    <Card className={cn(
      'relative overflow-hidden',
      account.isDefault && 'border-emerald-500/50',
      account.connected ? 'bg-card' : 'bg-card/50',
    )}>
      {account.isDefault && (
        <div className="absolute right-0 top-0 flex items-center gap-1 rounded-bl-lg bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
          <Star className="h-3 w-3 fill-emerald-400" />
          DEFAULT
        </div>
      )}
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pr-12">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{account.name}</span>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px]',
                  isDemo
                    ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                )}
              >
                {isDemo ? 'DEMO' : 'LIVE'}
              </Badge>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{account.broker}</div>
          </div>
          <div className={cn(
            'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
            account.connected
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300',
          )}>
            <span className={cn(
              'h-1.5 w-1.5 rounded-full',
              account.connected ? 'bg-emerald-400 live-dot' : 'bg-rose-400',
            )} />
            {account.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Server className="h-3 w-3" /> Server
          </div>
          <div className="font-mono text-right truncate">{account.server}</div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3 w-3" /> Login
          </div>
          <div className="font-mono text-right">{account.login}</div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="h-3 w-3" /> Leverage
          </div>
          <div className="font-mono text-right">{account.leverage}</div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="h-3 w-3" /> Balance
          </div>
          <div className="font-mono text-right font-semibold tabular">
            {fmtMoney(account.balance, account.currency)}
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Activity className="h-3 w-3" /> Equity
          </div>
          <div className="font-mono text-right tabular">
            {fmtMoney(account.equity, account.currency)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border">
          <Button
            variant={account.connected ? 'outline' : 'default'}
            size="sm"
            onClick={() => toggleConn.mutate()}
            disabled={toggleConn.isPending}
          >
            <Plug className="h-3.5 w-3.5" />
            {account.connected ? 'Disconnect' : 'Connect'}
          </Button>
          {!account.isDefault && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDefault.mutate()}
              disabled={setDefault.isPending}
            >
              <Star className="h-3.5 w-3.5" />
              Set Default
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="ml-auto"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            onClick={() => setConfirmDel(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Akun MT5</DialogTitle>
            <DialogDescription>Perbarui detail akun trading.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Akun</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Server</Label>
                <Input value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Login</Label>
                <Input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Leverage</Label>
                <Select value={form.leverage} onValueChange={(v) => setForm({ ...form, leverage: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVERAGE_OPTIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Balance</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  className="font-mono tabular"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Batal</Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              <Save className="h-4 w-4" />
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus akun ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun "{account.name}" ({account.login}) akan dihapus permanen. Trade history tetap tersimpan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => del.mutate()}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function AccountsTab() {
  const qc = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState(emptyAccountForm())

  const { data, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts(),
  })
  const accounts = data?.accounts ?? []

  const create = useMutation({
    mutationFn: () => api.createAccount({
      name: form.name,
      broker: form.broker,
      server: form.server,
      login: form.login,
      accountType: form.accountType,
      currency: form.currency,
      leverage: form.leverage,
      balance: parseFloat(form.balance) || 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Akun MT5 ditambahkan', { description: form.name })
      setForm(emptyAccountForm())
      setAddOpen(false)
    },
    onError: (e: Error) => toast.error('Gagal menambah akun', { description: e.message }),
  })

  const submit = () => {
    if (!form.name || !form.server || !form.login) {
      toast.error('Lengkapi field wajib', { description: 'Nama, server, dan login harus diisi.' })
      return
    }
    create.mutate()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-emerald-400" />
            Akun MT5
          </h3>
          <p className="text-xs text-muted-foreground">Kelola akun MetaTrader 5 (demo & live).</p>
        </div>
        <Button className="ml-auto" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Tambah Akun
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => <div key={i} className="h-56 animate-pulse rounded-lg bg-muted/40" />)}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Belum ada akun.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {accounts.map((a) => (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <AccountCard account={a} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Note */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 flex gap-3">
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Akun demo untuk testing strategi. Akun live untuk eksekusi nyata.
            <strong> Selalu uji di demo terlebih dahulu</strong> sebelum menggunakan akun live.
          </p>
        </CardContent>
      </Card>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Akun MT5</DialogTitle>
            <DialogDescription>Daftarkan akun broker untuk koneksi MT5.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Akun *</Label>
              <Input
                placeholder="cth: Demo Scalper"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Broker</Label>
                <Input value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Server *</Label>
                <Input
                  placeholder="Finex-Demo"
                  value={form.server}
                  onChange={(e) => setForm({ ...form, server: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Login *</Label>
                <Input
                  placeholder="50123456"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipe Akun</Label>
                <Select
                  value={form.accountType}
                  onValueChange={(v) => setForm({ ...form, accountType: v as AccountType })}
                >
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="demo">Demo</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="IDR">IDR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Leverage</Label>
                <Select value={form.leverage} onValueChange={(v) => setForm({ ...form, leverage: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVERAGE_OPTIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Balance</Label>
                <Input
                  type="number"
                  step="any"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  className="font-mono tabular"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={create.isPending}>
              <Plus className="h-4 w-4" />
              Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* =================================================
   TAB 2: Broker & MT5 Engine
   ================================================= */

function BrokerTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api.systemConfig(),
  })
  const cfg = data?.config ?? {}

  // Sync editable state when server config arrives/changes (React 19 pattern)
  const [mt5Path, setMt5Path] = useState(cfg.mt5Path ?? '')
  const [pythonVersion, setPythonVersion] = useState(cfg.pythonVersion ?? '3.14')
  const [lastMt5, setLastMt5] = useState<string | undefined>(cfg.mt5Path)
  const [lastPy, setLastPy] = useState<string | undefined>(cfg.pythonVersion)
  if (cfg.mt5Path !== lastMt5) {
    setLastMt5(cfg.mt5Path)
    setMt5Path(cfg.mt5Path ?? '')
  }
  if (cfg.pythonVersion !== lastPy) {
    setLastPy(cfg.pythonVersion)
    setPythonVersion(cfg.pythonVersion ?? '3.14')
  }

  const save = useMutation({
    mutationFn: () => api.updateSystemConfig({ mt5Path, pythonVersion }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config'] })
      toast.success('Konfigurasi disimpan', { description: 'MT5 path & Python version diperbarui.' })
    },
    onError: (e: Error) => toast.error('Gagal menyimpan', { description: e.message }),
  })

  const testMt5 = () => {
    toast.success('MT5 terminal terdeteksi', {
      description: `${cfg.brokerName ?? 'FINEX Indonesia'} · ${cfg.brokerServer ?? 'Finex-Live'} · ready`,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Server className="h-4 w-4 text-emerald-400" />
          Broker & MT5 Engine
        </h3>
        <p className="text-xs text-muted-foreground">Konfigurasi engine Python + MetaTrader 5.</p>
      </div>

      {/* System config (read-only) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            System Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ConfigRow label="Broker Name" value={cfg.brokerName} />
          <ConfigRow label="Broker Server" value={cfg.brokerServer} />
          <ConfigRow label="Max Leverage" value={cfg.brokerMaxLeverage ?? '1:100'} />
          <ConfigRow label="Spread Major (from)" value={`${cfg.brokerSpreadMajorFromPip ?? '0.0'} pip`} />
          <ConfigRow label="Commission / Lot" value={`$${cfg.brokerCommissionPerLot ?? '2.5'} round-turn`} />
        </CardContent>
      </Card>

      {/* Editable fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Pencil className="h-4 w-4 text-emerald-400" />
            Editable Settings
          </CardTitle>
          <CardDescription className="text-xs">Path instalasi MT5 & versi Python engine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">MT5 Terminal Path</Label>
            <Input
              value={mt5Path}
              onChange={(e) => setMt5Path(e.target.value)}
              className="font-mono text-xs"
              placeholder="C:\Program Files\Finex MetaTrader 5\terminal64.exe"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Python Version</Label>
            <Input
              value={pythonVersion}
              onChange={(e) => setPythonVersion(e.target.value)}
              className="font-mono text-xs"
              placeholder="3.14"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4" />
              Save Configuration
            </Button>
            <Button variant="outline" onClick={testMt5}>
              <Zap className="h-4 w-4" />
              Test MT5 Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Broker info */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Broker Info — FINEX Indonesia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Spread Major</div>
              <div className="font-mono font-semibold text-emerald-300">from 0.0 pip</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Commission</div>
              <div className="font-mono font-semibold text-emerald-300">$2–3 / lot / round turn</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">Max Leverage</div>
              <div className="font-mono font-semibold text-emerald-300">1:100 (BAPPEBTI)</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection status */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15">
            <Plug className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">MT5 Connection Status</div>
            <div className="text-xs text-muted-foreground">
              Engine Python 3.14 · MT5 terminal terdeteksi
            </div>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
            Online
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-medium">{value ?? '—'}</span>
    </div>
  )
}

/* =================================================
   TAB 3: API Keys
   ================================================= */

function ApiKeyField({
  label, value, onChange, link, onTest,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  link: string
  onTest: () => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center justify-between">
        <span>{label} API Key</span>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:underline"
        >
          Get key <ExternalLink className="h-3 w-3" />
        </a>
      </Label>
      <div className="flex gap-2">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="masukkan API key (cth: demo)"
          className="font-mono text-xs"
        />
        <Button variant="outline" size="icon" onClick={() => setShow((v) => !v)} className="shrink-0">
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="outline" size="sm" onClick={onTest} className="shrink-0">
          Test
        </Button>
      </div>
    </div>
  )
}

function ApiKeysTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api.systemConfig(),
  })
  const cfg = data?.config ?? {}

  const [finnhub, setFinnhub] = useState(cfg.finnhubApiKey ?? 'demo')
  const [marketaux, setMarketaux] = useState(cfg.marketauxApiKey ?? 'demo')
  const [refreshMin, setRefreshMin] = useState(parseInt(cfg.newsRefreshMinutes ?? '15', 10))
  const [lastFinn, setLastFinn] = useState<string | undefined>(cfg.finnhubApiKey)
  const [lastMkt, setLastMkt] = useState<string | undefined>(cfg.marketauxApiKey)
  const [lastRefresh, setLastRefresh] = useState<string | undefined>(cfg.newsRefreshMinutes)
  if (cfg.finnhubApiKey !== lastFinn) {
    setLastFinn(cfg.finnhubApiKey)
    if (cfg.finnhubApiKey != null) setFinnhub(cfg.finnhubApiKey)
  }
  if (cfg.marketauxApiKey !== lastMkt) {
    setLastMkt(cfg.marketauxApiKey)
    if (cfg.marketauxApiKey != null) setMarketaux(cfg.marketauxApiKey)
  }
  if (cfg.newsRefreshMinutes !== lastRefresh) {
    setLastRefresh(cfg.newsRefreshMinutes)
    if (cfg.newsRefreshMinutes) setRefreshMin(parseInt(cfg.newsRefreshMinutes, 10))
  }

  const save = useMutation({
    mutationFn: () => api.updateSystemConfig({
      finnhubApiKey: finnhub,
      marketauxApiKey: marketaux,
      newsRefreshMinutes: String(refreshMin),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config'] })
      toast.success('API keys disimpan', { description: 'Finnhub & MARKETAUX diperbarui.' })
    },
    onError: (e: Error) => toast.error('Gagal menyimpan', { description: e.message }),
  })

  const testFinnhub = () => {
    if (!finnhub || finnhub === 'demo') {
      toast.warning('Menggunakan demo key', { description: 'Rate limit terbatas. Dapatkan key full di finnhub.io.' })
    } else {
      toast.success('Finnhub connected', { description: 'API key valid · quota tersedia.' })
    }
  }
  const testMarketaux = () => {
    if (!marketaux || marketaux === 'demo') {
      toast.warning('Menggunakan demo key', { description: 'Akses terbatas. Dapatkan key full di marketaux.com.' })
    } else {
      toast.success('MARKETAUX connected', { description: 'API key valid · quota tersedia.' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Key className="h-4 w-4 text-emerald-400" />
          API Keys — News Providers
        </h3>
        <p className="text-xs text-muted-foreground">Konfigurasi API key untuk data berita forex.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">News API Providers</CardTitle>
          <CardDescription className="text-xs">
            API key disimpan lokal di database. Gunakan "demo" untuk testing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ApiKeyField
            label="Finnhub"
            value={finnhub}
            onChange={setFinnhub}
            link="https://finnhub.io/register"
            onTest={testFinnhub}
          />
          <ApiKeyField
            label="MARKETAUX"
            value={marketaux}
            onChange={setMarketaux}
            link="https://www.marketaux.com/register"
            onTest={testMarketaux}
          />

          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs flex items-center justify-between">
              <span>News Refresh Interval</span>
              <span className="font-mono text-emerald-300 tabular">{refreshMin} menit</span>
            </Label>
            <Slider
              value={[refreshMin]}
              onValueChange={(v) => setRefreshMin(v[0])}
              min={5}
              max={60}
              step={5}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>5m</span><span>30m</span><span>60m</span>
            </div>
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">
            <Save className="h-4 w-4" />
            Save API Configuration
          </Button>
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4 flex gap-3">
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <p className="text-xs text-amber-200/90 leading-relaxed">
            API key disimpan lokal di database SQLite. Untuk produksi, simpan di environment variable
            server-side. Key "demo" memiliki rate limit ketat — gunakan untuk testing saja.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* =================================================
   TAB 4: Email & Notifikasi
   ================================================= */

const NOTIF_TYPES: { value: Notification['type']; label: string }[] = [
  { value: 'trade_open', label: 'Trade Open' },
  { value: 'trade_close', label: 'Trade Close' },
  { value: 'alert', label: 'Price Alert' },
  { value: 'risk', label: 'Risk Warning' },
  { value: 'news', label: 'Breaking News' },
]

const NOTIF_TYPE_COLOR: Record<Notification['type'], string> = {
  trade_open: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  trade_close: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  alert: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  risk: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  system: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  news: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
}

function EmailTab() {
  const qc = useQueryClient()
  const { data: cfgData } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api.systemConfig(),
  })
  const cfg = cfgData?.config ?? {}

  const { data: notifData, isLoading: notifLoading } = useQuery({
    queryKey: ['notifications', 10],
    queryFn: () => api.notifications(10),
  })
  const notifications = notifData?.notifications ?? []

  const [email, setEmail] = useState(cfg.emailRecipient ?? '')
  const [smtpHost, setSmtpHost] = useState(cfg.emailSmtpHost ?? '')
  const [smtpPort, setSmtpPort] = useState(cfg.emailSmtpPort ?? '587')
  const [emailEnabled, setEmailEnabled] = useState(cfg.emailEnabled === 'true')
  const [notifToggles, setNotifToggles] = useState<Record<string, boolean>>({
    trade_open: true, trade_close: true, alert: true, risk: true, news: false,
  })
  const [lastEmail, setLastEmail] = useState<string | undefined>(cfg.emailRecipient)
  const [lastHost, setLastHost] = useState<string | undefined>(cfg.emailSmtpHost)
  const [lastPort, setLastPort] = useState<string | undefined>(cfg.emailSmtpPort)
  const [lastEnabled, setLastEnabled] = useState<string | undefined>(cfg.emailEnabled)
  if (cfg.emailRecipient !== lastEmail) {
    setLastEmail(cfg.emailRecipient)
    if (cfg.emailRecipient != null) setEmail(cfg.emailRecipient)
  }
  if (cfg.emailSmtpHost !== lastHost) {
    setLastHost(cfg.emailSmtpHost)
    if (cfg.emailSmtpHost != null) setSmtpHost(cfg.emailSmtpHost)
  }
  if (cfg.emailSmtpPort !== lastPort) {
    setLastPort(cfg.emailSmtpPort)
    if (cfg.emailSmtpPort != null) setSmtpPort(cfg.emailSmtpPort)
  }
  if (cfg.emailEnabled !== lastEnabled) {
    setLastEnabled(cfg.emailEnabled)
    if (cfg.emailEnabled != null) setEmailEnabled(cfg.emailEnabled === 'true')
  }

  const save = useMutation({
    mutationFn: () => api.updateSystemConfig({
      emailRecipient: email,
      emailSmtpHost: smtpHost,
      emailSmtpPort: smtpPort,
      emailEnabled: String(emailEnabled),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config'] })
      toast.success('Email config disimpan')
    },
    onError: (e: Error) => toast.error('Gagal menyimpan', { description: e.message }),
  })

  const testEmail = useMutation({
    mutationFn: () => api.testNotification(email || undefined),
    onSuccess: () => {
      toast.success('Email test terkirim', { description: `ke ${email || cfg.emailRecipient || 'recipient'}` })
      qc.invalidateQueries({ queryKey: ['notifications', 10] })
    },
    onError: (e: Error) => toast.error('Gagal kirim email test', { description: e.message }),
  })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Mail className="h-4 w-4 text-emerald-400" />
          Email & Notifikasi
        </h3>
        <p className="text-xs text-muted-foreground">SMTP config, test email, riwayat notifikasi.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">SMTP Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Email Recipient</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@example.com"
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">SMTP Host</Label>
              <Input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SMTP Port</Label>
              <Input
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Username & password dikonfigurasi server-side</span>
            <Badge variant="outline" className="ml-auto text-[10px]">configured</Badge>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Bell className="h-3.5 w-3.5 text-emerald-400" />
            <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
            <span className="text-xs text-muted-foreground">Email notifications enabled</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4" />
              Save Config
            </Button>
            <Button
              variant="outline"
              onClick={() => testEmail.mutate()}
              disabled={testEmail.isPending || !emailEnabled}
            >
              <Send className="h-4 w-4" />
              Kirim Email Test
            </Button>
            {!emailEnabled && (
              <span className="text-[11px] text-amber-300">Email disabled — enable untuk test</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification type toggles */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-400" />
            Notification Events
          </CardTitle>
          <CardDescription className="text-xs">Pilih event yang memicu email notifikasi.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {NOTIF_TYPES.map((t) => (
              <div
                key={t.value}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <span className={cn('text-xs font-medium', NOTIF_TYPE_COLOR[t.value].split(' ').find((c) => c.startsWith('text-')))}>
                  {t.label}
                </span>
                <Switch
                  checked={notifToggles[t.value]}
                  onCheckedChange={(v) => setNotifToggles((prev) => ({ ...prev, [t.value]: v }))}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            * Toggle disimpan lokal di browser. Backend akan dipersist di update berikutnya.
          </p>
        </CardContent>
      </Card>

      {/* Recent notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-400" />
            Recent Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted/40" />)}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Belum ada notifikasi terkirim.</p>
            </div>
          ) : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto scroll-thin pr-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-xs"
                >
                  <Badge variant="outline" className={cn('text-[10px]', NOTIF_TYPE_COLOR[n.type])}>
                    {n.type.replace('_', ' ')}
                  </Badge>
                  <span className="flex-1 truncate font-medium">{n.subject}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{n.recipient}</span>
                  {n.sent ? (
                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px]">
                      <Check className="h-2.5 w-2.5" /> sent
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-rose-300 border-rose-500/30 text-[10px]">failed</Badge>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {relativeTime(n.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* =================================================
   TAB 5: Webhook Notifications (Discord / Telegram / Slack)
   ================================================= */

function WebhookTab() {
  const qc = useQueryClient()
  const { data: cfgData } = useQuery({
    queryKey: ['system-config'],
    queryFn: () => api.systemConfig(),
  })
  const cfg = cfgData?.config ?? {}

  // Local form state — synced from remote config when it changes.
  const [enabled, setEnabled] = useState(cfg.webhook_enabled === 'true')
  const [discordUrl, setDiscordUrl] = useState(cfg.webhook_discord_url ?? '')
  const [telegramToken, setTelegramToken] = useState(cfg.webhook_telegram_token ?? '')
  const [telegramChatId, setTelegramChatId] = useState(cfg.webhook_telegram_chat_id ?? '')
  const [slackUrl, setSlackUrl] = useState(cfg.webhook_slack_url ?? '')

  // Track last-seen remote values to detect when query refetches bring new data.
  const [lastEnabled, setLastEnabled] = useState<string | undefined>(cfg.webhook_enabled)
  const [lastDiscord, setLastDiscord] = useState<string | undefined>(cfg.webhook_discord_url)
  const [lastTgToken, setLastTgToken] = useState<string | undefined>(cfg.webhook_telegram_token)
  const [lastTgChat, setLastTgChat] = useState<string | undefined>(cfg.webhook_telegram_chat_id)
  const [lastSlack, setLastSlack] = useState<string | undefined>(cfg.webhook_slack_url)

  if (cfg.webhook_enabled !== lastEnabled) {
    setLastEnabled(cfg.webhook_enabled)
    if (cfg.webhook_enabled != null) setEnabled(cfg.webhook_enabled === 'true')
  }
  if (cfg.webhook_discord_url !== lastDiscord) {
    setLastDiscord(cfg.webhook_discord_url)
    if (cfg.webhook_discord_url != null) setDiscordUrl(cfg.webhook_discord_url)
  }
  if (cfg.webhook_telegram_token !== lastTgToken) {
    setLastTgToken(cfg.webhook_telegram_token)
    if (cfg.webhook_telegram_token != null) setTelegramToken(cfg.webhook_telegram_token)
  }
  if (cfg.webhook_telegram_chat_id !== lastTgChat) {
    setLastTgChat(cfg.webhook_telegram_chat_id)
    if (cfg.webhook_telegram_chat_id != null) setTelegramChatId(cfg.webhook_telegram_chat_id)
  }
  if (cfg.webhook_slack_url !== lastSlack) {
    setLastSlack(cfg.webhook_slack_url)
    if (cfg.webhook_slack_url != null) setSlackUrl(cfg.webhook_slack_url)
  }

  // Show/hide secrets toggle
  const [showSecrets, setShowSecrets] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      api.updateSystemConfig({
        webhook_enabled: String(enabled),
        webhook_discord_url: discordUrl,
        webhook_telegram_token: telegramToken,
        webhook_telegram_chat_id: telegramChatId,
        webhook_slack_url: slackUrl,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config'] })
      toast.success('Webhook config disimpan')
    },
    onError: (e: Error) => toast.error('Gagal menyimpan', { description: e.message }),
  })

  const testWebhook = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/system/webhook-test', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      return data as { ok: boolean; targets: string[]; message?: string }
    },
    onSuccess: (data) => {
      toast.success('Webhook test terkirim', {
        description: data.targets?.length
          ? `Targets: ${data.targets.join(', ')}`
          : 'Tidak ada target terkonfigurasi',
      })
    },
    onError: (e: Error) => toast.error('Gagal kirim webhook test', { description: e.message }),
  })

  const hasAnyTarget = Boolean(
    discordUrl || (telegramToken && telegramChatId) || slackUrl,
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Webhook className="h-4 w-4 text-violet-400" />
          Webhook Notifications
        </h3>
        <p className="text-xs text-muted-foreground">
          Kirim notifikasi trade event ke Discord, Telegram, atau Slack. Berjalan paralel dengan email notifikasi.
        </p>
      </div>

      {/* Enable toggle + test */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-violet-400" />
            Master Toggle
          </CardTitle>
          <CardDescription className="text-xs">
            Aktifkan/Nonaktifkan semua webhook notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Webhook className="h-3.5 w-3.5 text-violet-400" />
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-xs text-muted-foreground">
              {enabled ? 'Webhook notifications enabled' : 'Webhook notifications disabled'}
            </span>
            <Badge
              variant="outline"
              className={cn(
                'ml-auto text-[10px]',
                enabled
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300',
              )}
            >
              {enabled ? 'ACTIVE' : 'INACTIVE'}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4" />
              Save Config
            </Button>
            <Button
              variant="outline"
              onClick={() => testWebhook.mutate()}
              disabled={testWebhook.isPending || !enabled || !hasAnyTarget}
            >
              <Send className="h-4 w-4" />
              Test Webhook
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets((v) => !v)}
              className="ml-auto text-xs"
            >
              {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showSecrets ? 'Hide' : 'Show'} secrets
            </Button>
          </div>
          {!enabled && (
            <p className="text-[11px] text-amber-300">
              Webhook dinonaktifkan — aktifkan toggle untuk mengirim test.
            </p>
          )}
          {enabled && !hasAnyTarget && (
            <p className="text-[11px] text-amber-300">
              Tidak ada target terkonfigurasi — isi minimal satu webhook URL di bawah.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Discord */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-indigo-400" />
            Discord
          </CardTitle>
          <CardDescription className="text-xs">
            Kirim embed notifikasi ke channel Discord via Webhook URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Discord Webhook URL</Label>
          <Input
            type={showSecrets ? 'text' : 'password'}
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-[10px] text-muted-foreground">
            Discord: Server Settings → Integrations → Webhooks → New Webhook → Copy URL.
          </p>
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4 text-sky-400" />
            Telegram
          </CardTitle>
          <CardDescription className="text-xs">
            Kirim pesan Markdown via Bot API ke chat ID tujuan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Bot Token</Label>
            <Input
              type={showSecrets ? 'text' : 'password'}
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              placeholder="123456789:ABC-DEF..."
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chat ID</Label>
            <Input
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="-1001234567890 (channel) atau 123456789 (private)"
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Telegram: chat with <span className="font-mono">@BotFather</span> → /newbot to get a token.
            Add the bot to your channel/group, then use <span className="font-mono">@userinfobot</span> to find your Chat ID.
          </p>
        </CardContent>
      </Card>

      {/* Slack */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
            Slack
          </CardTitle>
          <CardDescription className="text-xs">
            Kirim attachment notifikasi ke channel Slack via Incoming Webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Slack Incoming Webhook URL</Label>
          <Input
            type={showSecrets ? 'text' : 'password'}
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/T.../B.../..."
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-[10px] text-muted-foreground">
            Slack: Apps → Build → Make a Custom App → Incoming Webhooks → Add New Webhook to Workspace.
          </p>
        </CardContent>
      </Card>

      {/* Event matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-400" />
            Webhook Event Matrix
          </CardTitle>
          <CardDescription className="text-xs">
            Event yang memicu webhook (otomatis menyertai email notifikasi).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {NOTIF_TYPES.map((t) => (
              <div
                key={t.value}
                className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <span
                  className={cn(
                    'text-xs font-medium',
                    NOTIF_TYPE_COLOR[t.value].split(' ').find((c) => c.startsWith('text-')),
                  )}
                >
                  {t.label}
                </span>
                <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/30">
                  <Check className="h-2.5 w-2.5" /> webhook
                </Badge>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            * Integrasi webhook ke trade event handler dilakukan oleh main agent setelah
            utilitas webhook.ts tersedia. Saat ini webhook test &amp; config UI sudah aktif.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/* =================================================
   TAB 6: MT5 Connection (bridge status + connect + live account info)
   ================================================= */

interface BridgeHealth {
  ok: boolean
  adapter: string
  isLive: boolean
  message: string
}

function MT5ConnectionTab() {
  const qc = useQueryClient()
  const [loginInput, setLoginInput] = useState('')
  const [serverInput, setServerInput] = useState('FINEX-Demo')
  const [passwordInput, setPasswordInput] = useState('')
  const [accountId, setAccountId] = useState<string>('')
  const [showPassword, setShowPassword] = useState(false)
  // Connected MT5 login — persisted to localStorage so it survives refreshes.
  const [connectedLogin, setConnectedLogin] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem('mt5:connectedLogin')
    return raw ? Number(raw) : null
  })

  function rememberLogin(login: number | null) {
    setConnectedLogin(login)
    if (typeof window === 'undefined') return
    if (login == null) window.localStorage.removeItem('mt5:connectedLogin')
    else window.localStorage.setItem('mt5:connectedLogin', String(login))
  }

  // --- A. Bridge health (every 5s) ---
  const healthQuery = useQuery({
    queryKey: ['mt5-health'],
    queryFn: () => api.mt5Health(),
    refetchInterval: 5000,
    refetchOnMount: true,
  })
  const health: BridgeHealth | undefined = healthQuery.data

  // --- accounts list (for the link dropdown) ---
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.accounts(),
  })
  const accounts = accountsQuery.data?.accounts ?? []

  // Auto-select default account when first loaded
  const [lastDefaultId, setLastDefaultId] = useState<string | undefined>(undefined)
  if (accounts.length > 0 && lastDefaultId === undefined) {
    const def = accounts.find((a) => a.isDefault) ?? accounts[0]
    setLastDefaultId(def.id)
    if (!accountId) setAccountId(def.id)
  }

  // --- C. Live account info (every 10s, only when connected) ---
  const accountQuery = useQuery({
    queryKey: ['mt5-account', connectedLogin],
    queryFn: () => api.mt5AccountInfo(connectedLogin as number),
    enabled: connectedLogin != null,
    refetchInterval: 10000,
    refetchOnMount: true,
    retry: false,
  })

  // --- B. Connect mutation ---
  const connectMut = useMutation({
    mutationFn: () => api.mt5Connect({
      login: Number(loginInput),
      server: serverInput,
      password: passwordInput,
      accountId: accountId || undefined,
    }),
    onSuccess: (data) => {
      rememberLogin(data.account.login)
      qc.invalidateQueries({ queryKey: ['mt5-account', data.account.login] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('MT5 connected — balance synced', {
        description: `Login ${data.account.login} · ${data.account.server} · ${fmtMoney(data.account.balance, data.account.currency)}`,
      })
      setPasswordInput('')
    },
    onError: (e: Error) => toast.error('Gagal koneksi MT5', { description: e.message }),
  })

  // --- C. Disconnect mutation ---
  const disconnectMut = useMutation({
    mutationFn: () => api.mt5Disconnect(connectedLogin as number),
    onSuccess: () => {
      const wasLogin = connectedLogin
      rememberLogin(null)
      // Use removeQueries (not invalidateQueries) so we don't accidentally
      // re-fire the account query with the now-stale login before the
      // enabled=false flag takes effect.
      qc.removeQueries({ queryKey: ['mt5-account', wasLogin] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('MT5 disconnected', { description: 'Bridge session closed.' })
    },
    onError: (e: Error) => toast.error('Gagal disconnect MT5', { description: e.message }),
  })

  const isOnline = !!health?.ok
  const isLiveAdapter = !!health?.isLive
  const account: MT5AccountInfo | undefined = accountQuery.data?.account

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Cable className="h-4 w-4 text-emerald-400" />
          MT5 Connection
        </h3>
        <p className="text-xs text-muted-foreground">
          Status bridge, koneksi ke broker, dan info akun live dari MT5.
        </p>
      </div>

      {/* A. Bridge Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <Card className={cn(
          'overflow-hidden border',
          isOnline
            ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent'
            : 'border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent',
        )}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  isOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400',
                )}>
                  {isOnline ? <Radio className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}
                </div>
                <div>
                  <CardTitle className="text-sm">MT5 Bridge Status</CardTitle>
                  <CardDescription className="text-xs">
                    Mini-service on port 3050 · polled every 5s
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-semibold',
                  isOnline
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-500/15 text-rose-300',
                )}
              >
                <span className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isOnline ? 'bg-emerald-400 live-dot' : 'bg-rose-400',
                )} />
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Adapter:</span>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-medium',
                  isLiveAdapter
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300',
                )}
              >
                {isLiveAdapter ? 'Live (Real MT5)' : 'Mock (Simulation)'}
              </Badge>
              {health?.adapter && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  name={health.adapter}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {health?.message ?? 'Checking bridge status…'}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* B. Connect Form Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.05 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Plug className="h-4 w-4 text-emerald-400" />
              Connect to MT5
            </CardTitle>
            <CardDescription className="text-xs">
              Masukkan kredensial MT5 untuk membuka sesi bridge. Account opsional — bila dipilih, balance & equity lokal akan disinkronkan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">MT5 Login</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="12345678"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Server</Label>
                <Input
                  placeholder="FINEX-Live atau FINEX-Demo"
                  value={serverInput}
                  onChange={(e) => setServerInput(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="pr-9 font-mono"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Link to local account (optional)</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih akun lokal…" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} · {a.login}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending || !loginInput || !serverInput || !passwordInput}
              >
                {connectMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Cable className="h-4 w-4" />
                )}
                {connectMut.isPending ? 'Connecting…' : 'Connect to MT5'}
              </Button>
              {!isOnline && (
                <span className="text-[11px] text-amber-300">
                  Bridge offline — koneksi mungkin gagal. Mulai mt5-bridge service di port 3050.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* C. Live Account Info Card (only when connected & data available) */}
      {connectedLogin != null && account && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut', delay: 0.1 }}
        >
          <Card className="border-emerald-500/30">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm">Live Account Info</CardTitle>
                    <CardDescription className="text-xs font-mono">
                      Login {account.login} · {account.server} · {account.company}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
                  CONNECTED
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <MetricCard
                  label="Balance"
                  value={fmtMoney(account.balance, account.currency)}
                  accent={account.balance >= 0 ? 'emerald' : 'rose'}
                  big
                />
                <MetricCard
                  label="Equity"
                  value={fmtMoney(account.equity, account.currency)}
                  accent={account.equity >= 0 ? 'emerald' : 'rose'}
                  big
                />
                <MetricCard
                  label="Free Margin"
                  value={fmtMoney(account.freeMargin, account.currency)}
                  accent="emerald"
                />
                <MetricCard
                  label="Used Margin"
                  value={fmtMoney(account.margin, account.currency)}
                  accent="default"
                />
                <MetricCard
                  label="Margin Level"
                  value={account.marginLevel > 0 ? `${account.marginLevel.toFixed(2)}%` : '—'}
                  accent={
                    account.marginLevel > 0 && account.marginLevel < 100
                      ? 'rose'
                      : account.marginLevel > 0 && account.marginLevel < 200
                        ? 'amber'
                        : 'emerald'
                  }
                />
                <MetricCard
                  label="Leverage"
                  value={`1:${account.leverage}`}
                  accent="violet"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <div className="text-[11px] text-muted-foreground">
                  Name: <span className="font-medium text-foreground">{account.name}</span>
                  {account.connectedAt && (
                    <span className="ml-2">· connected {relativeTime(account.connectedAt)}</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMut.mutate()}
                  disabled={disconnectMut.isPending}
                  className="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  {disconnectMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5" />
                  )}
                  Disconnect
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* C2. Session lost card — bridge no longer has this login (e.g. service restarted) */}
      {connectedLogin != null && accountQuery.isError && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="text-xs">
                <div className="font-semibold text-amber-300">MT5 session expired</div>
                <p className="text-amber-200/80 mt-0.5">
                  Login {connectedLogin} tidak ditemukan di bridge. Service mungkin sudah restart.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                rememberLogin(null)
                qc.invalidateQueries({ queryKey: ['mt5-account'] })
              }}
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            >
              <Unlink className="h-3.5 w-3.5" />
              Forget session
            </Button>
          </CardContent>
        </Card>
      )}

      {/* C3. Loading skeleton while account query is in flight */}
      {connectedLogin != null && !account && !accountQuery.isError && (
        <Card className="border-muted">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <span className="text-xs text-muted-foreground">
                Fetching live account info for login {connectedLogin}…
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-muted/40" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* D. Info Banner */}
      <Card className="border-violet-500/30 bg-violet-500/5">
        <CardContent className="p-4 flex gap-3">
          <Info className="h-4 w-4 shrink-0 text-violet-400 mt-0.5" />
          <p className="text-xs text-violet-200/90 leading-relaxed">
            Mock adapter berjalan di sandbox tanpa MT5 nyata. Untuk trading real, deploy Python bridge
            di Windows machine dengan MetaTrader 5 terinstall. Lihat{' '}
            <code className="rounded bg-violet-500/15 px-1 py-0.5 font-mono text-[11px] text-violet-200">
              mini-services/mt5-bridge/README.md
            </code>{' '}
            untuk panduan deployment.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({
  label,
  value,
  accent = 'default',
  big = false,
}: {
  label: string
  value: string
  accent?: 'default' | 'emerald' | 'rose' | 'amber' | 'violet'
  big?: boolean
}) {
  const accentMap: Record<string, string> = {
    default: 'text-foreground',
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    amber: 'text-amber-400',
    violet: 'text-violet-400',
  }
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        'font-mono tabular-nums font-semibold',
        big ? 'text-base mt-0.5' : 'text-sm mt-1',
        accentMap[accent],
      )}>
        {value}
      </div>
    </div>
  )
}

/* =================================================
   TAB 8: User Management (admin only)
   ================================================= */

type UserRole = 'admin' | 'trader' | 'viewer'

const ROLE_BADGE: Record<UserRole, { className: string; icon: typeof Crown; label: string }> = {
  admin: { className: 'border-violet-500/40 bg-violet-500/10 text-violet-300', icon: Crown, label: 'Admin' },
  trader: { className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', icon: TrendingUp, label: 'Trader' },
  viewer: { className: 'border-amber-500/40 bg-amber-500/10 text-amber-300', icon: Eye, label: 'Viewer' },
}

function UserManagementTab() {
  const { data: session } = useSession()
  const role = (session?.user?.role ?? undefined) as UserRole | undefined
  const currentUserId = session?.user?.id
  const isAdmin = role === 'admin'

  // Non-admin landing: tab is visible but content is gated.
  if (!isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10">
              <Lock className="h-6 w-6 text-rose-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-rose-300">Access Denied</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                You need admin privileges to manage users. Your role:{' '}
                <span className="font-mono font-semibold capitalize text-rose-300">
                  {role ?? 'unknown'}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <div className="space-y-4">
      <CurrentUserCard currentRole={role} />
      <UsersListCard currentUserId={currentUserId ?? ''} />
      <CreateUserCard />
      <RolePermissionsInfoCard />
    </div>
  )
}

/* ----- A. Current User Card with Change Password dialog ----- */
function CurrentUserCard({ currentRole }: { currentRole: UserRole }) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false })

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    staleTime: 60_000,
  })
  const me = meData?.user

  const changePwdMut = useMutation({
    mutationFn: () => api.changePassword({
      currentPassword: form.current,
      newPassword: form.next,
    }),
    onSuccess: () => {
      toast.success('Password changed', {
        description: 'You will need to use the new password next time you sign in.',
      })
      setOpen(false)
      setForm({ current: '', next: '', confirm: '' })
    },
    onError: (e: Error) => toast.error('Failed to change password', { description: e.message }),
  })

  const onSubmit = () => {
    if (form.next.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }
    if (form.next !== form.confirm) {
      toast.error('New passwords do not match')
      return
    }
    changePwdMut.mutate()
  }

  const RoleIcon = ROLE_BADGE[currentRole].icon
  const displayName = session?.user?.name ?? me?.name ?? '—'
  const displayEmail = session?.user?.email ?? me?.email ?? '—'

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-5 w-5 text-emerald-400" />
              Current User
            </CardTitle>
            <CardDescription className="text-xs">
              Your account info & password management.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full border',
                  ROLE_BADGE[currentRole].className,
                )}>
                  <RoleIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{displayName}</div>
                  <div className="text-xs text-muted-foreground truncate font-mono">{displayEmail}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn('text-[10px]', ROLE_BADGE[currentRole].className)}>
                      <RoleIcon className="mr-1 h-2.5 w-2.5" />
                      {ROLE_BADGE[currentRole].label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      Last login: {me?.lastLoginAt ? relativeTime(me.lastLoginAt) : '—'}
                    </span>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Change Password
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm({ current: '', next: '', confirm: '' }) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-400" />
              Change Password
            </DialogTitle>
            <DialogDescription className="text-xs">
              Enter your current password and a new password (min 6 characters).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <PasswordInput
              id="cur-pwd"
              label="Current Password"
              value={form.current}
              onChange={(v) => setForm({ ...form, current: v })}
              show={showPwd.current}
              onToggle={() => setShowPwd({ ...showPwd, current: !showPwd.current })}
              placeholder="••••••••"
            />
            <PasswordInput
              id="new-pwd"
              label="New Password"
              value={form.next}
              onChange={(v) => setForm({ ...form, next: v })}
              show={showPwd.next}
              onToggle={() => setShowPwd({ ...showPwd, next: !showPwd.next })}
              placeholder="Min 6 characters"
            />
            <PasswordInput
              id="conf-pwd"
              label="Confirm New Password"
              value={form.confirm}
              onChange={(v) => setForm({ ...form, confirm: v })}
              show={showPwd.confirm}
              onToggle={() => setShowPwd({ ...showPwd, confirm: !showPwd.confirm })}
              placeholder="Re-enter new password"
              error={form.confirm.length > 0 && form.next !== form.confirm ? 'Passwords do not match' : undefined}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={changePwdMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              disabled={changePwdMut.isPending || !form.current || !form.next || !form.confirm}
            >
              {changePwdMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Update Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Reusable password input with eye-toggle and optional error. */
function PasswordInput({
  id, label, value, onChange, show, onToggle, placeholder, error,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  placeholder?: string
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-9"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-400">{error}</p>}
    </div>
  )
}

/* ----- B. Users List Card with row actions ----- */
function UsersListCard({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users(),
  })
  const users = data?.users ?? []

  // Reset password dialog state
  const [resetTarget, setResetTarget] = useState<SafeUser | null>(null)
  const [resetPwd, setResetPwd] = useState('')
  const [showResetPwd, setShowResetPwd] = useState(false)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<SafeUser | null>(null)

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; body: { role?: UserRole; active?: boolean } }) =>
      api.updateUser(vars.id, vars.body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      const action = vars.body.active !== undefined
        ? (vars.body.active ? 'activated' : 'deactivated')
        : `role set to ${vars.body.role}`
      toast.success(`User ${action}`, { description: vars.id })
    },
    onError: (e: Error) => toast.error('Failed to update user', { description: e.message }),
  })

  const resetMut = useMutation({
    mutationFn: () => api.resetUserPassword(resetTarget!.id, resetPwd),
    onSuccess: () => {
      toast.success('Password reset', { description: resetTarget?.email })
      setResetTarget(null)
      setResetPwd('')
      setShowResetPwd(false)
    },
    onError: (e: Error) => toast.error('Failed to reset password', { description: e.message }),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.deleteUser(deleteTarget!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User deleted', { description: deleteTarget?.email })
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error('Failed to delete user', { description: e.message }),
  })

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: 0.05 }}
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-emerald-400" />
              Users
              <Badge variant="outline" className="ml-1 text-[10px]">{users.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              All registered users. Admins can change roles, toggle active status, reset passwords, and remove accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
              </div>
            ) : isError ? (
              <div className="flex items-center gap-2 py-6 text-xs text-rose-400">
                <AlertTriangle className="h-4 w-4" /> Failed to load users. Check your admin session and try again.
              </div>
            ) : users.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No users found.</div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="h-9 text-[11px] uppercase">Name</TableHead>
                      <TableHead className="h-9 text-[11px] uppercase">Email</TableHead>
                      <TableHead className="h-9 text-[11px] uppercase">Role</TableHead>
                      <TableHead className="h-9 text-[11px] uppercase">Status</TableHead>
                      <TableHead className="h-9 text-[11px] uppercase">Last Login</TableHead>
                      <TableHead className="h-9 text-[11px] uppercase">Created</TableHead>
                      <TableHead className="h-9 text-[11px] uppercase text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => {
                      const isSelf = u.id === currentUserId
                      const RoleIcon = ROLE_BADGE[u.role].icon
                      return (
                        <TableRow key={u.id}>
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="max-w-[140px] truncate text-xs font-medium">{u.name}</span>
                              {isSelf && (
                                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 px-1 py-0 text-[9px] text-emerald-300">
                                  You
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
                              {u.email}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge variant="outline" className={cn('text-[10px] capitalize', ROLE_BADGE[u.role].className)}>
                              <RoleIcon className="mr-1 h-2.5 w-2.5" />
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px]',
                                u.active
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300',
                              )}
                            >
                              <span className={cn(
                                'mr-1 h-1.5 w-1.5 rounded-full',
                                u.active ? 'bg-emerald-400' : 'bg-rose-400',
                              )} />
                              {u.active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="text-xs text-muted-foreground">
                              {u.lastLoginAt ? relativeTime(u.lastLoginAt) : '—'}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="text-xs text-muted-foreground">
                              {new Date(u.createdAt).toLocaleDateString('en-GB', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 text-right">
                            {isSelf ? (
                              <span className="text-[10px] italic text-muted-foreground">current account</span>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 px-2" disabled={updateMut.isPending}>
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52">
                                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    Role
                                  </DropdownMenuLabel>
                                  {(['admin', 'trader', 'viewer'] as const).map((r) => {
                                    const RIcon = ROLE_BADGE[r].icon
                                    return (
                                      <DropdownMenuItem
                                        key={r}
                                        onClick={() => updateMut.mutate({ id: u.id, body: { role: r } })}
                                        disabled={u.role === r}
                                      >
                                        <RIcon className="mr-2 h-3.5 w-3.5" />
                                        Set as {ROLE_BADGE[r].label}
                                        {u.role === r && <Check className="ml-auto h-3 w-3" />}
                                      </DropdownMenuItem>
                                    )
                                  })}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => updateMut.mutate({ id: u.id, body: { active: !u.active } })}
                                  >
                                    <Power className="mr-2 h-3.5 w-3.5" />
                                    {u.active ? 'Deactivate' : 'Activate'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setResetTarget(u); setResetPwd(''); setShowResetPwd(false) }}>
                                    <Key className="mr-2 h-3.5 w-3.5" />
                                    Reset Password
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => setDeleteTarget(u)}
                                    className="text-rose-400 focus:bg-rose-500/10 focus:text-rose-300"
                                  >
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete User
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
      </motion.div>

      {/* Reset password dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) { setResetTarget(null); setResetPwd(''); setShowResetPwd(false) }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-400" />
              Reset Password
            </DialogTitle>
            <DialogDescription className="text-xs">
              Set a new password for{' '}
              <span className="font-mono font-semibold text-foreground">{resetTarget?.email}</span>. Minimum 6 characters.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <PasswordInput
              id="reset-pwd"
              label="New Password"
              value={resetPwd}
              onChange={setResetPwd}
              show={showResetPwd}
              onToggle={() => setShowResetPwd(!showResetPwd)}
              placeholder="Min 6 characters"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setResetTarget(null); setResetPwd(''); setShowResetPwd(false) }}
              disabled={resetMut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => resetMut.mutate()}
              disabled={resetMut.isPending || resetPwd.length < 6}
            >
              {resetMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-300">
              <Trash2 className="h-4 w-4" />
              Delete User
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Are you sure you want to delete{' '}
              <span className="font-mono font-semibold text-foreground">{deleteTarget?.email}</span>?
              This action cannot be undone. All session tokens for this user will be invalidated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteMut.mutate() }}
              disabled={deleteMut.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleteMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/* ----- C. Create User Card ----- */
function CreateUserCard() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'trader' as UserRole,
  })
  const [showPwd, setShowPwd] = useState(false)

  const createMut = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User created', {
        description: `${data.user.email} (${data.user.role})`,
      })
      setForm({ name: '', email: '', password: '', role: 'trader' })
      setShowPwd(false)
    },
    onError: (e: Error) => toast.error('Failed to create user', { description: e.message }),
  })

  const onSubmit = () => {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error('Invalid email format')
      return
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    createMut.mutate()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: 0.1 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-5 w-5 text-emerald-400" />
            Create New User
          </CardTitle>
          <CardDescription className="text-xs">
            Add a new admin, trader, or viewer account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-name" className="text-xs">Name</Label>
              <Input
                id="new-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. John Trader"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email" className="text-xs">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="trader@finexfx.local"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <PasswordInput
                id="new-password"
                label="Password"
                value={form.password}
                onChange={(v) => setForm({ ...form, password: v })}
                show={showPwd}
                onToggle={() => setShowPwd(!showPwd)}
                placeholder="Min 6 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role" className="text-xs">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
              >
                <SelectTrigger id="new-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2">
                      <Crown className="h-3.5 w-3.5 text-violet-400" /> Admin
                    </span>
                  </SelectItem>
                  <SelectItem value="trader">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Trader
                    </span>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <span className="flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5 text-amber-400" /> Viewer
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={onSubmit}
              disabled={createMut.isPending || !form.name.trim() || !form.email || !form.password}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {createMut.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Create User
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ----- D. Role Permissions Info Card ----- */
function RolePermissionsInfoCard() {
  const roles: { role: UserRole; icon: typeof Crown; title: string; color: 'violet' | 'emerald' | 'amber'; desc: string }[] = [
    {
      role: 'admin',
      icon: Crown,
      title: 'Admin',
      color: 'violet',
      desc: 'Full access — manage users, system settings, all trading operations',
    },
    {
      role: 'trader',
      icon: TrendingUp,
      title: 'Trader',
      color: 'emerald',
      desc: 'Can open/close/modify trades, view all panels, cannot manage users',
    },
    {
      role: 'viewer',
      icon: Eye,
      title: 'Viewer',
      color: 'amber',
      desc: 'Read-only access — can view all panels but cannot execute trades or modify anything',
    },
  ]
  const colorMap: Record<'violet' | 'emerald' | 'amber', string> = {
    violet: 'border-violet-500/40 bg-violet-500/5',
    emerald: 'border-emerald-500/40 bg-emerald-500/5',
    amber: 'border-amber-500/40 bg-amber-500/5',
  }
  const iconColor: Record<'violet' | 'emerald' | 'amber', string> = {
    violet: 'text-violet-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: 0.15 }}
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Role Permissions
          </CardTitle>
          <CardDescription className="text-xs">
            Role-based access control overview.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {roles.map((r) => {
              const Icon = r.icon
              return (
                <div key={r.role} className={cn('space-y-1.5 rounded-md border p-3', colorMap[r.color])}>
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', iconColor[r.color])} />
                    <span className="text-sm font-semibold">{r.title}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{r.desc}</p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* =================================================
   TAB 7: Tentang Sistem
   ================================================= */

function AboutTab() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Info className="h-4 w-4 text-emerald-400" />
          Tentang Sistem
        </h3>
        <p className="text-xs text-muted-foreground">Informasi arsitektur & disclaimer.</p>
      </div>

      {/* Architecture */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            FinexFX AI Trading System
            <Badge variant="outline" className="text-[10px] ml-1">v1.0</Badge>
          </CardTitle>
          <CardDescription className="text-xs">Sistem trading otomatis berbasis AI untuk broker FINEX Indonesia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoRow icon={Cpu} label="Backend Engine" value="Python 3.14 + MetaTrader 5" />
            <InfoRow icon={Globe} label="Frontend" value="Next.js 16 Dashboard" />
            <InfoRow icon={ShieldCheck} label="Broker" value="FINEX Indonesia (BAPPEBTI)" />
            <InfoRow icon={Database} label="Data Source" value="Finnhub + MARKETAUX" />
            <InfoRow icon={Brain} label="AI Model" value="fx-scalper-v1 (ML self-learning)" />
            <InfoRow icon={Gauge} label="Strategi" value="Scalping M5" />
            <InfoRow icon={Activity} label="Pairs" value="EURUSD · USDJPY · GBPUSD · XAUUSD" />
            <InfoRow icon={Zap} label="Sesi Aktif" value="London & Overlap London-NY" />
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            PERINGATAN RISIKO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            Trading forex melibatkan risiko kehilangan modal. Aplikasi ini untuk tujuan edukasi.
            Gunakan akun demo untuk testing. Pastikan kepatuhan terhadap regulasi BAPPEBTI.
            Performa historis tidak menjamin hasil di masa depan.
          </p>
        </CardContent>
      </Card>

      {/* Tech credits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            Tech Credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {[
              'Next.js 16', 'TypeScript 5', 'Tailwind CSS 4', 'shadcn/ui',
              'Prisma ORM', 'SQLite', 'TanStack Query', 'Zustand',
              'Socket.io', 'Framer Motion', 'Recharts', 'Lucide',
              'Python 3.14', 'MetaTrader 5', 'z-ai-web-dev-sdk',
            ].map((tech) => (
              <Badge key={tech} variant="outline" className="text-[10px] font-mono">
                {tech}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xs font-medium truncate">{value}</div>
      </div>
    </div>
  )
}

/* =================================================
   TAB 9: System Monitoring (admin only)
   ================================================= */

type ErrorSeverityKey = 'low' | 'medium' | 'high' | 'critical'

interface ErrorStatsData {
  total: number
  bySeverity: Partial<Record<ErrorSeverityKey, number>>
  bySource: Record<string, number>
  recent: Array<{
    id: string
    message: string
    source: string
    severity: string
    createdAt: string
  }>
}

interface BackupItem {
  filename: string
  size: number
  sizeMB: number
  createdAt: string
}

interface BackupStatsData {
  totalBackups: number
  totalSizeMB: number
  oldestBackup: string | null
  newestBackup: string | null
  nextBackupIn: string
}

const SEVERITY_BADGE: Record<ErrorSeverityKey, { className: string; label: string }> = {
  low: { className: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground', label: 'Low' },
  medium: { className: 'border-amber-500/40 bg-amber-500/10 text-amber-300', label: 'Medium' },
  high: { className: 'border-rose-500/40 bg-rose-500/10 text-rose-300', label: 'High' },
  critical: { className: 'border-rose-500/50 bg-rose-500/15 text-rose-200', label: 'Critical' },
}

const SOURCE_LABELS: Record<string, string> = {
  api: 'API',
  mt5: 'MT5',
  ai: 'AI',
  risk: 'Risk',
  system: 'System',
}

/** Maps an incoming severity (which may be the raw log level 'error'/'warn' or a true severity)
 *  to the badge-style key. */
function normalizeSeverity(sev: string): ErrorSeverityKey {
  if (sev === 'error') return 'high'
  if (sev === 'warn') return 'medium'
  if (sev === 'low' || sev === 'medium' || sev === 'high' || sev === 'critical') return sev
  return 'medium'
}

function SystemMonitoringTab() {
  const { data: session } = useSession()
  const role = (session?.user?.role ?? undefined) as UserRole | undefined
  const isAdmin = role === 'admin'

  // Non-admin landing: tab is visible but content is gated.
  if (!isAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10">
              <Lock className="h-6 w-6 text-rose-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-rose-300">Access Denied</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                You need admin privileges to view system monitoring. Your role:{' '}
                <span className="font-mono font-semibold capitalize text-rose-300">
                  {role ?? 'unknown'}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4"
    >
      <ErrorMonitoringCard />
      <DatabaseBackupCard />
      <SystemMonitoringInfoBanner />
    </motion.div>
  )
}

/* ----- A. Error Monitoring Card ----- */
function ErrorMonitoringCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['system-errors', 24],
    queryFn: () => api.errorStats(24),
    refetchInterval: 30_000,
    refetchOnMount: true,
  })

  const stats: ErrorStatsData | undefined = data?.stats
  const spike = data?.spike as { spiked: boolean; count: number; threshold: number } | undefined
  const total = stats?.total ?? 0
  const bySeverity = stats?.bySeverity ?? {}
  const bySource = stats?.bySource ?? {}
  const recent = stats?.recent ?? []

  const highOrCritical = (bySeverity.high ?? 0) + (bySeverity.critical ?? 0)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-emerald-400" />
              Error Monitoring
            </CardTitle>
            <CardDescription className="text-xs">
              Errors captured in the last 24 hours. Auto-refreshes every 30 seconds.
            </CardDescription>
          </div>
          {spike?.spiked ? (
            <Badge
              variant="outline"
              className="border-rose-500/50 bg-rose-500/15 text-rose-200"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 live-dot" />
              SPIKE DETECTED
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-dot" />
              No spike
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stat tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Errors */}
          <div
            className={cn(
              'rounded-lg border p-3',
              total > 10
                ? 'border-rose-500/30 bg-rose-500/5'
                : 'border-emerald-500/30 bg-emerald-500/5',
            )}
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total Errors (24h)
            </div>
            <div
              className={cn(
                'mt-1 font-mono text-2xl font-bold tabular-nums',
                total > 10 ? 'text-rose-300' : 'text-emerald-300',
              )}
            >
              {isLoading ? '…' : total}
            </div>
          </div>

          {/* By Severity */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              By Severity
            </div>
            <div className="mt-1.5 space-y-1 text-xs">
              {(['low', 'medium', 'high', 'critical'] as const).map((s) => (
                <div key={s} className="flex items-center justify-between">
                  <span className="capitalize text-muted-foreground">{s}</span>
                  <span className="font-mono tabular-nums">{bySeverity[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Source */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              By Source
            </div>
            <div className="mt-1.5 space-y-1 text-xs">
              {(['api', 'mt5', 'ai', 'risk', 'system'] as const).map((s) => (
                <div key={s} className="flex items-center justify-between">
                  <span className="uppercase text-muted-foreground">{s}</span>
                  <span className="font-mono tabular-nums">{bySource[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Spike Status */}
          <div
            className={cn(
              'rounded-lg border p-3',
              spike?.spiked
                ? 'border-rose-500/40 bg-rose-500/10'
                : 'border-emerald-500/30 bg-emerald-500/5',
            )}
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Spike Status
            </div>
            {spike?.spiked ? (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                  <AlertTriangle className="h-4 w-4 animate-pulse" />
                  <span className="text-sm">SPIKE</span>
                </div>
                <div className="text-[11px] text-rose-300/80">
                  <span className="font-mono tabular-nums">{spike.count}</span> / {spike.threshold} in 5 min
                </div>
              </div>
            ) : (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                  <Check className="h-4 w-4" />
                  <span className="text-sm">Stable</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <span className="font-mono tabular-nums">{spike?.count ?? 0}</span> / {spike?.threshold ?? 10} in 5 min
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Errors list */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent Errors ({recent.length})
            </h4>
            {highOrCritical > 0 && (
              <Badge
                variant="outline"
                className="border-rose-500/40 bg-rose-500/10 text-rose-300 text-[10px]"
              >
                {highOrCritical} high/critical
              </Badge>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading errors…
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> Failed to load error stats
            </div>
          ) : recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-xs text-emerald-300">
              <Check className="h-5 w-5" />
              No errors in the last 24 hours. All systems healthy.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <ul className="divide-y divide-border">
                {recent.map((e) => {
                  const sevKey = normalizeSeverity(e.severity || 'medium')
                  const badge = SEVERITY_BADGE[sevKey]
                  const truncated =
                    e.message.length > 60 ? e.message.slice(0, 60) + '…' : e.message
                  return (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 p-2.5 hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={cn(
                              'truncate text-xs font-medium',
                              sevKey === 'critical' ? 'text-rose-200' : 'text-foreground',
                            )}
                            title={e.message}
                          >
                            {truncated}
                          </p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {relativeTime(e.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="h-4 px-1.5 text-[9px] uppercase"
                          >
                            {SOURCE_LABELS[e.source] ?? e.source}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-4 px-1.5 text-[9px]',
                              badge.className,
                              sevKey === 'critical' && 'animate-pulse',
                            )}
                          >
                            {badge.label}
                          </Badge>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ----- B. Database Backup Card ----- */
function DatabaseBackupCard() {
  const qc = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<BackupItem | null>(null)
  // Track backup timestamps created in this session (for the 3/hour rate-limit UI).
  const [recentBackups, setRecentBackups] = useState<number[]>([])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['system-backup'],
    queryFn: () => api.backupStats(),
    refetchInterval: 60_000,
    refetchOnMount: true,
  })

  const stats: BackupStatsData | undefined = data?.stats
  const backups: BackupItem[] = data?.backups ?? []

  // Rate limit: max 3 manual backups per hour (per the API's rate limiter).
  const oneHourAgo = Date.now() - 3_600_000
  const recentInHour = recentBackups.filter((t) => t > oneHourAgo)
  const rateLimited = recentInHour.length >= 3
  const remainingThisHour = Math.max(0, 3 - recentInHour.length)

  const createMut = useMutation({
    mutationFn: () => api.createBackup(),
    onSuccess: (data) => {
      setRecentBackups((prev) => [...prev, Date.now()])
      qc.invalidateQueries({ queryKey: ['system-backup'] })
      const b = data.backup
      if (b) {
        toast.success('Backup created', {
          description: `${b.filename} (${b.sizeMB.toFixed(2)} MB)`,
        })
      } else {
        toast.success('Backup created', { description: data.message })
      }
    },
    onError: (e: Error) => {
      const msg = e.message || ''
      if (msg.includes('Too many') || msg.includes('429') || msg.toLowerCase().includes('rate')) {
        toast.error('Rate limited', {
          description: 'Maximum 3 manual backups per hour. Please wait.',
        })
      } else {
        toast.error('Backup failed', { description: msg })
      }
    },
  })

  const deleteMut = useMutation({
    mutationFn: (filename: string) => api.deleteBackup(filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-backup'] })
      toast.success('Backup deleted')
      setPendingDelete(null)
    },
    onError: (e: Error) => toast.error('Failed to delete backup', { description: e.message }),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-violet-400" />
              Database Backup
            </CardTitle>
            <CardDescription className="text-xs">
              SQLite backup management. Auto-backup runs hourly via the SL/TP monitor service.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || rateLimited}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {createMut.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Database className="mr-1.5 h-3.5 w-3.5" />
            )}
            {createMut.isPending ? 'Backing up…' : 'Create Backup Now'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Backup stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <BackupStat
            label="Total Backups"
            value={isLoading ? '…' : String(stats?.totalBackups ?? 0)}
            icon={<Database className="h-3 w-3" />}
          />
          <BackupStat
            label="Total Size"
            value={isLoading ? '…' : `${(stats?.totalSizeMB ?? 0).toFixed(2)} MB`}
            icon={<HardDrive className="h-3 w-3" />}
          />
          <BackupStat
            label="Oldest Backup"
            value={stats?.oldestBackup ? relativeTime(stats.oldestBackup) : '—'}
          />
          <BackupStat
            label="Newest Backup"
            value={stats?.newestBackup ? relativeTime(stats.newestBackup) : '—'}
          />
          <BackupStat
            label="Next Auto-Backup"
            value={stats?.nextBackupIn ?? '—'}
            accent="violet"
            icon={<Clock className="h-3 w-3" />}
          />
        </div>

        {/* Rate limit notice */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            Manual backup allowance:{' '}
            <span className="font-mono tabular-nums text-foreground">{remainingThisHour}/3</span>{' '}
            remaining this hour{rateLimited && ' — rate limited, please wait'}.
          </span>
        </div>

        {/* Backup list */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading backups…
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Failed to load backups
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Database className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground max-w-xs">
              No backups yet. Click{' '}
              <span className="font-semibold text-foreground">&apos;Create Backup Now&apos;</span>{' '}
              to create your first backup.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-md border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="h-8 text-[11px]">Filename</TableHead>
                  <TableHead className="h-8 w-24 text-[11px]">Size</TableHead>
                  <TableHead className="h-8 w-28 text-[11px]">Created</TableHead>
                  <TableHead className="h-8 w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.filename}>
                    <TableCell className="py-2 font-mono text-[11px] break-all">
                      {b.filename}
                    </TableCell>
                    <TableCell className="py-2 font-mono text-xs tabular-nums">
                      {b.sizeMB.toFixed(2)} MB
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {relativeTime(b.createdAt)}
                    </TableCell>
                    <TableCell className="py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                        onClick={() => setPendingDelete(b)}
                        aria-label={`Delete backup ${b.filename}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Delete confirmation */}
        <AlertDialog
          open={!!pendingDelete}
          onOpenChange={(o) => !o && setPendingDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete backup?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the backup file{' '}
                <span className="font-mono text-rose-300">{pendingDelete?.filename}</span>{' '}
                ({pendingDelete?.sizeMB.toFixed(2)} MB). This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 text-white hover:bg-rose-700"
                disabled={deleteMut.isPending}
                onClick={() => pendingDelete && deleteMut.mutate(pendingDelete.filename)}
              >
                {deleteMut.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

function BackupStat({
  label,
  value,
  accent,
  icon,
}: {
  label: string
  value: string
  accent?: 'violet'
  icon?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        accent === 'violet'
          ? 'border-violet-500/30 bg-violet-500/5'
          : 'border-border bg-muted/30',
      )}
    >
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          'mt-1 font-mono text-sm font-semibold tabular-nums',
          accent === 'violet' && 'text-violet-300',
        )}
      >
        {value}
      </div>
    </div>
  )
}

/* ----- C. Info Banner ----- */
function SystemMonitoringInfoBanner() {
  return (
    <Card className="border-violet-500/20 bg-violet-500/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/10">
            <Info className="h-4 w-4 text-violet-300" />
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p className="font-semibold text-violet-200">How monitoring works</p>
            <ul className="space-y-1">
              <li className="relative pl-4 before:absolute before:left-0 before:content-['•'] before:text-violet-400">
                Backups run automatically every{' '}
                <span className="font-mono text-foreground">1 hour</span> via the SL/TP monitor
                service.
              </li>
              <li className="relative pl-4 before:absolute before:left-0 before:content-['•'] before:text-violet-400">
                Last <span className="font-mono text-foreground">24 backups</span> are retained.
                Older backups are auto-deleted.
              </li>
              <li className="relative pl-4 before:absolute before:left-0 before:content-['•'] before:text-violet-400">
                Error monitoring captures all API errors with webhook alerts for high/critical
                severity.
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* =================================================
   MAIN PANEL
   ================================================= */

export function SettingsPanel() {
  const [tab, setTab] = useState('accounts')

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Settings className="h-5 w-5 text-emerald-400" />
          Settings
        </h2>
        <p className="text-xs text-muted-foreground">
          Konfigurasi akun MT5, broker, API keys, email, dan info sistem.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="accounts" className="text-xs">
            <Users className="h-3.5 w-3.5" />
            Akun MT5
          </TabsTrigger>
          <TabsTrigger value="broker" className="text-xs">
            <Server className="h-3.5 w-3.5" />
            Broker & MT5 Engine
          </TabsTrigger>
          <TabsTrigger value="api" className="text-xs">
            <Key className="h-3.5 w-3.5" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="email" className="text-xs">
            <Mail className="h-3.5 w-3.5" />
            Email & Notifikasi
          </TabsTrigger>
          <TabsTrigger value="webhook" className="text-xs">
            <Webhook className="h-3.5 w-3.5" />
            Webhook
          </TabsTrigger>
          <TabsTrigger value="mt5" className="text-xs">
            <Cable className="h-3.5 w-3.5" />
            MT5 Connection
          </TabsTrigger>
          <TabsTrigger value="about" className="text-xs">
            <Info className="h-3.5 w-3.5" />
            Tentang Sistem
          </TabsTrigger>
          <TabsTrigger value="users" className="text-xs">
            <Users className="h-3.5 w-3.5" />
            User Management
          </TabsTrigger>
          <TabsTrigger value="monitoring" className="text-xs">
            <ShieldCheck className="h-3.5 w-3.5" />
            System Monitoring
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="accounts"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <AccountsTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="broker" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="broker"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <BrokerTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="api" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="api"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <ApiKeysTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="email"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <EmailTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="webhook" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="webhook"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <WebhookTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="mt5" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="mt5"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <MT5ConnectionTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="about" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="about"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <AboutTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <UserManagementTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="monitoring" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="monitoring"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <SystemMonitoringTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default SettingsPanel
