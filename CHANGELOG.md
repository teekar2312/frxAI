# Changelog

Semua perubahan penting pada proyek frxAI akan didokumentasikan di file ini.

Format ini didasarkan pada [Keep a Changelog](https://keepachangelog.com/),
dan proyek ini mematuhi [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2025-07-03

### Diubah
- **Database: SQLite → MySQL** — Provider Prisma diubah dari `sqlite` ke `mysql`
- Schema Prisma: ditambahkan `@db.Text` dan `@db.LongText` untuk field yang melebihi `VARCHAR(191)`
- `src/lib/db-backup.ts` di-rewrite lengkap: file copy → `mysqldump`
- `src/lib/api-handler.ts` dan `src/lib/env-validation.ts` diperbarui untuk MySQL
- `.env.example` format `DATABASE_URL` diubah ke `mysql://user:pass@host:3306/dbname`
- SQLite migrations dihapus (gunakan `prisma db push` untuk MySQL)

### Ditambahkan
- `mysql2@3.22.5` sebagai MySQL driver untuk Prisma
- `serverExternalPackages` di `next.config.ts` agar Prisma tidak di-bundle oleh Turbopack
- `predev` script agar `prisma generate` otomatis sebelum dev server
- `postinstall` script untuk auto `prisma generate` saat `bun install`
- `scripts/fresh-setup.js` — cross-platform fresh install script
- `fresh-setup.bat` — one-click Windows setup (double-click)
- `setup` dan `dev:fresh` npm scripts
- Prisma generated client output ke `src/generated/prisma/` (gitignored)
- `DEPLOYMENT.md` — panduan deployment production
- `SECURITY.md` — kebijakan keamanan dan vulnerability reporting
- `CONTRIBUTING.md` — panduan kontribusi dan coding standards

### Diperbaiki
- Prisma client hash mismatch error pada Windows/Turbopack (`Cannot find module @prisma/client-xxx`)
- Prisma version pinned ke `6.19.2` untuk mencegah hash mismatch antar environment
- DB cache version bumped ke `v3` untuk force fresh PrismaClient

## [1.1.1] - 2025-07-02

### Ditambahkan
- Role guard (`requireTrader` / `requireAdmin`) pada 10 endpoint yang melakukan mutasi data untuk mencegah akses tidak sah berdasarkan peran pengguna
- Field `mt5` pada tipe `DashboardData` untuk menampilkan status koneksi MT5 bridge
- Audit setelah penulisan system config untuk memastikan integritas konfigurasi
- Type coercion untuk field numerik pada `Account PATCH` agar konsisten dengan tipe database

### Diubah
- Konfigurasi build: dihapus `ignoreBuildErrors: true` dari `next.config.ts` agar semua error TypeScript terdeteksi saat build
- Konsistensi pemanggilan `validateBody` pada 4 file API route
- Setting risk `PATCH` dibungkus dalam `db.$transaction()` untuk menjaga konsistensi data
- Perhitungan free margin diperbaiki menggunakan formula `equity - remaining margin`
- Perhitungan margin decrement pada partial close diperbaiki
- Tipe Prisma Date dibuat kompatibel dengan `string | Date` untuk mencegah type mismatch
- Semua cast `as any` dihapus dari dashboard route untuk meningkatkan type safety
- Fungsi `buildEquitySpark` dideduplikasi menjadi shared utility
- Nilai pip hardcoded pada trailing stop diperbaiki dengan mengimpor `SYMBOL_BASE` dari types
- Tipe Prisma yang proper digunakan pada `db-transactions.ts`
- Semua `Record<string, any>` diganti menjadi `Record<string, unknown>` untuk keamanan tipe

### Diperbaiki
- Port health check MT5 bridge diperbaiki dari `3002` ke `3050` sesuai port aktual layanan

### Dihapus
- Dead code `atomicOpenTrade` dan `atomicCreateAccountWithTrade` dihapus karena tidak digunakan

## [1.1.0] - 2025-07-01

### Ditambahkan
- Validasi environment variable saat startup melalui `src/lib/env-validation.ts` (development: warning, production: error)
- Request ID tracing pada setiap API request menggunakan header `X-Request-ID` + UUID (`src/lib/request-id.ts`)
- Enhanced health check endpoint (`/api/health`) yang mencakup DB latency, jumlah log, jumlah error, dan status 3 mini-service
- 5 database index baru untuk meningkatkan performa query
- Validasi input pada endpoint MT5 bridge

### Diubah
- `NEXTAUTH_SECRET`: dihapus hardcoded value, production memerlukan ≥32 karakter, development auto-generate random secret
- Pembuatan trade dan update margin dibungkus dalam `db.$transaction()` untuk menjamin atomicity
- AI auto-trade menggunakan transaction safety untuk mencegah inkonsistensi data
- Retensi log bersifat tiered: debug (3 hari), info (7 hari), warn (14 hari), error (30 hari)
- Automated signal cleanup: evaluated (30 hari), unevaluated (7 hari)

### Keamanan
- Service-to-service auth menggunakan header `X-Service-Key` pada 4 endpoint background (check-sl-tp, reconcile, evaluate, backup)
- MT5 bridge auth menggunakan header `X-Bridge-Key` pada semua pemanggilan bridge
- CORS restriction pada MT5 bridge dibatasi hanya untuk localhost

## [1.0.1] - 2025-06-30

### Ditambahkan
- 10 schema validasi Zod untuk seluruh endpoint API (`src/lib/validations.ts`)
- 12 preset rate limiting untuk berbagai operasi (`src/lib/rate-limit.ts`)
- Rate limiting + `try/catch` error handling pada 15 API route
- 308 baris test case untuk validasi input (`tests/validations.test.ts`)

### Keamanan
- Rate limit per-IP untuk mencegah brute force (login: 5/menit, kill switch: 2/30detik)
- Rate limit untuk operasi AI yang mahal (analyze: 5/menit, auto-trade: 3/menit)
- Rate limit untuk operasi komputasi berat (backtest: 3/menit, optimize: 2/menit)
- Standard IETF rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)

## [1.0.0] - 2025-06-30

### Ditambahkan
- File `.gitignore` untuk mengecualikan file yang tidak perlu di-track
- `README.md` dengan dokumentasi proyek
- `LICENSE` (MIT) untuk lisensi open source
- GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml`) untuk otomasi build dan test
- 45 screenshot dokumentasi dipindahkan ke direktori `docs/`
- `package.json` di-rename menjadi `frxai` v1.0.0

[1.2.0]: https://github.com/teekar2312/frxAI/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/teekar2312/frxAI/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/teekar2312/frxAI/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/teekar2312/frxAI/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/teekar2312/frxAI/releases/tag/v1.0.0