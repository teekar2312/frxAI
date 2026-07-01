# frxAI — FinexFX AI Trading System

AI-powered Forex trading dashboard dengan analisis teknikal otomatis, news sentiment, backtesting, dan integrasi MetaTrader 5.

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Fitur Utama

| # | Fitur | Deskripsi |
|---|-------|-----------|
| 1 | **Trading Panel** | Eksekusi buy/sell dengan SL, TP, trailing stop, dan partial close |
| 2 | **AI Analysis** | Sinyal trading berbasis LLM dengan evaluasi akurasi real-time |
| 3 | **Auto-Pilot** | Mode trading otomatis yang dikendalikan AI |
| 4 | **Technical Indicators** | Pool 30+ indikator teknikal (trend, oscillator, volume, volatility, channel, regression) |
| 5 | **Market News** | Feed berita dengan sentiment analysis (Finnhub, MARKETAUX, atau LLM-synthesized) |
| 6 | **Economic Calendar** | Kalender event ekonomi berdampak tinggi (NFP, CPI, GDP, dll.) |
| 7 | **Risk Management** | 8 pre-trade checks, daily circuit breaker, news avoidance, kill switch |
| 8 | **Backtesting** | Uji strategi trading pada data historis dengan equity curve |
| 9 | **Analytics** | Dashboard statistik, equity curve, P&L by pair/session/source, trade journal |
| 10 | **Price Alerts** | Notifikasi saat harga menyentuh level tertentu (above/below/cross) |
| 11 | **Multi-Account** | Dukungan beberapa akun MT5 (demo/live) dengan switching |
| 12 | **Real-time Price Feed** | Harga real-time via WebSocket (Socket.IO) |
| 13 | **Webhook Notifications** | Discord, Telegram, Slack |
| 14 | **Role-Based Access** | 3 roles: admin (full), trader (trade ops), viewer (read-only) |
| 15 | **Dark/Light Theme** | Tema gelap (default) dan terang |
| 16 | **Responsive** | Mendukung desktop dan mobile |

## Tech Stack

| Kategori | Teknologi | Versi |
|----------|-----------|-------|
| Framework | Next.js (App Router) | 16 |
| UI | React | 19 |
| Styling | Tailwind CSS + shadcn/ui | 4 |
| Bahasa | TypeScript | 5 |
| Database | MySQL + Prisma ORM | 8 / 6 |
| Runtime | Bun | latest |
| Auth | NextAuth.js (JWT) | v4 |
| State | Zustand (client) + TanStack Query (server) | 5 / 5 |
| Charts | Recharts | 2 |
| Animasi | Framer Motion | 12 |
| Real-time | Socket.IO Client | 4 |
| AI | z-ai-web-dev-sdk (LLM) | 0.0.18 |
| Validation | Zod | 4 |
| Forms | React Hook Form | 7 |
| Icons | Lucide React | 0.525 |
| Proxy | Caddy (reverse proxy) | — |

## Screenshots

### Login
![Login](docs/r5-login.png)

### Dashboard Overview
![Dashboard](docs/r5-dashboard.png)

### Live Trading
![Trading](docs/r5-trading.png)

### AI Analysis
![AI Analysis](docs/r5-ai.png)

### Economic Calendar
![Calendar](docs/r5-calendar.png)

### Market News
![News](docs/r5-news.png)

### Trade Analytics
![Analytics](docs/r5-analytics.png)

### Technical Indicators
![Indicators](docs/r5-indicators.png)

### Backtesting
![Backtest](docs/r5-backtest.png)

### Risk Management
![Risk](docs/r5-risk.png)

### Price Alerts
![Alerts](docs/r5-alerts.png)

### System Logs
![Logs](docs/r5-logs.png)

### Settings
![Settings](docs/r5-settings.png)

## Quick Start

### Prasyarat

- [Bun](https://bun.sh/) v1.3+
- [MySQL](https://dev.mysql.com/downloads/) 8.0+ (atau MariaDB 10.5+)
- [Git](https://git-scm.com/)

### Instalasi

```bash
# 1. Clone repository
git clone https://github.com/teekar2312/frxAI.git
cd frxAI

# 2. Install dependencies
bun install

# 3. Setup environment
cp .env.example .env
# Edit .env — set DATABASE_URL ke MySQL connection string Anda

# 4. Buat database di MySQL
mysql -u root -p -e "CREATE DATABASE frxai;"

# 5. Push schema ke database
bun run db:push

# 6. Seed user admin default
bun run seed:auth
# Default: admin@finexfx.local / admin123

# 7. Jalankan development server
bun run dev
```

Buka `http://localhost:3000` di browser.

### Fresh Setup (Jika Ada Masalah)

Jika mengalami error Prisma setelah pull, jalankan:

```bash
# Linux / macOS
node scripts/fresh-setup.js

# Windows — double-click file ini di Explorer:
fresh-setup.bat
```

Script ini menghapus `node_modules`, `.next`, dan `src/generated`, lalu menginstall ulang dan push schema ke MySQL.

### Mini-Services (Opsional)

```bash
# Price feed service (port 3003)
cd mini-services/price-feed && bun install && bun --hot index.ts

# SL/TP monitor service (port 3004)
cd mini-services/sl-tp-monitor && bun install && bun --hot index.ts

# MT5 bridge (port 3050 — memerlukan Python & MetaTrader 5)
cd mini-services/mt5-bridge && bun install
# Lihat mini-services/mt5-bridge/README.md untuk detail deployment
```

## Environment Variables

| Variable | Required | Deskripsi | Default |
|----------|----------|-----------|---------|
| `DATABASE_URL` | Ya | MySQL connection string | `mysql://root:password@localhost:3306/frxai` |
| `NEXTAUTH_SECRET` | Prod | JWT secret (≥32 chars) | Auto-generated di dev |
| `NEXTAUTH_URL` | Prod | Callback URL | `http://localhost:3000` |
| `SERVICE_API_KEY` | Prod | Key untuk background service endpoints | — |
| `BRIDGE_API_KEY` | Prod | Key untuk MT5 bridge komunikasi | — |
| `MT5_ADAPTER` | Tidak | `mock` atau `real-python` | `mock` |
| `MT5_PYTHON_BRIDGE_URL` | Tidak | URL Python MT5 bridge | — |
| `MT5_LOGIN` | Tidak | MT5 account login | — |
| `MT5_PASSWORD` | Tidak | MT5 account password | — |
| `MT5_SERVER` | Tidak | MT5 server name | — |
| `NEWSAPI_KEY` | Tidak | NewsAPI.io key | — |
| `MARKETAUX_KEY` | Tidak | MarketAux API key | — |
| `FINNHUB_KEY` | Tidak | Finnhub API key | — |
| `DISCORD_WEBHOOK_URL` | Tidak | Discord webhook URL | — |
| `TELEGRAM_BOT_TOKEN` | Tidak | Telegram bot token | — |
| `TELEGRAM_CHAT_ID` | Tidak | Telegram chat ID | — |
| `SLACK_WEBHOOK_URL` | Tidak | Slack webhook URL | — |

## Database Models

| Model | Deskripsi |
|-------|-----------|
| `Account` | Akun trading MT5 (demo/live), balance, equity, margin |
| `Trade` | Posisi terbuka/tertutup, PnL, pips, MT5 ticket |
| `Order` | Pending orders (limit/stop) |
| `Indicator` | Pool 30+ indikator teknikal dengan preset scalping |
| `NewsItem` | Feed berita pasar (category, impact, sentiment) |
| `Alert` | Price alerts dengan kondisi & notifikasi |
| `Log` | System logs (info, warn, error, debug) — tiered retention |
| `Backtest` | Hasil backtesting (equity curve, win rate, Sharpe, dll.) |
| `AiSignal` | Sinyal trading dari AI (direction, confidence, reasoning) |
| `AiSignalOutcome` | Evaluasi akurasi sinyal AI |
| `RiskSetting` | Pengaturan risiko (key-value) |
| `Notification` | Riwayat notifikasi (trade, alert, risk, system, news) |
| `SystemConfig` | Konfigurasi sistem (key-value) |
| `User` | Pengguna dengan role-based access (admin/trader/viewer) |
| `UserSession` | Sesi login untuk audit trail |
| `EconomicEvent` | Event ekonomi berdampak (NFP, CPI, GDP, dll.) |

## Scripts

| Command | Deskripsi |
|---------|-----------|
| `bun run dev` | Jalankan development server (port 3000), auto `prisma generate` |
| `bun run build` | Build untuk production (standalone) |
| `bun run start` | Jalankan production server |
| `bun run lint` | ESLint check |
| `bun run test` | Jalankan unit tests |
| `bun run setup` | Fresh install — hapus node_modules/.next, reinstall, push schema |
| `bun run dev:fresh` | Fresh install + langsung jalankan dev server |
| `bun run db:push` | Push schema ke database MySQL |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:migrate` | Jalankan migration |
| `bun run db:reset` | Reset database |
| `bun run seed:auth` | Seed user admin default |

## Dokumentasi

| Dokumen | Path | Deskripsi |
|---------|------|-----------|
| **Architecture** | [ARCHITECTURE.md](ARCHITECTURE.md) | Arsitektur sistem, stack, keamanan, deployment |
| **API Reference** | [docs/API.md](docs/API.md) | 65+ endpoint API dengan request/response schema |
| **Changelog** | [CHANGELOG.md](CHANGELOG.md) | Riwayat perubahan per versi |
| **Deployment** | [DEPLOYMENT.md](DEPLOYMENT.md) | Panduan deployment production (Docker, VPS, CI/CD) |
| **Security** | [SECURITY.md](SECURITY.md) | Kebijakan keamanan dan vulnerability reporting |
| **Contributing** | [CONTRIBUTING.md](CONTRIBUTING.md) | Panduan kontribusi dan coding standards |
| **MT5 Bridge** | [mini-services/mt5-bridge/README.md](mini-services/mt5-bridge/README.md) | Arsitektur & API reference MT5 bridge |

## Caddy Reverse Proxy

Repository ini menggunakan Caddy sebagai reverse proxy dengan fitur port-based routing via query parameter `XTransformPort`:

```
GET /api/price?XTransformPort=3003  →  localhost:3003 (price-feed)
GET /api/sl-tp?XTransformPort=3004  →  localhost:3004 (sl-tp-monitor)
GET /api/mt5?XTransformPort=3050    →  localhost:3050 (mt5-bridge)
GET /                               →  localhost:3000 (Next.js, default)
```

## Keamanan

- **Authentication**: NextAuth.js v4 (JWT, credentials provider, bcrypt password hashing)
- **Authorization**: 3 roles (admin/trader/viewer) dengan role guards di semua mutating endpoints
- **Rate Limiting**: 12 preset rate limit (per IP, in-memory) di semua API endpoints
- **Input Validation**: 10+ Zod schemas untuk semua input API
- **Service-to-Service Auth**: `X-Service-Key` header untuk background service endpoints
- **MT5 Bridge Auth**: `X-Bridge-Key` header untuk semua MT5 bridge calls
- **CORS**: MT5 bridge restricted ke localhost origins
- **Audit Trail**: Semua operasi sensitif di-log ke database
- **Request Tracing**: `X-Request-ID` header + UUID untuk end-to-end tracing
- **Log Retention**: Tiered cleanup (debug:3d, info:7d, warn:14d, error:30d)
- **Env Validation**: Startup check untuk required env vars

Lihat [SECURITY.md](SECURITY.md) untuk detail lengkap.

## Kontribusi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan kontribusi, coding standards, dan pull request process.

## Lisensi

[MIT](LICENSE)