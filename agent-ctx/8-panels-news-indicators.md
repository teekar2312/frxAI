# Task 8 — Panels: News Intelligence + Indikator Pool

**Agent**: panels-news-indicators
**Scope**: Overwrite two lazy-loaded placeholder panels on the FinexFX dashboard:
1. `/src/components/panels/news-panel.tsx` → `export function NewsPanel()`
2. `/src/components/panels/indicators-panel.tsx` → `export function IndicatorsPanel()`

Both are `'use client'`, no props, rendered via `lazy()` from `src/app/page.tsx` under the `#news` and `#indicators` hash routes.

## Inputs Read
- `worklog.md` (architecture, API contracts, style guide)
- `src/lib/types.ts` — `NewsItem`, `Indicator`, `NEWS_CATEGORIES`, `SUPPORTED_SYMBOLS`, `SYMBOL_LABEL`, `NewsCategory`
- `src/lib/api.ts` — `api.news`, `api.refreshNews`, `api.indicators`, `api.updateIndicator`, `api.aiSelectIndicators`, `api.systemConfig`
- `src/hooks/use-price-feed.ts` — `useFeed` (available; not directly needed for these panels)
- `src/lib/format.ts` — `relativeTime`
- `src/components/providers.tsx` — confirmed dark theme forced + React Query client + Sonner toaster
- `src/app/globals.css` — confirmed `text-bull/bear/warn`, `live-dot`, `scroll-thin`, `tabular` utilities already defined
- shadcn/ui components used: `Card`, `Button`, `Badge`, `Switch`, `Slider`, `Tabs`, `ScrollArea`, `Sheet`, `Skeleton`, `Tooltip`
- Live API smoke: `/api/news`, `/api/indicators`, `/api/system/config` — all return data as expected.

## FILE 1 — `news-panel.tsx` (News Intelligence Center)
Covers all 7 analysis dimensions + breaking news. Sections:
- **Header bar**: title "News Intelligence — Finnhub + MARKETAUX", `Refresh News` button → `api.refreshNews()` mutation with loading state, toast `N berita baru disintesis`, invalidates `['news']`. Auto-refresh indicator (`Auto-refresh {newsRefreshMinutes}m`) sourced from `/api/system/config`.
- **Source filter chips**: All / Finnhub / MARKETAUX / Breaking. Breaking filter selects `category === 'breaking'` regardless of source.
- **Breaking banner**: animated full-width card with `border-l-4 border-l-rose-500`, pulsing `BREAKING` badge (uses `.live-dot`), title, summary, affected symbol chips, relative time. Click → opens detail Sheet.
- **Sentiment summary card**: horizontal stacked bar (emerald/rose/amber) + 3 stat cards (Bullish/Bearish/Neutral counts + %). Header subtitle reads "60% Bullish · 25% Bearish · 15% Neutral" style.
- **Main grid** (`lg:grid-cols-[260px_1fr]`):
  - Left sidebar: category pills (all 13 `NEWS_CATEGORIES` + "Semua"), impact filter pills (All/High/Medium/Low), per-symbol sentiment mini-cards (4 majors with bull/bear/neutral counts + net score + stacked bar).
  - Right: News feed `ScrollArea` (`max-h-[600px]`) of `NewsRow` cards. Each row: impact dot (high=rose live-dot, medium=amber, low=zinc), category badge (color-coded per `CATEGORY_COLOR`), source badge (finnhub=emerald, marketaux=cyan-600), 2-line clamped title, 3-line clamped summary, sentiment arrow (▲/▼/◆), symbol chips, relative time. Empty state with reset filter button. Loading skeletons.
- **Impact calendar** (bottom): groups high-impact news by date (Hari ini / Kemarin / 2 hari lalu), 3-col timeline.
- **Detail Sheet** (right side, `sm:max-w-lg`): full news item with all badges, sentiment, symbol chips, full summary, optional source URL link.
- `useQuery(['news'], ..., { refetchInterval: 60_000 })` for live polling; `useQuery(['system-config'])` for refresh minutes. Client-side filter composition via `useMemo`.

## FILE 2 — `indicators-panel.tsx` (Indikator Pool Manager)
Manages 30 indicators with scalping presets. Sections:
- **Header**: title "Indikator Pool — 30 indikator teknikal (preset scalping M5)", `AI Auto-Select` button → `api.aiSelectIndicators()` mutation with loading + toast `AI memilih ulang {N} indikator` (N = enabled count). Stat chips: Total / Enabled / AI Managed.
- **Active scalping set summary card**: enabled indicators grouped by category with weight bars + `Brain` icon for AI-managed. Each chip has a `Tooltip` showing weight + managed status.
- **Category tabs**: All / Trend / Oscillator / Volume / Volatility / Channel / Regression with count badge per tab.
- **Indicator grid** (`md:grid-cols-2 xl:grid-cols-3`): each card:
  - Name (bold) + `AI` badge if autoManaged, category icon (color-coded), category badge, 2-line clamped description.
  - Enabled `Switch` (optimistic update via `onMutate`) — when ON, card gets emerald border accent + emerald-tinted background.
  - Auto-Managed `Switch` (optimistic update).
  - Weight `Slider` 0-1 (0-100 internally) with value display, **debounced** 400ms before mutation to avoid spamming the API.
  - Expandable params section: side-by-side `defaultParams` vs `scalpingPreset` JSON (pretty-printed). If they differ, shows amber "Preset scalping aktif" badge and amber-tinted preset panel.
- **Category color legend**: trend=emerald, oscillator=amber, volume=cyan-600, volatility=rose, channel=violet-500, regression=orange-500 (via `CATEGORY_META` map).
- **Legend/info card** (bottom, emerald-tinted): explains auto-managed + preset scalping behavior.
- Mutations use **optimistic updates**: `onMutate` cancels in-flight queries, snapshots previous data, mutates cache immediately; `onError` rolls back; `onSettled` invalidates. Toggles feel snappy.
- Weight slider uses **derived-state-during-render** pattern (React docs recommended) instead of `setState` in `useEffect` to sync with server value — keeps `react-hooks/set-state-in-effect` lint rule happy.

## Style Compliance
- Dark theme (already forced by Providers). NO blue/indigo colors anywhere.
- Trading colors: bull=emerald, bear=rose, warn/neutral=amber, accent=cyan/violet/orange.
- `tabular` / `font-mono` on all numeric displays.
- `p-4`/`p-6` panel padding, `gap-4` between cards.
- Long lists use `max-h-96` (or `max-h-[600px]` for feed, `max-h-80`/`max-h-72`/`max-h-48` for sub-lists) + `.scroll-thin` custom scrollbar.
- Responsive: `lg:`/`md:`/`xl:` breakpoints. Grid collapses on mobile.
- `framer-motion` for card enter animations + expand/collapse + breaking banner entrance.
- `sonner` toasts for refresh / AI-select success/error.
- `lucide-react` icons throughout.
- `@tanstack/react-query` for all server state.

## Lint Result
- `bun run lint` → **0 errors, 0 warnings** for `news-panel.tsx` and `indicators-panel.tsx`.
- Remaining 5 errors are in OTHER agents' files (`alerts-panel.tsx`, `risk-panel.tsx`, `trading-panel.tsx`, `page.tsx`) — out of scope for this task. Confirmed via `grep` that neither of my two filenames appear in the lint output.
- Dev log: server running cleanly on port 3000, last entry `GET /api/dashboard 200`. No compile errors related to either panel.

## Stage Summary
Both panels are production-ready, lint-clean, and wired to the existing backend API contracts (`/api/news`, `/api/news/refresh`, `/api/indicators`, `/api/indicators/[id]`, `/api/indicators/ai-select`, `/api/system/config`). They integrate seamlessly with the lazy-loaded panel router in `src/app/page.tsx` and respect the dark trading-UI style guide (emerald/rose/amber/cyan/violet/orange palette, no blue, tabular numbers, scroll-thin, p-4/p-6/gap-4 spacing).
