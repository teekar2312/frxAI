# frxAI — Deployment Guide

> AI-powered Forex trading dashboard. Next.js 16 App Router · MySQL 8+ · Bun · Prisma 6 · Caddy

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Quick Deploy](#3-quick-deploy)
4. [Production Build](#4-production-build)
5. [Mini-Services](#5-mini-services)
6. [Caddy Configuration](#6-caddy-configuration)
7. [Docker Deployment](#7-docker-deployment)
8. [Systemd Service](#8-systemd-service)
9. [Database Migrations](#9-database-migrations)
10. [Database Backups](#10-database-backups)
11. [Monitoring](#11-monitoring)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

| Dependency | Minimum Version | Purpose |
|---|---|---|
| **MySQL** | 8.0+ | Primary database (via Prisma ORM) |
| **Bun** | 1.0+ | JavaScript runtime & package manager |
| **Node.js** | 20 LTS+ | Fallback runtime (if Bun is unavailable) |
| **Caddy** | 2.7+ | Reverse proxy & automatic TLS |
| **Git** | 2.x | Source control |
| **curl** | latest | Health checks & API testing |

### Install Bun (if not already installed)

```bash
curl -fsSL https://bun.sh/install | bash
```

### Verify installations

```bash
bun --version
mysql --version
caddy version
node --version
```

---

## 2. Environment Setup

### 2.1 Clone the repository

```bash
git clone <repo-url> /home/z/frxAI-fix
cd /home/z/frxAI-fix
bun install
```

### 2.2 Create `.env` file

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

#### Required `.env` variables

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL="mysql://frxai_user:your_secure_password@127.0.0.1:3306/frxai_db"

# ── NextAuth ──────────────────────────────────────────────
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="<generate-with-openssl-rand-base64-32>"

# ── Mini-Services ─────────────────────────────────────────
MT5_BRIDGE_URL="http://127.0.0.1:3050"
PRICE_FEED_URL="http://127.0.0.1:3003"
SL_TP_MONITOR_URL="http://127.0.0.1:3004"

# ── App ───────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL="https://your-domain.com"
NODE_ENV="production"
```

#### Generate a NextAuth secret

```bash
openssl rand -base64 32
```

### 2.3 Create the MySQL database and user

```sql
-- Log into MySQL as root
mysql -u root -p

-- Create database and user
CREATE DATABASE frxai_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'frxai_user'@'127.0.0.1' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON frxai_db.* TO 'frxai_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

#### DATABASE_URL format

```
mysql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>
```

| Component | Example | Notes |
|---|---|---|
| `USER` | `frxai_user` | MySQL user with full privileges on the database |
| `PASSWORD` | `s3cur3P@ss!` | URL-encode special characters (e.g. `#` → `%23`) |
| `HOST` | `127.0.0.1` | Use `127.0.0.1` not `localhost` to force TCP (Prisma requirement) |
| `PORT` | `3306` | Default MySQL port |
| `DATABASE` | `frxai_db` | Database name must already exist |

> **Important:** Always use `127.0.0.1` instead of `localhost` in `DATABASE_URL`. Prisma's MySQL connector connects over TCP; using `localhost` may cause it to attempt a Unix socket connection which can fail.

---

## 3. Quick Deploy

### 3.1 Development

```bash
cd /home/z/frxAI-fix

# First-time setup: installs deps + pushes DB schema + seeds data
bun run setup

# Start with a fresh database (drops & re-creates all tables)
bun run dev:fresh

# Normal development (hot-reload, preserves data)
bun run dev
```

The dev server starts at `http://localhost:3000`.

### 3.2 Production

```bash
cd /home/z/frxAI-fix

# 1. Install dependencies
bun install

# 2. Push database schema (first time only; see §9 for migrations)
bunx prisma db push

# 3. Build for production
bun run build

# 4. Start the production server
bun run start
```

The production server starts at `http://localhost:3000`.

---

## 4. Production Build

### 4.1 Build command

```bash
bun run build
```

### 4.2 Standalone output mode

frxAI uses Next.js **standalone** output. This produces a self-contained build that includes only the necessary files for production — no `node_modules` required at runtime.

The standalone build is output to:

```
/home/z/frxAI-fix/.next/standalone/
```

### 4.3 Key `next.config` settings

```js
// next.config.ts (or next.config.mjs)
{
  output: "standalone",
}
```

### 4.4 Run the production server

```bash
# From the project root (recommended)
bun run start

# Or directly via the standalone server
PORT=3000 node /home/z/frxAI-fix/.next/standalone/server.js
```

The standalone server:
- Serves the Next.js app on the specified port (default `3000`)
- Does **not** require the full `node_modules` — only the standalone output
- Requires the `.next/static` directory to be copied or symlinked for static assets:

```bash
cp -r .next/static .next/standalone/.next/static
```

### 4.5 Environment variables at runtime

The standalone build reads environment variables at **runtime** from `.env` in the working directory (or system environment). No rebuild is needed when changing non-build-time variables like `DATABASE_URL` or `NEXTAUTH_SECRET`.

---

## 5. Mini-Services

frxAI depends on three external mini-services that must run alongside the main Next.js app.

### 5.1 Service overview

| Service | Port | Purpose |
|---|---|---|
| **mt5-bridge** | `3050` | Bridges communication with MetaTrader 5 terminal |
| **price-feed** | `3003` | Streams real-time Forex price data |
| **sl-tp-monitor** | `3004` | Monitors stop-loss and take-profit levels |

### 5.2 Starting mt5-bridge (port 3050)

```bash
cd /path/to/mt5-bridge
bun run start
# or
node index.js
```

Verify it is running:

```bash
curl -s http://127.0.0.1:3050/health
```

### 5.3 Starting price-feed (port 3003)

```bash
cd /path/to/price-feed
bun run start
# or
node index.js
```

Verify it is running:

```bash
curl -s http://127.0.0.1:3003/health
```

### 5.4 Starting sl-tp-monitor (port 3004)

```bash
cd /path/to/sl-tp-monitor
bun run start
# or
node index.js
```

Verify it is running:

```bash
curl -s http://127.0.0.1:3004/health
```

### 5.5 Configure URLs in `.env`

Ensure the main Next.js app can reach each service:

```env
MT5_BRIDGE_URL="http://127.0.0.1:3050"
PRICE_FEED_URL="http://127.0.0.1:3003"
SL_TP_MONITOR_URL="http://127.0.0.1:3004"
```

If the mini-services run on a different host, replace `127.0.0.1` with the appropriate IP or hostname.

---

## 6. Caddy Configuration

frxAI uses **Caddy** as a reverse proxy. The app uses a custom `XTransformPort` query parameter for routing requests to the correct mini-service.

### 6.1 Basic Caddyfile

```
your-domain.com {
    # Main Next.js application
    reverse_proxy / 127.0.0.1:3000

    # Mini-service routing via XTransformPort query parameter
    # Requests containing ?XTransformPort=3050 → mt5-bridge
    reverse_proxy /api/mt5/* 127.0.0.1:3050
    reverse_proxy /api/price/* 127.0.0.1:3003
    reverse_proxy /api/sl-tp/* 127.0.0.1:3004

    # Static files & Next.js internals
    reverse_proxy /_next/* 127.0.0.1:3000
}
```

### 6.2 Advanced Caddyfile with XTransformPort routing

If the app routes traffic through a single domain using the `XTransformPort` query parameter, Caddy can inspect and rewrite:

```
your-domain.com {
    encode gzip

    # Default: proxy everything to Next.js
    reverse_proxy 127.0.0.1:3000 {
        # Pass through XTransformPort to the upstream
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

In this setup, the Next.js API routes internally forward requests to mini-services based on the `XTransformPort` parameter. The client makes all requests to a single origin.

### 6.3 Start / reload Caddy

```bash
# Validate configuration
caddy validate --config /etc/caddy/Caddyfile

# Start Caddy (foreground, for testing)
caddy run --config /etc/caddy/Caddyfile

# Reload after config changes (zero downtime)
caddy reload --config /etc/caddy/Caddyfile
```

### 6.4 TLS

Caddy automatically provisions and renews TLS certificates via Let's Encrypt. No manual certificate management is required. Ensure your domain's DNS A record points to the server's public IP and port `80`/`443` are open.

---

## 7. Docker Deployment

### 7.1 Dockerfile

Create `Dockerfile` in the project root:

```dockerfile
# ── Stage 1: Dependencies ────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Build Next.js (standalone output)
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── Stage 3: Production ──────────────────────────────────
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static    ./.next/static
COPY --from=builder /app/public          ./public

# Copy Prisma schema for runtime migrations if needed
COPY --from=builder /app/prisma          ./prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "run", "server.js"]
```

### 7.2 docker-compose.yml

Create `docker-compose.yml` in the project root:

```yaml
version: "3.9"

services:
  # ── MySQL 8.0 ──────────────────────────────────────────
  db:
    image: mysql:8.0
    container_name: frxai-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root_secret_change_me}
      MYSQL_DATABASE: frxai_db
      MYSQL_USER: frxai_user
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-frxai_secret_change_me}
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ── Next.js App ────────────────────────────────────────
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: frxai-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: mysql://frxai_user:${MYSQL_PASSWORD:-frxai_secret_change_me}@db:3306/frxai_db
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-change_me_generate_with_openssl}
      MT5_BRIDGE_URL: ${MT5_BRIDGE_URL:-http://host.docker.internal:3050}
      PRICE_FEED_URL: ${PRICE_FEED_URL:-http://host.docker.internal:3003}
      SL_TP_MONITOR_URL: ${SL_TP_MONITOR_URL:-http://host.docker.internal:3004}
      NODE_ENV: production
    depends_on:
      db:
        condition: service_healthy

volumes:
  mysql_data:
```

### 7.3 Docker commands

```bash
# Build and start everything
docker compose up -d --build

# View logs
docker compose logs -f app

# Run database migrations inside the app container
docker compose exec app bunx prisma db push

# Stop everything
docker compose down

# Stop and remove volumes (⚠️ deletes database data)
docker compose down -v
```

### 7.4 Connecting mini-services from Docker

Mini-services running on the **host** machine are accessible from Docker containers via `host.docker.internal`. Configure the `.env` accordingly:

```env
MT5_BRIDGE_URL="http://host.docker.internal:3050"
PRICE_FEED_URL="http://host.docker.internal:3003"
SL_TP_MONITOR_URL="http://host.docker.internal:3004"
```

> On Linux, `host.docker.internal` may not be available by default. Add this to your `docker-compose.yml` under the `app` service:
> ```yaml
> extra_hosts:
>   - "host.docker.internal:host-gateway"
> ```

---

## 8. Systemd Service

Create a systemd unit file to manage the frxAI Next.js process as a system service.

### 8.1 Unit file

Create `/etc/systemd/system/frxai.service`:

```ini
[Unit]
Description=frxAI - AI-powered Forex Trading Dashboard
After=network.target mysql.service

[Service]
Type=simple
User=z
Group=z
WorkingDirectory=/home/z/frxAI-fix
EnvironmentFile=/home/z/frxAI-fix/.env
ExecStart=/home/z/.bun/bin/bun run start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=frxai

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/z/frxAI-fix/.next

# Log rotation is handled by journald (see §11)
[Install]
WantedBy=multi-user.target
```

### 8.2 Management commands

```bash
# Reload systemd after editing the unit file
sudo systemctl daemon-reload

# Enable to start on boot
sudo systemctl enable frxai

# Start the service
sudo systemctl start frxai

# Check status
sudo systemctl status frxai

# View logs
sudo journalctl -u frxai -f

# Restart after a deployment
sudo systemctl restart frxai

# Stop the service
sudo systemctl stop frxai
```

---

## 9. Database Migrations

frxAI uses [Prisma ORM 6.19.2](https://www.prisma.io/) for database management. There are two approaches: `db push` (prototyping/development) and `migrate` (production-safe).

### 9.1 `prisma db push` — Quick prototyping

Synchronizes the Prisma schema with the database **without** generating migration files. Ideal for development.

```bash
# Push schema changes to the database
bunx prisma db push

# Push and also reset the database (drops & recreates all data)
bunx prisma db push --force-reset
```

**Use cases:**
- Local development and rapid iteration
- Initial database creation
- When you don't need a migration history

**Caveats:**
- No migration history is stored — you cannot roll back
- Not recommended for production if you need to track schema changes

### 9.2 `prisma migrate` — Production-safe migrations

Creates numbered, tracked migration SQL files that can be version-controlled and applied deterministically.

```bash
# Create a new migration (name it descriptively)
bunx prisma migrate dev --name add_user_preferences

# Apply all pending migrations in production
bunx prisma migrate deploy
```

**Use cases:**
- Production deployments where schema changes must be tracked
- Team environments where migrations are reviewed before applying
- When you need to roll back to a previous schema version

**Recommended production workflow:**

```bash
# 1. Developer creates migration locally
bunx prisma migrate dev --name describe_the_change

# 2. Commit the generated migration files in prisma/migrations/
git add prisma/migrations/
git commit -m "Add migration: describe_the_change"

# 3. On the production server, pull and deploy
git pull origin main
bunx prisma migrate deploy   # applies only new, pending migrations
sudo systemctl restart frxai
```

### 9.3 Generating the Prisma client

After any schema change, regenerate the client:

```bash
bunx prisma generate
```

This is automatically run during `bun run build` and `bun run setup`.

### 9.4 Viewing the database

```bash
# Open Prisma Studio (web-based DB browser)
bunx prisma studio
```

---

## 10. Database Backups

### 10.1 Manual backup with `mysqldump`

```bash
# Full database backup
mysqldump -u frxai_user -p frxai_db > /home/z/backups/frxai_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup (recommended for large databases)
mysqldump -u frxai_user -p frxai_db | gzip > /home/z/backups/frxai_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 10.2 Restore from backup

```bash
# From a plain SQL dump
mysql -u frxai_user -p frxai_db < /home/z/backups/frxai_20250101_120000.sql

# From a compressed dump
gunzip < /home/z/backups/frxai_20250101_120000.sql.gz | mysql -u frxai_user -p frxai_db
```

### 10.3 Automated daily backup (cron)

```bash
# Edit crontab
crontab -e
```

Add the following line to run a compressed backup every day at 2:00 AM:

```cron
0 2 * * * mysqldump -u frxai_user -p'your_secure_password' --single-transaction --routines --triggers frxai_db | gzip > /home/z/backups/frxai_$(date +\%Y\%m\%d_\%H\%M\%S).sql.gz
```

> **Note:** In crontab, the `%` character must be escaped as `\%`. The `--single-transaction` flag ensures a consistent snapshot without locking tables.

### 10.4 Backup retention policy

To automatically remove backups older than 30 days, add a second cron entry:

```cron
0 3 * * * find /home/z/backups -name "frxai_*.sql.gz" -mtime +30 -delete
```

### 10.5 Ensure backup directory exists

```bash
mkdir -p /home/z/backups
chmod 700 /home/z/backups
```

---

## 11. Monitoring

### 11.1 Health check endpoint

frxAI exposes a health check endpoint:

```bash
curl -s http://127.0.0.1:3000/api/health | jq
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 86400
}
```

Use this endpoint with external monitoring tools (Uptime Kuma, Prometheus, Datadog, etc.) to alert on downtime.

### 11.2 Caddy health check (external)

To verify the full stack from outside:

```bash
curl -sf https://your-domain.com/api/health | jq
```

### 11.3 Log retention policies

#### Application logs (systemd / journald)

Configure journald to limit log disk usage. Edit `/etc/systemd/journald.conf`:

```ini
[Journal]
SystemMaxUse=500M
MaxRetentionSec=30day
Compress=yes
```

Then restart journald:

```bash
sudo systemctl restart systemd-journald
```

#### Docker logs

If using Docker, limit log sizes in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

Restart Docker after editing:

```bash
sudo systemctl restart docker
```

#### Caddy access logs

Caddy logs are managed by journald as well when running as a systemd service. Apply the same retention policy above.

---

## 12. Troubleshooting

### 12.1 Prisma client hash mismatch

**Error:**
```
The Prisma Client version in @prisma/client differs from the version of the generated Prisma Client.
```

**Cause:** The `@prisma/client` package version does not match the generated client (often after a `bun install` or schema change without regenerating).

**Fix:**

```bash
# Regenerate the Prisma client
bunx prisma generate

# If the issue persists, clear caches and reinstall
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma
bun install
bunx prisma generate

# For production: rebuild
bun run build
sudo systemctl restart frxai
```

---

### 12.2 MySQL connection errors

**Error:**
```
Error: P1001: Can't reach database server at `127.0.0.1:3306`
```

**Fixes:**

1. **MySQL is not running:**
   ```bash
   sudo systemctl status mysql
   sudo systemctl start mysql
   ```

2. **Wrong host in `DATABASE_URL`:**
   - Use `127.0.0.1` instead of `localhost` (Prisma requires TCP connection).
   - Check your `.env`:
     ```env
     # Correct
     DATABASE_URL="mysql://frxai_user:password@127.0.0.1:3306/frxai_db"
     # Wrong (may try Unix socket)
     DATABASE_URL="mysql://frxai_user:password@localhost:3306/frxai_db"
     ```

3. **Incorrect credentials or database name:**
   ```bash
   # Test the connection manually
   mysql -u frxai_user -p -h 127.0.0.1 frxai_db
   ```

4. **MySQL not listening on TCP:**
   Check `/etc/mysql/mysql.conf.d/mysqld.cnf`:
   ```ini
   bind-address = 127.0.0.1
   ```

---

**Error:**
```
Error: P1045: Access denied for user 'frxai_user'@'127.0.0.1'
```

**Fix:** Reset the user's password:
```sql
mysql -u root -p
ALTER USER 'frxai_user'@'127.0.0.1' IDENTIFIED BY 'new_password';
FLUSH PRIVILEGES;
```

---

### 12.3 Port conflicts

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Find the process using the port:**
```bash
# Using lsof
lsof -i :3000

# Using ss
ss -tlnp | grep 3000
```

**Kill the conflicting process:**
```bash
kill -9 <PID>
```

**Or change the port in `.env`:**
```env
PORT=3001
```

**Check all frxAI-related ports:**
```bash
ss -tlnp | grep -E '300[0-9]|3050'
```

| Port | Service | Expected Process |
|---|---|---|
| `3000` | Next.js app | `bun run start` |
| `3003` | price-feed | price-feed process |
| `3004` | sl-tp-monitor | sl-tp-monitor process |
| `3050` | mt5-bridge | mt5-bridge process |

---

### 12.4 NextAuth JWT issues

**Error:** `Invalid JWT` or `jwt not verified`

**Fix:** Ensure `NEXTAUTH_SECRET` is identical across all environments and the app is not using a stale secret:

```bash
# Regenerate and update .env
openssl rand -base64 32
# Paste the output into NEXTAUTH_SECRET in .env
sudo systemctl restart frxai
```

Also verify that `NEXTAUTH_URL` matches the actual URL users are accessing (including `http` vs `https` and the correct domain).

---

### 12.5 Build fails — out of memory

**Error:** `FATAL ERROR: Reached heap limit Allocation failed`

**Fix:** Increase the memory limit for Bun/Node during the build:

```bash
NODE_OPTIONS="--max-old-space-size=4096" bun run build
```

---

### 12.6 Mini-services unreachable from Docker

**Symptoms:** Next.js app logs show connection refused errors to `mt5-bridge:3050`, `price-feed:3003`, or `sl-tp-monitor:3004`.

**Fix:** If mini-services run on the host, ensure Docker can reach them:

1. Add `extra_hosts` to `docker-compose.yml` (see §7.4).
2. Verify the mini-services are bound to `0.0.0.0` (not just `127.0.0.1`):

   ```js
   // In the mini-service, ensure the server listens on all interfaces
   server.listen(3050, '0.0.0.0', () => {
     console.log('mt5-bridge listening on port 3050');
   });
   ```

---

## Appendix: Quick Reference

```bash
# ── Development ──────────────────────────────────────────
bun run setup          # First-time setup (install + DB + seed)
bun run dev:fresh      # Fresh dev (drops DB, recreates, seeds)
bun run dev            # Normal dev server with hot-reload

# ── Production ───────────────────────────────────────────
bun run build          # Build standalone output
bun run start          # Start production server

# ── Database ─────────────────────────────────────────────
bunx prisma db push              # Sync schema (dev)
bunx prisma migrate dev          # Create migration (dev)
bunx prisma migrate deploy       # Apply migrations (prod)
bunx prisma generate             # Regenerate client
bunx prisma studio               # Open DB browser

# ── Services ─────────────────────────────────────────────
sudo systemctl start frxai       # Start app
sudo systemctl restart frxai     # Restart app
sudo journalctl -u frxai -f      # Tail app logs
caddy reload                     # Reload reverse proxy
```