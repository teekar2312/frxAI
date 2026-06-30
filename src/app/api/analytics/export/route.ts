import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/analytics/export?days=30&accountId=
// Generates a self-contained, print-friendly HTML performance report.
// The browser can save it directly or use "Print → Save as PDF".
//
// Report sections:
//   1. Header (title + date range + account name + generated-at)
//   2. Summary KPIs (Net P&L, Win Rate, Profit Factor, Total Trades, Expectancy, Sharpe)
//   3. Advanced Metrics table (8 metrics)
//   4. By Pair breakdown
//   5. By Session breakdown
//   6. By Source breakdown
//   7. Trade Journal (last 20 closed trades)
//   8. Footer (timestamp + disclaimer)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId') || undefined
    const days = parseInt(searchParams.get('days') || '30')

    const from = new Date()
    from.setUTCDate(from.getUTCDate() - days)

    const where: any = { status: 'closed', closeTime: { gte: from } }
    if (accountId) where.accountId = accountId

    const trades = await db.trade.findMany({
      where,
      orderBy: { closeTime: 'asc' },
    })

    // Account info (name + balance)
    let accountName = 'Semua Akun'
    let balance = 10000
    if (accountId) {
      const acct = await db.account.findUnique({
        where: { id: accountId },
        select: { name: true, balance: true, currency: true },
      })
      if (acct) {
        accountName = acct.name
        balance = acct.balance || 10000
      }
    } else {
      const def = await db.account.findFirst({
        where: { isDefault: true },
        select: { name: true, balance: true, currency: true },
      })
      if (def) {
        accountName = `${def.name} (Default)`
        balance = def.balance || 10000
      }
    }

    // ── Compute analytics (mirrors /api/analytics) ──
    const totalClosed = trades.length
    const wins = trades.filter((t) => t.pnl > 0).length
    const losses = trades.filter((t) => t.pnl < 0).length
    const grossProfit = trades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0))
    const netProfit = trades.reduce((s, t) => s + t.pnl, 0)
    const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0
    const avgWin = wins > 0 ? grossProfit / wins : 0
    const avgLoss = losses > 0 ? grossLoss / losses : 0

    // by pair
    const pairMap = new Map<string, { trades: number; wins: number; netPnl: number }>()
    for (const t of trades) {
      const e = pairMap.get(t.symbol) || { trades: 0, wins: 0, netPnl: 0 }
      e.trades++
      if (t.pnl > 0) e.wins++
      e.netPnl += t.pnl
      pairMap.set(t.symbol, e)
    }
    const byPair = Array.from(pairMap.entries())
      .map(([symbol, v]) => ({
        symbol,
        trades: v.trades,
        winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
        netPnl: Number(v.netPnl.toFixed(2)),
      }))
      .sort((a, b) => b.netPnl - a.netPnl)

    // by source
    const sourceMap = new Map<string, { trades: number; wins: number; netPnl: number }>()
    for (const t of trades) {
      const e = sourceMap.get(t.source) || { trades: 0, wins: 0, netPnl: 0 }
      e.trades++
      if (t.pnl > 0) e.wins++
      e.netPnl += t.pnl
      sourceMap.set(t.source, e)
    }
    const bySource = Array.from(sourceMap.entries()).map(([source, v]) => ({
      source,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      netPnl: Number(v.netPnl.toFixed(2)),
    }))

    // by session
    const sessionMap = new Map<string, { trades: number; wins: number; netPnl: number }>()
    for (const t of trades) {
      const h = new Date(t.openTime).getUTCHours()
      let session = 'Off-Session'
      if (h >= 12 && h < 16) session = 'Overlap'
      else if (h >= 7 && h < 16) session = 'London'
      else if (h >= 12 && h < 21) session = 'New York'
      else if (h >= 0 && h < 9) session = 'Tokyo'
      else if (h >= 21 || h < 6) session = 'Sydney'
      const e = sessionMap.get(session) || { trades: 0, wins: 0, netPnl: 0 }
      e.trades++
      if (t.pnl > 0) e.wins++
      e.netPnl += t.pnl
      sessionMap.set(session, e)
    }
    const sessionOrder = ['Overlap', 'London', 'New York', 'Tokyo', 'Sydney', 'Off-Session']
    const bySession = sessionOrder
      .filter((s) => sessionMap.has(s))
      .map((session) => {
        const v = sessionMap.get(session)!
        return {
          session,
          trades: v.trades,
          winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
          netPnl: Number(v.netPnl.toFixed(2)),
        }
      })

    // Equity curve (cumulative) for max drawdown
    let running = 0
    const equityCurve = trades.map((t) => {
      running += t.pnl
      return { t: new Date(t.closeTime!).toISOString(), equity: Number(running.toFixed(2)) }
    })
    let peak = 0
    let maxDrawdown = 0
    for (const point of equityCurve) {
      if (point.equity > peak) peak = point.equity
      const dd = peak - point.equity
      if (dd > maxDrawdown) maxDrawdown = dd
    }
    const maxDrawdownPct = balance > 0 ? (maxDrawdown / balance) * 100 : 0

    // Expectancy + Avg R:R
    const lossRate = totalClosed > 0 ? losses / totalClosed : 0
    const expectancy = Number(((winRate / 100) * avgWin - lossRate * avgLoss).toFixed(2))
    const avgRR = avgLoss > 0 ? Number((avgWin / avgLoss).toFixed(2)) : 0

    // Sharpe / Sortino (from daily returns)
    const byDayMap = new Map<string, number>()
    for (const t of trades) {
      if (!t.closeTime) continue
      const dayStr = new Date(t.closeTime).toISOString().slice(0, 10)
      byDayMap.set(dayStr, (byDayMap.get(dayStr) || 0) + t.pnl)
    }
    const dayKeys = Array.from(byDayMap.keys()).sort()
    const dailyPnl = dayKeys.map((k) => byDayMap.get(k)!)
    const dailyReturns: number[] = []
    for (let i = 1; i < dailyPnl.length; i++) {
      const prev = dailyPnl.slice(0, i).reduce((a, b) => a + b, 0)
      const cur = prev + dailyPnl[i]
      if (prev !== 0) dailyReturns.push((cur - prev) / Math.abs(prev))
    }
    const avgDailyReturn = dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0
    const dailyStd = dailyReturns.length > 1
      ? Math.sqrt(dailyReturns.reduce((a, b) => a + (b - avgDailyReturn) ** 2, 0) / (dailyReturns.length - 1))
      : 0
    const sharpeRatio = dailyStd > 0
      ? Number(((avgDailyReturn / dailyStd) * Math.sqrt(252)).toFixed(2))
      : 0
    const downsideReturns = dailyReturns.filter((r) => r < 0)
    const downsideStd = downsideReturns.length > 1
      ? Math.sqrt(downsideReturns.reduce((a, b) => a + b ** 2, 0) / downsideReturns.length)
      : 0
    const sortinoRatio = downsideStd > 0
      ? Number(((avgDailyReturn / downsideStd) * Math.sqrt(252)).toFixed(2))
      : 0

    const winningPnls = trades.filter((t) => t.pnl > 0).map((t) => t.pnl)
    const losingPnls = trades.filter((t) => t.pnl < 0).map((t) => t.pnl)
    const largestWin = winningPnls.length > 0 ? Math.max(...winningPnls) : 0
    const largestLoss = losingPnls.length > 0 ? Math.min(...losingPnls) : 0

    // Trade journal — last 20 closed trades (most recent first)
    const journal = trades
      .slice()
      .reverse()
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        closeTime: t.closeTime!,
        symbol: t.symbol,
        side: t.side,
        lotSize: t.lotSize,
        pnl: t.pnl,
        pips: t.pips,
        source: t.source,
        comment: t.comment || '',
        strategy: t.strategy,
        timeframe: t.timeframe,
      }))

    // ── Date range labels ──
    const now = new Date()
    const fromLabel = from.toISOString().slice(0, 10)
    const toLabel = now.toISOString().slice(0, 10)
    const generatedAt = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

    // ── Helpers ──
    const money = (n: number) => {
      const sign = n < 0 ? '-' : ''
      const abs = Math.abs(n)
      return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    const pct = (n: number) => `${n.toFixed(2)}%`
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const pnlClass = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'neutral')

    // ── Build HTML ──
    const kpiCards = [
      { label: 'Net P&L', value: money(netProfit), cls: pnlClass(netProfit) },
      { label: 'Win Rate', value: pct(winRate), cls: winRate >= 50 ? 'pos' : winRate > 0 ? 'warn' : 'neutral' },
      { label: 'Profit Factor', value: profitFactor.toFixed(2), cls: profitFactor >= 1.5 ? 'pos' : profitFactor >= 1 ? 'warn' : 'neg' },
      { label: 'Total Trades', value: String(totalClosed), cls: 'neutral' },
      { label: 'Expectancy', value: money(expectancy), cls: pnlClass(expectancy) },
      { label: 'Sharpe Ratio', value: sharpeRatio.toFixed(2), cls: sharpeRatio >= 1 ? 'pos' : sharpeRatio >= 0 ? 'warn' : 'neg' },
    ]
      .map(
        (k) => `
        <div class="kpi ${k.cls}">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${k.value}</div>
        </div>`
      )
      .join('')

    const advRows = [
      ['Expectancy (per trade)', money(expectancy), 'Avg $ earned per trade'],
      ['Avg R:R (reward:risk)', `${avgRR.toFixed(2)} : 1`, 'avgWin / avgLoss'],
      ['Max Drawdown', `${money(-maxDrawdown)} (${pct(maxDrawdownPct)})`, 'Peak-to-trough decline'],
      ['Profit Factor', profitFactor.toFixed(2), 'grossProfit / grossLoss'],
      ['Sharpe Ratio', sharpeRatio.toFixed(2), 'Annualized risk-adjusted return'],
      ['Sortino Ratio', sortinoRatio.toFixed(2), 'Downside-adjusted Sharpe'],
      ['Largest Win', money(largestWin), 'Single best trade'],
      ['Largest Loss', money(largestLoss), 'Single worst trade'],
    ]
      .map(
        ([m, v, d]) => `
        <tr>
          <td class="metric-name">${m}</td>
          <td class="metric-value ${pnlClass(parseFloat(v.replace(/[^0-9.-]/g, '')))}">${v}</td>
          <td class="metric-desc">${d}</td>
        </tr>`
      )
      .join('')

    const pairRows =
      byPair.length > 0
        ? byPair
            .map(
              (p) => `
          <tr>
            <td class="sym">${esc(p.symbol)}</td>
            <td class="num">${p.trades}</td>
            <td class="num">${pct(p.winRate)}</td>
            <td class="num ${pnlClass(p.netPnl)}">${money(p.netPnl)}</td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="4" class="empty">Tidak ada data</td></tr>`

    const sessionRows =
      bySession.length > 0
        ? bySession
            .map(
              (s) => `
          <tr>
            <td class="sym">${esc(s.session)}</td>
            <td class="num">${s.trades}</td>
            <td class="num">${pct(s.winRate)}</td>
            <td class="num ${pnlClass(s.netPnl)}">${money(s.netPnl)}</td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="4" class="empty">Tidak ada data</td></tr>`

    const sourceRows =
      bySource.length > 0
        ? bySource
            .map(
              (s) => `
          <tr>
            <td class="sym">${esc(s.source)}</td>
            <td class="num">${s.trades}</td>
            <td class="num">${pct(s.winRate)}</td>
            <td class="num ${pnlClass(s.netPnl)}">${money(s.netPnl)}</td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="4" class="empty">Tidak ada data</td></tr>`

    const journalRows =
      journal.length > 0
        ? journal
            .map((t) => {
              const dt = new Date(t.closeTime).toISOString().replace('T', ' ').slice(0, 16)
              return `
          <tr>
            <td class="num">${dt}</td>
            <td class="sym">${esc(t.symbol)}</td>
            <td class="${t.side === 'buy' ? 'pos' : 'neg'}">${t.side.toUpperCase()}</td>
            <td class="num">${t.lotSize.toFixed(2)}</td>
            <td class="num ${pnlClass(t.pnl)}">${money(t.pnl)}</td>
            <td class="num ${pnlClass(t.pips)}">${t.pips >= 0 ? '+' : ''}${t.pips.toFixed(1)}</td>
            <td class="src">${esc(t.source)}</td>
            <td class="notes">${esc(t.comment || '-')}</td>
          </tr>`
            })
            .join('')
        : `<tr><td colspan="8" class="empty">Belum ada trade closed pada periode ini.</td></tr>`

    const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FinexFX AI — Performance Report (${fromLabel} → ${toLabel})</title>
<style>
  * { box-sizing: border-box; }
  :root {
    --bg: #ffffff;
    --panel: #f8fafc;
    --border: #e2e8f0;
    --text: #0f172a;
    --muted: #64748b;
    --accent: #7c3aed;
    --accent-2: #4338ca;
    --pos: #059669;
    --pos-bg: #ecfdf5;
    --neg: #e11d48;
    --neg-bg: #fff1f2;
    --warn: #d97706;
    --neutral: #475569;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 32px 40px 64px;
  }
  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #6d28d9 100%);
    color: #fff;
    border-radius: 14px;
    padding: 24px 28px;
    margin-bottom: 24px;
    box-shadow: 0 10px 25px -8px rgba(76, 29, 149, 0.4);
  }
  .header h1 {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .header .logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.04em;
  }
  .header .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.85);
  }
  .header .meta strong { color: #fff; font-weight: 600; margin-left: 4px; }
  /* ── Toolbar (print button) ── */
  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 18px;
  }
  .btn-print {
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(124, 58, 237, 0.35);
  }
  .btn-print:hover { background: var(--accent-2); }
  @media print {
    .toolbar { display: none; }
    .page { padding: 0; max-width: none; }
    .header { box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-size: 11px; }
  }
  /* ── KPI grid ── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }
  @media (max-width: 900px) {
    .kpi-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 500px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .kpi {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
    border-left-width: 3px;
  }
  .kpi.pos { border-left-color: var(--pos); }
  .kpi.neg { border-left-color: var(--neg); }
  .kpi.warn { border-left-color: var(--warn); }
  .kpi.neutral { border-left-color: var(--neutral); }
  .kpi-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
    margin-bottom: 4px;
  }
  .kpi-value {
    font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .kpi.pos .kpi-value { color: var(--pos); }
  .kpi.neg .kpi-value { color: var(--neg); }
  .kpi.warn .kpi-value { color: var(--warn); }
  /* ── Section ── */
  .section {
    margin-bottom: 22px;
    page-break-inside: avoid;
  }
  .section-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin: 0 0 10px;
    padding-left: 10px;
    border-left: 3px solid var(--accent);
  }
  .section-title .sub {
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
    margin-left: 8px;
  }
  /* ── Tables ── */
  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    font-size: 12px;
  }
  th, td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }
  th {
    background: #f1f5f9;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fafbfc; }
  .num, .metric-value {
    font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .sym { font-weight: 600; }
  .src { color: var(--muted); text-transform: capitalize; }
  .notes { color: var(--muted); font-style: italic; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pos { color: var(--pos); }
  .neg { color: var(--neg); }
  .warn { color: var(--warn); }
  .neutral { color: var(--neutral); }
  .pos-bg { background: var(--pos-bg) !important; }
  .neg-bg { background: var(--neg-bg) !important; }
  .empty { text-align: center; color: var(--muted); padding: 20px; font-style: italic; }
  /* ── Advanced metrics table ── */
  .adv-table .metric-name { font-weight: 600; }
  .adv-table .metric-desc { color: var(--muted); font-size: 11px; }
  /* ── Two-column layout ── */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
  }
  @media (max-width: 800px) {
    .two-col { grid-template-columns: 1fr; }
  }
  /* ── Footer ── */
  .footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    color: var(--muted);
    text-align: center;
    line-height: 1.6;
  }
  .footer .gen { font-weight: 600; color: var(--text); }
  .footer .disc { margin-top: 6px; font-style: italic; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1><span class="logo">FX</span> FinexFX AI — Performance Report</h1>
    <div class="meta">
      <span>Periode:<strong>${fromLabel} → ${toLabel}</strong> (${days} hari)</span>
      <span>Akun:<strong>${esc(accountName)}</strong></span>
      <span>Saldo Awal:<strong>${money(balance)}</strong></span>
      <span>Total Trade Closed:<strong>${totalClosed}</strong></span>
    </div>
  </div>

  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <!-- ── Summary KPIs ── -->
  <div class="section">
    <h2 class="section-title">Ringkasan Kinerja <span class="sub">6 indikator utama</span></h2>
    <div class="kpi-grid">
      ${kpiCards}
    </div>
  </div>

  <!-- ── Advanced Metrics ── -->
  <div class="section">
    <h2 class="section-title">Advanced Performance Metrics <span class="sub">8 metrik kuantitatif</span></h2>
    <table class="adv-table">
      <thead>
        <tr><th style="text-align:left">Metrik</th><th>Nilai</th><th style="text-align:left">Deskripsi</th></tr>
      </thead>
      <tbody>
        ${advRows}
      </tbody>
    </table>
  </div>

  <!-- ── By Pair & By Session ── -->
  <div class="two-col">
    <div class="section">
      <h2 class="section-title">Breakdown per Pair</h2>
      <table>
        <thead>
          <tr><th style="text-align:left">Symbol</th><th>Trades</th><th>Win Rate</th><th>Net P&amp;L</th></tr>
        </thead>
        <tbody>${pairRows}</tbody>
      </table>
    </div>
    <div class="section">
      <h2 class="section-title">Breakdown per Sesi</h2>
      <table>
        <thead>
          <tr><th style="text-align:left">Sesi</th><th>Trades</th><th>Win Rate</th><th>Net P&amp;L</th></tr>
        </thead>
        <tbody>${sessionRows}</tbody>
      </table>
    </div>
  </div>

  <!-- ── By Source ── -->
  <div class="section">
    <h2 class="section-title">Breakdown per Sumber <span class="sub">manual / auto / ai</span></h2>
    <table>
      <thead>
        <tr><th style="text-align:left">Sumber</th><th>Trades</th><th>Win Rate</th><th>Net P&amp;L</th></tr>
      </thead>
      <tbody>${sourceRows}</tbody>
    </table>
  </div>

  <!-- ── Trade Journal ── -->
  <div class="section">
    <h2 class="section-title">Trade Journal <span class="sub">20 trade closed terbaru</span></h2>
    <table>
      <thead>
        <tr>
          <th style="text-align:left">Close Time</th>
          <th style="text-align:left">Symbol</th>
          <th style="text-align:left">Side</th>
          <th>Lot</th>
          <th>P&amp;L</th>
          <th>Pips</th>
          <th style="text-align:left">Source</th>
          <th style="text-align:left">Notes</th>
        </tr>
      </thead>
      <tbody>${journalRows}</tbody>
    </table>
  </div>

  <div class="footer">
    <div class="gen">Generated at ${generatedAt} · FinexFX AI Trading System</div>
    <div class="disc">
      DISCLAIMER: Laporan ini dihasilkan secara otomatis dari data trade tersimpan di database lokal.
      Past performance tidak menjamin hasil di masa depan. Trading FX/CFD melibatkan risiko kerugian
      signifikan. Gunakan informasi ini untuk evaluasi internal — bukan saran investasi.
    </div>
  </div>
</div>
</body>
</html>`

    const filename = `finexfx-report-${now.toISOString().slice(0, 10)}.html`
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (e: any) {
    console.error('GET /api/analytics/export error', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
