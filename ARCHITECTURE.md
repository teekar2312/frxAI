# Architecture — frxAI (FinexFX AI Trading System)

> **Version:** 1.2.0  
> **Last updated:** July 2025

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Project Structure](#4-project-structure)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Backend Architecture](#6-backend-architecture)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Real-time Data](#8-real-time-data)
9. [Mini-Services](#9-mini-services)
10. [Database Schema](#10-database-schema)
11. [Security Measures](#11-security-measures)
12. [Risk Management](#12-risk-management)
13. [Deployment](#13-deployment)

---

## 1. System Overview

frxAI is a self-hosted, AI-powered Forex trading dashboard designed for individual traders and small teams. The system provides a **single-page dashboard** with **12 panels** covering every aspect of forex trading:

| # | Panel | Purpose |
|---|-------|---------|
| 1 | **Dashboard** | Account overview, equity sparkline, live P&L, open positions summary |
| 2 | **Trading** | Open/close/partial-close trades, move to break-even, trailing stops |
| 3 | **Analytics** | Win rate, profit factor, Sharpe ratio, drawdown, equity curve, by-pair breakdown |
| 4 | **Indicators** | Technical indicator pool (trend, oscillator, volume, volatility, channel, regression) |
| 5 | **AI Signals** | AI-generated trade signals with confidence scores and accuracy tracking |
| 6 | **News** | Forex news feed with sentiment analysis and impact ratings |
| 7 | **Calendar** | Economic calendar (NFP, CPI, GDP, rate decisions) with alert integration |
| 8 | **Risk** | Risk settings, usage meters, daily loss circuit breaker, pre-trade enforcement |
| 9 | **Alerts** | Price alerts (above/below/cross) with email notification support |
| 10 | **Logs** | System log viewer with tiered retention (debug → error) |
| 11 | **Backtest** | Strategy backtesting with equity curves, optimization, and PDF export |
| 12 | **Settings** | System config, user management, webhook config, backup management |

The system supports **4 currency pairs**: EUR/USD, USD/JPY, GBP/USD, XAU/USD (Gold), and integrates with MetaTrader 5 via a pluggable bridge service.

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Runtime** | Bun | latest | JavaScript/TypeScript runtime (dev + production) |
| **Framework** | Next.js | 16.1.x | React full-stack framework (App Router, API routes) |
| **Language** | TypeScript | 5.x | Static type checking |
| **Frontend** | React | 19.0.x | UI component library |
| **UI Kit** | shadcn/ui (Radix) | latest | Accessible, composable component primitives |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS framework |
| **State** | Zustand | 5.x | Client-side global state management |
| **Data Fetching** | TanStack Query | 5.82.x | Server state management, caching, refetching |
| **Real-time** | Socket.IO Client | 4.8.x | WebSocket price feed connection |
| **ORM** | Prisma | 6.11.x | Type-safe database access |
| **Database** | MySQL | 8.x | Relational database server |
| **Auth** | NextAuth | 4.24.x | Authentication (credentials provider, JWT sessions) |
| **Validation** | Zod | 4.x | Schema-based input validation |
| **Password** | bcryptjs | 3.x | Password hashing |
| **Charts** | Recharts | 2.15.x | Data visualization (equity curves, P&L charts) |
| **Animation** | Framer Motion | 12.x | UI transitions and animations |
| **Dates** | date-fns | 4.x | Date formatting and manipulation |
| **Forms** | React Hook Form + @hookform/resolvers | 7.60.x | Form state management + Zod integration |
| **PDF** | Sharp | 0.34.x | Image processing for chart exports |
| **AI SDK** | z-ai-web-dev-sdk | 0.0.x | AI/LLM integration for analysis and signals |
| **Markdown** | react-markdown | 10.x | AI response rendering |
| **Reverse Proxy** | Caddy | 2.x | HTTPS termination, port-based routing |
| **CI/CD** | GitHub Actions | — | Automated testing and build |

---

## 3. Architecture Diagram

```
                          ┌─────────────┐
                          │   Browser   │
                          │  (SPA/WS)   │
                          └──────┬──────┘
                                 │ HTTP / WebSocket
                                 ▼
                          ┌─────────────┐
                          │    Caddy    │
                          │  (port 81)  │
                          └──────┬──────┘
                    ┌────────────┼────────────┐
                    │            │            │
             XTransformPort    Default    XTransformPort
               =3003         Proxy          =3050
                    │            │            │
                    ▼            ▼            ▼
          ┌──────────────┐ ┌──────────┐ ┌──────────────┐
          │ Price Feed   │ │ Next.js  │ │  MT5 Bridge  │
          │ (port 3003)  │ │(port     │ │  (port 3050) │
          │              │ │ 3000)    │ │              │
          │ Socket.IO    │ │          │ │  Bun.serve   │
          │ WebSocket    │ │ App      │ │              │
          │ Server       │ │ Router   │ │  ┌────────┐  │
          │              │ │          │ │  │ Mock   │  │
          │ - Ticks (1s) │ │ API      │ │  │Adapter │  │
          │ - Sessions   │ │ Routes   │ │  └────────┘  │
          │ - Trades     │ │          │ │  ┌────────┐  │
          │ - AI signals │ │ Prisma   │ │  │ Real   │  │
          │ - News       │ │ Client   │ │  │Python  │  │
          └──────────────┘ └────┬─────┘ │  │Adapter │  │
                               │       │  └────────┘  │
                               ▼       └──────┬───────┘
                         ┌───────────┐         │
                         │   MySQL   │         │
                         │ Database  │         │
                         │  Server   │◄────────┘
                         └───────────┘     (no direct
                                            DB access)

          ┌──────────────────────────────────────────────┐
          │          SL/TP Monitor Worker                 │
          │          (polling, no port)                   │
          │                                               │
          │  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
          │  │SL/TP     │  │Reconcile  │  │AI Signal  │  │
          │  │Check 5s  │  │MT5 30s   │  │Eval 5min  │  │
          │  └──────────┘  └───────────┘  └───────────┘  │
          │  ┌──────────┐  ┌───────────┐                  │
          │  │DB Backup │  │Log Cleanup│                  │
          │  │ 1 hour   │  │ 6 hours   │                  │
          │  └──────────┘  └───────────┘                  │
          └──────────────────────┬───────────────────────┘
                                 │ HTTP POST + X-Service-Key
                                 ▼
                          Next.js API Routes (port 3000)
```

### Key Data Flows

```
Price Feed:  Socket.IO (3003) → Browser ← Caddy ← XTransformPort=3003
MT5 Bridge:  Next.js (3000) → HTTP → MT5 Bridge (3050) + X-Bridge-Key
SL/TP Check: Monitor Worker → POST /api/trades/check-sl-tp + X-Service-Key → Next.js → MySQL
Auth:       Browser → Caddy → Next.js → NextAuth JWT → Prisma User table
```

---

## 4. Project Structure

```
frxAI/
├── .github/workflows/ci.yml     # GitHub Actions CI/CD pipeline
├── Caddyfile                     # Reverse proxy config (port 81)
├── next.config.ts                # Next.js config (standalone output)
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── components.json               # shadcn/ui component registry
├── .env.example                  # Environment variable template
│
├── prisma/
│   ├── schema.prisma             # Database schema (15 models)
│   ├── seed.ts                   # Main database seeder
│   ├── seed-calendar.ts          # Economic calendar seeder
│   └── migrations/               # Prisma migration files
│
├── src/
│   ├── middleware.ts              # NextAuth route protection
│   ├── app/
│   │   ├── layout.tsx            # Root layout (providers, env validation)
│   │   ├── page.tsx              # Main SPA entry (hash router)
│   │   ├── globals.css           # Global styles
│   │   ├── login/page.tsx        # Login page
│   │   └── api/                  # 23 API route groups
│   │       ├── health/route.ts
│   │       ├── dashboard/route.ts
│   │       ├── dashboard/aggregate/route.ts
│   │       ├── trades/route.ts
│   │       ├── trades/[id]/route.ts
│   │       ├── trades/[id]/close/route.ts
│   │       ├── trades/[id]/partial-close/route.ts
│   │       ├── trades/[id]/move-to-be/route.ts
│   │       ├── trades/[id]/replay/route.ts
│   │       ├── trades/[id]/notes/route.ts
│   │       ├── trades/close-all/route.ts
│   │       ├── trades/export/route.ts
│   │       ├── trades/check-sl-tp/route.ts
│   │       ├── accounts/route.ts
│   │       ├── accounts/[id]/route.ts
│   │       ├── accounts/[id]/connect/route.ts
│   │       ├── orders/route.ts
│   │       ├── orders/[id]/route.ts
│   │       ├── ai/signals/route.ts
│   │       ├── ai/analyze/route.ts
│   │       ├── ai/auto-trade/route.ts
│   │       ├── ai/evaluate/route.ts
│   │       ├── ai/quality/route.ts
│   │       ├── mt5/health/route.ts
│   │       ├── mt5/reconcile/route.ts
│   │       ├── mt5/tick/route.ts
│   │       ├── mt5/connect/route.ts
│   │       ├── mt5/account/route.ts
│   │       ├── indicators/route.ts
│   │       ├── indicators/[id]/route.ts
│   │       ├── indicators/ai-select/route.ts
│   │       ├── alerts/route.ts
│   │       ├── alerts/[id]/route.ts
│   │       ├── news/route.ts
│   │       ├── news/refresh/route.ts
│   │       ├── economic-calendar/route.ts
│   │       ├── economic-calendar/refresh/route.ts
│   │       ├── economic-calendar/check-alerts/route.ts
│   │       ├── logs/route.ts
│   │       ├── logs/cleanup/route.ts
│   │       ├── analytics/route.ts
│   │       ├── analytics/export/route.ts
│   │       ├── backtest/route.ts
│   │       ├── backtest/optimize/route.ts
│   │       ├── risk/route.ts
│   │       ├── risk/usage/route.ts
│   │       ├── risk/enforcement/route.ts
│   │       ├── users/route.ts
│   │       ├── users/[id]/route.ts
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── auth/me/route.ts
│   │       ├── auth/me/password/route.ts
│   │       ├── sessions/route.ts
│   │       ├── symbols/route.ts
│   │       ├── strategies/route.ts
│   │       ├── notifications/route.ts
│   │       ├── system/config/route.ts
│   │       ├── system/kill-switch/route.ts
│   │       ├── system/errors/route.ts
│   │       ├── system/webhook-test/route.ts
│   │       └── system/backup/route.ts
│   │
│   ├── components/
│   │   ├── panels/               # 12 dashboard panels
│   │   │   ├── dashboard-panel.tsx
│   │   │   ├── trading-panel.tsx
│   │   │   ├── analytics-panel.tsx
│   │   │   ├── indicators-panel.tsx
│   │   │   ├── ai-panel.tsx
│   │   │   ├── news-panel.tsx
│   │   │   ├── calendar-panel.tsx
│   │   │   ├── risk-panel.tsx
│   │   │   ├── alerts-panel.tsx
│   │   │   ├── logs-panel.tsx
│   │   │   ├── backtest-panel.tsx
│   │   │   └── settings-panel.tsx
│   │   ├── trading/              # Trade-specific components
│   │   │   ├── sparkline.tsx
│   │   │   └── partial-close-dialog.tsx
│   │   ├── layout/               # App shell components
│   │   │   ├── app-topbar.tsx
│   │   │   ├── app-sidebar.tsx
│   │   │   ├── app-footer.tsx
│   │   │   └── nav-config.ts
│   │   ├── ui/                   # 40+ shadcn/ui components
│   │   ├── providers.tsx         # QueryClient, ThemeProvider, SessionProvider
│   │   └── theme-toggle.tsx      # Dark/light mode toggle
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-active-account.ts # Active account selection
│   │   ├── use-auto-pilot.ts     # Auto-pilot mode (auto SL/TP check)
│   │   ├── use-mobile.ts         # Mobile viewport detection
│   │   ├── use-price-feed.ts     # Socket.IO price subscription
│   │   └── use-toast.ts          # Toast notifications
│   │
│   └── lib/                      # Server + shared utilities
│       ├── api.ts                # Base API client
│       ├── api-handler.ts        # Shared API route wrapper
│       ├── ai.ts                 # AI/LLM integration
│       ├── ai-evaluation.ts      # Signal outcome evaluation
│       ├── audit.ts              # Audit trail logging
│       ├── auth.ts               # User authentication helpers
│       ├── auth-config.ts        # NextAuth configuration
│       ├── auth-server.ts        # Server-side auth helpers
│       ├── backtest.ts           # Backtesting engine
│       ├── db.ts                 # Prisma client singleton
│       ├── db-backup.ts          # Database backup utilities
│       ├── db-transactions.ts    # Atomic DB transaction helpers
│       ├── env-validation.ts     # Environment variable validation
│       ├── equity-spark.ts       # Shared equity sparkline builder
│       ├── error-monitor.ts      # Error monitoring & reporting
│       ├── format.ts             # Number/percentage formatting
│       ├── logger.ts             # Structured logging (→ DB)
│       ├── log-cleanup.ts        # Automated log & signal retention
│       ├── market.ts             # Price simulation engine
│       ├── mt5-client.ts         # MT5 bridge HTTP client
│       ├── news-avoidance.ts     # News-based trade filtering
│       ├── rate-limit.ts         # In-memory rate limiter (30 presets)
│       ├── reconciliation.ts     # MT5 position reconciliation
│       ├── request-id.ts         # Request ID generation & tracing
│       ├── risk-enforcement.ts   # Pre-trade risk checks (8 checks)
│       ├── risk-usage.ts         # Risk usage calculation
│       ├── service-auth.ts       # Service-to-service authentication
│       ├── sessions.ts           # Trading session helpers
│       ├── strategies.ts         # Trading strategy definitions
│       ├── types.ts              # Shared TypeScript types
│       ├── utils.ts              # General utilities (cn, etc.)
│       ├── validations.ts        # Zod schemas (20+ schemas)
│       └── webhook.ts            # Webhook dispatch (Discord, Telegram, Slack)
│
├── mini-services/
│   ├── price-feed/
│   │   └── index.ts              # Socket.IO price feed server (port 3003)
│   ├── mt5-bridge/
│   │   ├── index.ts              # MT5 bridge HTTP server (port 3050)
│   │   ├── adapters/
│   │   │   ├── types.ts          # Adapter interface
│   │   │   ├── mock.ts           # Mock adapter (simulation)
│   │   │   └── real-python.ts    # Real Python/MT5 adapter
│   │   └── python/
│   │       ├── mt5_bridge.py     # Python MT5 bridge script
│   │       └── requirements.txt  # Python dependencies
│   └── sl-tp-monitor/
│       └── index.ts              # Background polling worker (no port)
│
├── scripts/
│   └── seed-auth.ts              # Auth user seeder script
│
├── tests/                        # Test suites
│   ├── validations.test.ts       # Zod schema validation tests (308 lines)
│   ├── risk-enforcement.test.ts  # Risk check tests
│   ├── trading-math.test.ts      # P&L and pip calculation tests
│   ├── market.test.ts            # Market simulation tests
│   ├── ai-evaluation.test.ts     # AI signal evaluation tests
│   ├── auth.test.ts              # Authentication tests
│   ├── db-transactions.test.ts   # Database transaction tests
│   ├── api-handler.test.ts       # API handler tests
│   ├── backtest.test.ts          # Backtesting engine tests
│   └── format.test.ts            # Formatting utility tests
│
└── docs/                         # 45+ UI screenshots
```

---

## 5. Frontend Architecture

### Single-Page Application with Hash Routing

The app renders a single HTML page (`src/app/page.tsx`) that acts as a shell. Panel switching is handled via **hash-based routing** (`#dashboard`, `#trading`, `#analytics`, etc.), avoiding full page reloads and server-side navigation.

### Panel Loading Strategy

All 12 panels use **React `lazy()` + `Suspense`** for code splitting:

```typescript
const DashboardPanel = lazy(() => import('@/components/panels/dashboard-panel'))
const TradingPanel = lazy(() => import('@/components/panels/trading-panel'))
// ... 10 more panels
```

This ensures only the active panel's JavaScript is loaded, reducing initial bundle size.

### Component Architecture

```
┌─────────────────────────────────────────────┐
│  layout.tsx                                 │
│  ┌─────────────────────────────────────────┐│
│  │  Providers (QueryClient, Theme, Session) ││
│  │  ┌───────────────────────────────────┐  ││
│  │  │  App Shell                        │  ││
│  │  │  ┌──────────┐ ┌───────────────┐  │  ││
│  │  │  │ Topbar   │ │  Sidebar Nav   │  │  ││
│  │  │  └──────────┘ └───────────────┘  │  ││
│  │  │  ┌─────────────────────────────┐ │  ││
│  │  │  │  Active Panel (lazy)       │ │  ││
│  │  │  │  ┌───────────────────────┐ │ │  ││
│  │  │  │  │ shadcn/ui Components  │ │ │  ││
│  │  │  │  │ TanStack Query Hooks  │ │ │  ││
│  │  │  │  │ Zustand State         │ │ │  ││
│  │  │  │  │ Socket.IO (prices)    │ │ │  ││
│  │  │  │  └───────────────────────┘ │ │  ││
│  │  │  └─────────────────────────────┘ │  ││
│  │  │  ┌─────────────────────────────┐ │  ││
│  │  │  │  Footer                     │ │  ││
│  │  │  └─────────────────────────────┘ │  ││
│  │  └───────────────────────────────────┘  ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### State Management

| Concern | Solution | Details |
|---------|----------|---------|
| **Server state** | TanStack Query | All API data fetched via `useQuery` / `useMutation` with caching, refetch intervals, and optimistic updates |
| **Client state** | Zustand | Active account, UI preferences, sidebar collapse, theme |
| **Auth state** | NextAuth `useSession` | Current user, role, JWT session |
| **Real-time prices** | Socket.IO hook | `usePriceFeed()` subscribes to tick events, stores in local state |
| **Form state** | React Hook Form | Managed form state with Zod schema validation |

### UI Component Library

Built on **shadcn/ui** (40+ components) using Radix UI primitives:
- `Button`, `Dialog`, `Sheet`, `Drawer`, `Tabs`, `Table`, `Select`, `Command`
- `Card`, `Badge`, `Alert`, `Toast`, `Sonner`, `Tooltip`, `Popover`
- `Sidebar`, `Resizable`, `Collapsible`, `ScrollArea`, `Calendar`
- `Form`, `Input`, `Switch`, `Checkbox`, `Slider`, `RadioGroup`

Styled with **Tailwind CSS 4** and **tailwindcss-animate** for transitions. Dark/light theme switching via **next-themes**.

---

## 6. Backend Architecture

### Next.js App Router

The backend uses Next.js App Router with **Route Handlers** (not Pages Router). Every API endpoint is a `route.ts` file exporting named HTTP method functions:

```typescript
// src/app/api/trades/route.ts
export async function GET(req: NextRequest) { /* ... */ }
export async function POST(req: NextRequest) { /* ... */ }
```

### API Route Groups (23 groups, 60+ endpoints)

| Group | Methods | Description |
|-------|---------|-------------|
| `/api/dashboard` | GET | Aggregate dashboard data (accounts, trades, signals, prices) |
| `/api/trades` | GET, POST | List/create trades |
| `/api/trades/[id]` | GET, PATCH, DELETE | Single trade CRUD |
| `/api/trades/[id]/close` | POST | Close a trade (with atomic balance update) |
| `/api/trades/[id]/partial-close` | POST | Partial close with lot reduction |
| `/api/trades/[id]/move-to-be` | POST | Move stop-loss to break-even |
| `/api/trades/[id]/replay` | POST | Replay a closed trade for analysis |
| `/api/trades/[id]/notes` | PATCH | Update trade journal notes |
| `/api/trades/close-all` | POST | Emergency close all positions |
| `/api/trades/export` | GET | Export trades as CSV |
| `/api/trades/check-sl-tp` | POST | Check and auto-close SL/TP hits |
| `/api/accounts` | GET, POST | List/create accounts |
| `/api/accounts/[id]` | GET, PATCH, DELETE | Single account CRUD |
| `/api/accounts/[id]/connect` | POST | Connect account to MT5 bridge |
| `/api/orders` | GET, POST | List/create pending orders |
| `/api/orders/[id]` | GET, DELETE | Single order management |
| `/api/ai/signals` | GET | List AI signals |
| `/api/ai/analyze` | POST | Run AI analysis on a symbol |
| `/api/ai/auto-trade` | POST | AI auto-trade (background service) |
| `/api/ai/evaluate` | POST | Evaluate signal outcomes |
| `/api/ai/quality` | GET | AI signal quality metrics |
| `/api/mt5/health` | GET | MT5 bridge health check |
| `/api/mt5/reconcile` | POST | Sync local trades with MT5 positions |
| `/api/mt5/tick` | GET | Get current tick from MT5 bridge |
| `/api/mt5/connect` | POST | Connect to MT5 broker |
| `/api/mt5/account` | GET | Get MT5 account info |
| `/api/indicators` | GET, POST | List/create indicators |
| `/api/indicators/[id]` | GET, PATCH | Single indicator management |
| `/api/indicators/ai-select` | POST | AI indicator selection |
| `/api/alerts` | GET, POST | List/create price alerts |
| `/api/alerts/[id]` | GET, PATCH, DELETE | Single alert management |
| `/api/news` | GET | List news items |
| `/api/news/refresh` | POST | Refresh news feed via AI |
| `/api/economic-calendar` | GET | List economic events |
| `/api/economic-calendar/refresh` | POST | Refresh calendar via AI |
| `/api/economic-calendar/check-alerts` | POST | Check for upcoming high-impact events |
| `/api/logs` | GET, POST, DELETE | List/create/purge logs |
| `/api/logs/cleanup` | POST | Run automated log cleanup |
| `/api/analytics` | GET | Trade analytics (win rate, PF, Sharpe, etc.) |
| `/api/analytics/export` | GET | Export analytics as CSV |
| `/api/backtest` | GET, POST | List/run backtests |
| `/api/backtest/optimize` | POST | Parameter optimization |
| `/api/risk` | GET, PATCH | Get/update risk settings |
| `/api/risk/usage` | GET | Current risk usage metrics |
| `/api/risk/enforcement` | POST | Test risk enforcement |
| `/api/users` | GET, POST | List/create users (admin) |
| `/api/users/[id]` | GET, PATCH, DELETE | User management (admin) |
| `/api/auth/[...nextauth]` | * | NextAuth handler (login, logout, callback) |
| `/api/auth/me` | GET | Current user info |
| `/api/auth/me/password` | PATCH | Change own password |
| `/api/sessions` | GET | Trading sessions (London, NY, Tokyo, etc.) |
| `/api/symbols` | GET | Supported symbols + metadata |
| `/api/strategies` | GET | Available strategies |
| `/api/notifications` | GET | List notifications |
| `/api/system/config` | GET, PATCH | System configuration |
| `/api/system/kill-switch` | POST | Emergency kill switch |
| `/api/system/errors` | GET | Recent errors |
| `/api/system/webhook-test` | POST | Test webhook delivery |
| `/api/system/backup` | GET, POST, DELETE | Database backup management |
| `/api/health` | GET | System health check (public) |

### Prisma ORM

All database access goes through Prisma Client with a singleton pattern (`src/lib/db.ts`). Key patterns:

- **Interactive transactions** (`db.$transaction()`) for trade close, partial close, and account updates
- **Conditional updates** (`updateMany` with status filter) to prevent double-close race conditions
- **Index-backed queries** on frequently filtered fields (status, symbol, accountId, level)

### Database Transactions

Critical operations use `db.$transaction()` to ensure atomicity:

```typescript
// Trade close: update trade status + update account balance
await db.$transaction(async (tx) => {
  await tx.trade.updateMany({ where: { id, status: 'open' }, data: { status: 'closed', ... } })
  await tx.account.update({ where: { id: accountId }, data: { balance: newBalance, ... } })
})
```

---

## 7. Authentication & Authorization

### Authentication Flow

```
Browser → POST /api/auth/signin (email + password)
  → NextAuth CredentialsProvider
    → bcrypt.compare(password, user.passwordHash)
      → JWT token generated (contains: id, email, name, role)
        → Session cookie set (30 day expiry)
          → Subsequent requests: cookie → JWT decode → session.user
```

### Three Roles

| Role | Permissions |
|------|------------|
| **admin** | Full access: manage users, system config, backups, kill switch, all trade operations |
| **trader** | Open/close trades, manage orders, view analytics, run backtests, manage own indicators |
| **viewer** | Read-only access: view dashboard, trades, analytics, news, logs (no mutations) |

### Protection Layers

1. **Middleware** (`src/middleware.ts`): Protects all routes except auth endpoints and public health checks. Redirects unauthenticated users to `/login` (401 JSON for API routes).

2. **Role Guards**: 10 mutating endpoints use `requireTrader(req)` or `requireAdmin(req)` helpers that check the session role:

   ```typescript
   // src/lib/auth-server.ts
   export function requireTrader(session) {
     if (session.user.role === 'viewer') return { error: 'Forbidden', status: 403 }
     return null // allowed
   }
   ```

3. **Service-to-Service Auth**: 4 background endpoints (check-sl-tp, reconcile, evaluate, backup) are excluded from NextAuth middleware but require `X-Service-Key` header matching `SERVICE_API_KEY` env var.

4. **MT5 Bridge Auth**: All MT5 bridge calls require `X-Bridge-Key` header matching `BRIDGE_API_KEY` env var.

5. **Login Rate Limiting**: In-memory per-email rate limit (5 attempts per 5 minutes) inside NextAuth's `authorize()` callback, separate from the global rate limiter.

### Session Configuration

- **Strategy**: JWT (stateless, no session table lookups)
- **Max Age**: 30 days
- **Secret**: `NEXTAUTH_SECRET` env var (≥32 chars in production, auto-generated in dev)
- **Session Table**: `UserSession` model exists for audit logging (optional)

---

## 8. Real-time Data

### Price Feed Architecture

The system uses a **dual-source** price architecture:

1. **Primary: Socket.IO Price Feed** (port 3003)
   - Dedicated mini-service broadcasting 4 symbol quotes every 1 second
   - Includes bid, ask, spread, 24h change %, 40-point sparkline
   - Trading session status every 15 seconds
   - Simulated trade events, AI signals, and news for demo purposes

2. **Fallback: Synthetic Prices** (`src/lib/market.ts`)
   - Deterministic price simulation using sine waves + noise
   - Identical formula replicated in both Next.js and price-feed service
   - Used when price-feed service is offline

3. **MT5 Bridge** (port 3050) — **for live trading only**
   - Real tick data from MetaTrader 5
   - Pluggable adapter: mock (simulation) or real-python (Windows MT5)

### Socket.IO Event Types

| Event | Interval | Payload |
|-------|----------|---------|
| `tick` | 1s | `{ symbols: SymbolQuote[], ts }` |
| `system-status` | 15s | `{ sessions, scalpingWindow, uptime, connectedClients }` |
| `trade` | 25s | Simulated trade event (demo) |
| `ai-signal` | 40s | Simulated AI signal (demo) |
| `news` | 60s | Simulated news event (demo) |
| `welcome` | On connect | Initial snapshot + current prices |

### Client-Side Integration

```typescript
// usePriceFeed hook subscribes to Socket.IO via Caddy port transform
const socket = io({ path: '/', query: { XTransformPort: '3003' } })
socket.on('tick', (data) => { updatePrices(data.symbols) })
```

---

## 9. Mini-Services

Three independent processes run alongside the Next.js server, each with a specific responsibility:

### 9.1 Price Feed Service

| Property | Value |
|----------|-------|
| **File** | `mini-services/price-feed/index.ts` |
| **Port** | 3003 |
| **Protocol** | Socket.IO (WebSocket) |
| **Runtime** | Bun |
| **Auth** | None (public, read-only) |

**Purpose**: Streams real-time price data to all connected browser clients. Uses a deterministic simulation engine that mirrors `src/lib/market.ts` exactly, ensuring consistent open/close prices between the API and the feed.

**Key Features**:
- 1-second tick broadcast for 4 pairs
- Trading session tracking (London, NY, Tokyo, Sydney, Overlap)
- Scalping window detection (7-16 UTC)
- Graceful shutdown with timer cleanup

### 9.2 MT5 Bridge Service

| Property | Value |
|----------|-------|
| **File** | `mini-services/mt5-bridge/index.ts` |
| **Port** | 3050 |
| **Protocol** | HTTP REST |
| **Runtime** | Bun |
| **Auth** | `X-Bridge-Key` header (all endpoints except `/health`) |
| **CORS** | localhost only (`localhost:3000`, `localhost:3001`, `127.0.0.1:3000`) |

**Purpose**: Abstracts all MetaTrader 5 operations behind a pluggable adapter interface. The Next.js app never talks to MT5 directly — all bridge calls go through this service.

**Endpoints**:
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health check (public) |
| POST | `/connect` | Connect to MT5 account |
| POST | `/disconnect/:login` | Disconnect from MT5 |
| GET | `/account/:login` | Get account info from MT5 |
| GET | `/tick/:symbol` | Get current tick |
| GET | `/bars/:symbol?tf=M5&count=100` | Get OHLC bars |
| GET | `/positions/:login` | Get open positions |
| POST | `/order/market` | Place market order |
| POST | `/position/:ticket/close` | Close position |
| POST | `/position/:ticket/modify` | Modify SL/TP |

**Adapters**:
- **Mock** (default): Simulated MT5 — no real broker needed, returns deterministic data
- **Real-Python**: Calls `python/mt5_bridge.py` which uses the `MetaTrader5` Python package on Windows

### 9.3 SL/TP Monitor Worker

| Property | Value |
|----------|-------|
| **File** | `mini-services/sl-tp-monitor/index.ts` |
| **Port** | None (polling worker) |
| **Protocol** | HTTP client (polls Next.js API) |
| **Runtime** | Bun |
| **Auth** | `X-Service-Key` header on all requests |

**Purpose**: Background worker that performs 5 periodic jobs independently of the browser. This ensures monitoring continues even when no user is logged in or the browser is closed.

| Job | Interval | Endpoint |
|-----|----------|----------|
| SL/TP Check | 5 seconds | `POST /api/trades/check-sl-tp` |
| MT5 Reconciliation | 30 seconds | `POST /api/mt5/reconcile` |
| AI Signal Evaluation | 5 minutes | `POST /api/ai/evaluate` |
| Database Backup | 1 hour | `POST /api/system/backup` |
| Log Cleanup | 6 hours | `POST /api/logs/cleanup` |

All requests include `X-Service-Key` for service-to-service authentication and use an 8-second timeout to prevent hangs.

---

## 10. Database Schema

The system uses **MySQL** via Prisma ORM with **15 models**:

| # | Model | Purpose | Key Fields |
|---|-------|---------|------------|
| 1 | **Account** | Trading accounts (MT5 demo/live) | `name`, `balance`, `equity`, `margin`, `freeMargin`, `connected`, `isDefault` |
| 2 | **Trade** | Open/closed positions | `symbol`, `side`, `lotSize`, `openPrice`, `closePrice`, `pnl`, `pips`, `status`, `mt5Ticket` |
| 3 | **Order** | Pending limit/stop orders | `symbol`, `side`, `orderType`, `lotSize`, `price`, `status` |
| 4 | **Indicator** | Technical indicator pool | `name`, `category`, `defaultParams`, `scalpingPreset`, `weight`, `autoManaged` |
| 5 | **NewsItem** | Forex news articles | `source`, `title`, `category`, `impact`, `sentiment`, `symbols` |
| 6 | **Alert** | Price alerts | `symbol`, `condition`, `price`, `active`, `triggered` |
| 7 | **Log** | System logs | `level`, `source`, `message`, `stack`, `context` |
| 8 | **Backtest** | Backtest results | `symbol`, `strategy`, `winRate`, `profitFactor`, `sharpeRatio`, `maxDrawdown` |
| 9 | **AiSignal** | AI-generated signals | `symbol`, `direction`, `confidence`, `action`, `reasoning`, `accuracy` |
| 10 | **AiSignalOutcome** | Signal evaluation results | `signalId` (unique), `priceAtSignal`, `priceAtEval`, `correct` |
| 11 | **RiskSetting** | Risk configuration (KV store) | `key` (unique), `value` |
| 12 | **Notification** | Email notifications | `type`, `subject`, `body`, `recipient`, `sent` |
| 13 | **SystemConfig** | System configuration (KV store) | `key` (unique), `value` |
| 14 | **User** | Authenticated users | `email` (unique), `passwordHash`, `role`, `active` |
| 15 | **UserSession** | Session audit log | `userId`, `sessionToken` (unique), `expiresAt`, `ipAddress` |
| 16 | **EconomicEvent** | Economic calendar events | `title`, `country`, `category`, `impact`, `eventTime`, `actual`, `forecast` |

### Key Relationships

```
Account 1───* Trade
Account 1───* Order
User    1───* UserSession
AiSignal 1──1 AiSignalOutcome
Trade.accountId → Account.id (onDelete: Cascade)
Order.accountId → Account.id (onDelete: Cascade)
UserSession.userId → User.id (onDelete: Cascade)
```

### Database Indexes

20+ indexes across models for query performance:
- `Trade`: accountId, symbol, status, mt5Ticket, source, openTime, (accountId, status)
- `Log`: source, (level, createdAt)
- `Alert`: symbol, active
- `Backtest`: symbol
- `AiSignal`: symbol, createdAt, action
- `AiSignalOutcome`: symbol, correct, evaluatedAt
- `NewsItem`: category, impact, publishedAt
- `Notification`: type, createdAt, recipient
- `User`: email, role
- `UserSession`: userId, expiresAt
- `EconomicEvent`: eventTime, impact, category, country

---

## 11. Security Measures

### 11.1 Rate Limiting

In-memory per-IP rate limiter with **30 presets** covering all endpoint types:

| Category | Preset | Limit | Window |
|----------|--------|-------|--------|
| Authentication | `login` | 5 requests | 60s |
| Authentication | `passwordChange` | 3 requests | 3600s |
| Trading | `tradeOpen` | 10 requests | 60s |
| Trading | `tradeClose` | 20 requests | 60s |
| Trading | `closeAll` | 3 requests | 60s |
| Trading | `tradePartialClose` | 20 requests | 60s |
| Emergency | `killSwitch` | 2 requests | 30s |
| AI | `aiAnalyze` | 5 requests | 60s |
| AI | `aiAutoTrade` | 3 requests | 60s |
| AI | `aiIndicatorSelect` | 5 requests | 60s |
| Computation | `backtestRun` | 3 requests | 60s |
| Computation | `backtestOptimize` | 2 requests | 60s |
| General | `general` | 100 requests | 60s |

Responses include standard IETF headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

Automatic cleanup of expired entries every 60 seconds prevents memory leaks.

### 11.2 Input Validation

**20+ Zod schemas** (`src/lib/validations.ts`) validate every API input:

```typescript
export const tradeCreateSchema = z.object({
  accountId: z.string().min(1),
  symbol: z.enum(['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD']),
  side: z.enum(['buy', 'sell']),
  lotSize: z.number().positive().max(100),
  stopLoss: z.number().positive().optional().nullable(),
  // ...
})
```

A shared `validateBody()` helper returns consistent 400 errors with field path and message.

### 11.3 Audit Trail

All significant actions are logged to the `Log` table via `src/lib/logger.ts`:
- Trade opens, closes, partial closes
- Risk enforcement rejections
- System config changes
- User management actions
- MT5 bridge operations

### 11.4 Environment Validation

At startup (`src/lib/env-validation.ts`):
- **Development**: Missing vars show warnings, app continues
- **Production**: Missing critical vars (`DATABASE_URL`) prevent startup
- `NEXTAUTH_SECRET` must be ≥32 chars in production

### 11.5 Request Tracing

Every API request gets a unique `X-Request-ID` (UUID) via `src/lib/request-id.ts`:
- Prefers incoming `X-Request-ID` header (from Caddy/load balancer)
- Falls back to `crypto.randomUUID()`
- Included in response headers
- Bounded in-memory timing map (max 10,000 entries) for latency tracking

### 11.6 Log & Signal Retention

Automated cleanup (`src/lib/log-cleanup.ts`):

| Level | Retention |
|-------|-----------|
| `debug` | 3 days |
| `info` | 7 days |
| `warn` | 14 days |
| `error` | 30 days |

| Signal Type | Retention |
|-------------|-----------|
| Unevaluated | 7 days |
| Evaluated | 30 days |

### 11.7 Service-to-Service Authentication

Background endpoints that bypass NextAuth middleware use `X-Service-Key` header:

```
SL/TP Monitor → POST /api/trades/check-sl-tp + X-Service-Key → Next.js
SL/TP Monitor → POST /api/mt5/reconcile + X-Service-Key → Next.js
SL/TP Monitor → POST /api/ai/evaluate + X-Service-Key → Next.js
SL/TP Monitor → POST /api/system/backup + X-Service-Key → Next.js
```

### 11.8 MT5 Bridge Security

- **Authentication**: `X-Bridge-Key` header required on all endpoints (except `/health`)
- **CORS**: Restricted to `localhost:3000`, `localhost:3001`, `127.0.0.1:3000`
- **Input validation**: Login (positive int), server (max 100 chars), symbol whitelist, lot range (0-100)

---

## 12. Risk Management

### 12.1 Pre-Trade Enforcement

Server-side risk checks in `src/lib/risk-enforcement.ts` run **before** any trade is created. All checks are server-side and cannot be bypassed from the client.

**8 checks performed in order:**

| # | Check | Description | Config Key |
|---|-------|-------------|------------|
| 1 | Master toggle | Risk enforcement on/off | `riskEnforcementEnabled` |
| 2 | Max open positions | Open positions ≤ limit | `maxOpenPositions` (default: 10) |
| 2b | Max pending orders | Pending orders ≤ 20 | Hardcoded |
| 3 | Lot size per trade | `lotSize` ≤ max | `maxLotSizePerTrade` (default: 1.0) |
| 4 | Total lot size | Existing + new ≤ max | `maxTotalLotSize` (default: 5.0) |
| 5 | Daily loss limit | Daily P&L % within limit | `dailyRiskLimitPct` (default: 2.0%) |
| 6 | Risk per trade | If SL hit, loss ≤ max % | `maxRiskPerTradePct` (default: 1.0%) |
| 7 | Free margin check | Required margin ≤ available | Calculated from lot + leverage |
| 8 | Margin level check | Equity/Margin ≥ threshold | `marginCallLevel` (default: 50%) |

If any check fails, the trade is rejected with HTTP 422 and a detailed violation message.

### 12.2 Daily Loss Circuit Breaker

When the daily loss limit is reached (`dailyPnlPct <= -dailyRiskLimitPct`), **all new trades are blocked** for the rest of the UTC day. This is checked independently via `isDailyLossCircuitBreakerActive()` and displayed in the dashboard.

### 12.3 News Avoidance

`src/lib/news-avoidance.ts` filters trades around high-impact economic events:
- Checks upcoming economic calendar events
- Blocks trade creation within configurable minutes before/after high-impact events
- Affects the 4 tracked currencies (USD, EUR, GBP, JPY)

### 12.4 Trailing Stop

Implemented in the SL/TP check loop (every 5 seconds):
- When a trade has `trailingStop: true`, the stop-loss is moved to lock in profits
- Uses `SYMBOL_BASE` pip values (not hardcoded) for accurate pip calculations
- Only trails in the profitable direction (never moves SL against the trade)
- Supports per-trade `trailingPips` configuration

### 12.5 Emergency Kill Switch

`POST /api/system/kill-switch` closes all open positions across all accounts simultaneously. Protected by:
- Admin role requirement
- Rate limit: 2 requests per 30 seconds
- Audit logging

---

## 13. Deployment

### Production Build

```bash
# Build standalone Next.js output
bun run build
# → next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/

# Start production server
bun run start
# → NODE_ENV=production bun .next/standalone/server.js
```

The `next.config.ts` uses `output: "standalone"` for a self-contained production build that includes all necessary dependencies.

### Caddy Reverse Proxy

Caddy listens on **port 81** and routes traffic based on a query parameter:

```caddyfile
:81 {
    @transform_port_query {
        query XTransformPort=*
    }
    handle @transform_port_query {
        reverse_proxy localhost:{query.XTransformPort}
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

This enables:
- Default: all HTTP requests → Next.js (port 3000)
- `?XTransformPort=3003` → Price Feed WebSocket
- `?XTransformPort=3050` → MT5 Bridge

### Service Startup Order

```bash
# 1. Start mini-services
bun mini-services/price-feed/index.ts      # Port 3003
bun mini-services/mt5-bridge/index.ts      # Port 3050
bun mini-services/sl-tp-monitor/index.ts   # No port (polling worker)

# 2. Start Next.js
bun run start                               # Port 3000

# 3. Start Caddy
caddy run                                   # Port 81
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes (prod) | `mysql://user:pass@localhost:3306/frxai` | MySQL connection string |
| `NEXTAUTH_SECRET` | Yes (prod) | Auto-generated (dev) | JWT signing secret (≥32 chars) |
| `NEXTAUTH_URL` | No | — | Canonical app URL |
| `SERVICE_API_KEY` | Recommended | Dev default | Service-to-service auth key |
| `BRIDGE_API_KEY` | Recommended | Dev default | MT5 bridge auth key |
| `MT5_ADAPTER` | No | `mock` | `mock` or `real-python` |
| `NEWSAPI_KEY` | No | — | News API key (optional) |
| `MARKETAUX_KEY` | No | — | Marketaux API key (optional) |
| `FINNHUB_KEY` | No | — | Finnhub API key (optional) |

### Process Architecture (Production)

```
┌─────────────────────────────────────────┐
│              Host Machine                │
│                                          │
│  ┌─────────┐  ┌──────────────────────┐  │
│  │  Caddy   │  │    Bun Process 1     │  │
│  │  :81     │←→│    Next.js :3000     │  │
│  └─────────┘  └──────────────────────┘  │
│                                          │
│  ┌──────────────────────┐                │
│  │    Bun Process 2     │                │
│  │    Price Feed :3003  │                │
│  └──────────────────────┘                │
│                                          │
│  ┌──────────────────────┐                │
│  │    Bun Process 3     │                │
│  │    MT5 Bridge :3050  │                │
│  └──────────────────────┘                │
│                                          │
│  ┌──────────────────────┐                │
│  │    Bun Process 4     │                │
│  │    SL/TP Monitor     │                │
│  └──────────────────────┘                │
│                                          │
│  ┌──────────────────────┐                │
│  │    MySQL Server      │                │
│  │    (port 3306)       │                │
│  └──────────────────────┘                │
└─────────────────────────────────────────┘
```

All 4 Bun processes connect to the same MySQL server. MySQL's default transaction isolation (REPEATABLE READ) and row-level locking allow concurrent reads and writes across multiple connections.