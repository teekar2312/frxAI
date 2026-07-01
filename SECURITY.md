# Security Policy — frxAI

> AI-powered Forex Trading Dashboard  
> Stack: Next.js 16 · MySQL · Prisma ORM · NextAuth v4

---

## Table of Contents

1. [Security Overview](#1-security-overview)
2. [Authentication](#2-authentication)
3. [Authorization & RBAC](#3-authorization--rbac)
4. [API Security](#4-api-security)
5. [Service-to-Service Auth](#5-service-to-service-auth)
6. [Data Protection](#6-data-protection)
7. [Input Sanitization](#7-input-sanitization)
8. [Audit Logging](#8-audit-logging)
9. [Log Retention & Privacy](#9-log-retention--privacy)
10. [Environment Variables](#10-environment-variables)
11. [Reporting Vulnerabilities](#11-reporting-vulnerabilities)
12. [Security Checklist](#12-security-checklist)

---

## 1. Security Overview

frxAI implements a **defense-in-depth** security model across every layer of the application:

| Layer | Mechanism |
|---|---|
| **Transport** | TLS/HTTPS enforced in production |
| **Identity** | NextAuth v4 with JWT-based session tokens |
| **Authorization** | Role-based access control (admin / trader / viewer) |
| **API** | Per-endpoint rate limiting, Zod schema validation, CORS whitelisting |
| **Service mesh** | Shared-secret headers (`X-Service-Key`, `X-Bridge-Key`) for internal endpoints |
| **Data** | bcrypt password hashing, Prisma parameterized queries, encrypted secrets |
| **Observability** | Structured audit logs with tiered retention, request-ID tracing |
| **Operations** | Automated log cleanup, kill-switch rate limiting, environment hardening |

All security-sensitive code paths are centralized in dedicated modules so they can be audited in a single pass.

---

## 2. Authentication

### 2.1 Provider Configuration

frxAI uses **NextAuth v4** with the **Credentials provider**. Users authenticate by submitting a username and password through the standard `/api/auth/signin` flow.

```
Provider:  Credentials (email + password)
Strategy:  JWT (stateless, stored in HTTP-only cookie)
Library:   next-auth v4
```

### 2.2 Password Hashing

| Property | Value |
|---|---|
| Algorithm | **bcrypt** |
| Default rounds | 12 (cost factor) |
| Library | `bcryptjs` |

Passwords are **never stored in plaintext**. The bcrypt salt is embedded in the hash, eliminating the need for a separate salt column.

### 2.3 JWT Session Tokens

- Tokens are signed with `NEXTAUTH_SECRET` and issued as **HTTP-only, `Secure`, `SameSite=Lax` cookies**.
- Token expiry is controlled by NextAuth's `session.maxAge` configuration.
- The JWT payload contains the user ID and role — nothing more.

### 2.4 Session Management

- Sessions are validated on every request via `getServerSession()`.
- Invalid or expired tokens are rejected with a **401 Unauthorized** response.
- There is no server-side session store; revocation relies on token expiry and key rotation.

### 2.5 Production Requirements

- `NEXTAUTH_SECRET` **must be at least 32 characters**. The application validates this at startup and will refuse to boot if the requirement is not met.
- `NEXTAUTH_URL` must be set to the canonical production URL (e.g., `https://trading.example.com`).

---

## 3. Authorization & RBAC

### 3.1 Roles

frxAI defines three roles, stored in the `User.role` database column:

| Role | Capabilities |
|---|---|
| **`admin`** | Full access: user management, system configuration, kill-switch, audit log access, backups |
| **`trader`** | Trading operations: AI analysis, signal management, SL/TP checks, position monitoring |
| **`viewer`** | Read-only access: dashboards, public reports, signal history (no mutations) |

### 3.2 Guard Functions

Three server-side guard functions enforce authorization. They must be called inside `getServerSession()` context and throw or redirect on failure:

| Guard | Purpose | Fails with |
|---|---|---|
| `requireAuth()` | Ensures the user is authenticated (any role) | 401 Unauthorized |
| `requireTrader()` | Ensures the user has `admin` **or** `trader` role | 403 Forbidden |
| `requireAdmin()` | Ensures the user has `admin` role | 403 Forbidden |

**Usage pattern:**

```ts
// In a Next.js API route or server component
const session = await getServerSession(authOptions);
const user = requireAuth(session);          // throws if not logged in
requireTrader(user);                         // throws if viewer
// ... proceed with trading logic
```

### 3.3 Principle of Least Privilege

- Every API endpoint must explicitly call the appropriate guard — there is no default-allow.
- New endpoints default to requiring authentication; anonymous access must be explicitly opted in.

---

## 4. API Security

### 4.1 Rate Limiting

frxAI applies **per-endpoint rate limiting** using 12 distinct presets. Limits are enforced per IP address (and per user when authenticated):

| Endpoint / Category | Limit | Window |
|---|---|---|
| Login (`/api/auth/signin`) | **5 requests** | per minute |
| AI Analysis | **5 requests** | per minute |
| Kill-Switch activation | **2 requests** | per 30 seconds |
| Signal creation | **10 requests** | per minute |
| General API (default) | **60 requests** | per minute |
| Service-to-service endpoints | **100 requests** | per minute |
| Health / readiness probes | **30 requests** | per minute |
| *...and 5 additional presets for other endpoint categories* | | |

Rate-limit headers are included in responses:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1718000000
```

Requests exceeding the limit receive a **429 Too Many Requests** response with a `Retry-After` header.

### 4.2 Input Validation (Zod)

Every API endpoint validates its input using **Zod schemas** before processing:

```ts
const AnalyzeRequestSchema = z.object({
  symbol:    z.string().min(1).max(20),
  timeframe: z.enum(['M1','M5','M15','H1','H4','D1']),
  strategy:  z.string().optional(),
});
```

- Validation runs **before** any database or external service call.
- Invalid input returns **400 Bad Request** with a structured error body describing the schema violations.
- Unknown properties in request bodies are **stripped** (Zod `.strict()` mode) to prevent injection of unexpected fields.

### 4.3 CORS Configuration

- CORS is explicitly configured with an **allowlist of permitted origins**.
- In production, only the canonical frontend domain is allowed.
- The MT5 bridge endpoint has additional CORS restrictions (see [Section 5](#5-service-to-service-auth)).
- Credentials are allowed only from trusted origins.

### 4.4 Request ID Tracing

Every incoming request is assigned a unique **request ID** (UUID v4) that is:

- Set in the `X-Request-Id` response header.
- Included in all log entries for that request.
- Propagated to downstream service calls for distributed tracing.

This enables end-to-end request tracking across the API, audit logs, and external service calls.

---

## 5. Service-to-Service Auth

Internal and bridge endpoints are protected by **shared-secret header authentication** in addition to user-session auth.

### 5.1 X-Service-Key

Protects internal operational endpoints:

| Protected Endpoint | Purpose |
|---|---|
| `/api/admin/check-sl-tp` | Stop-loss / take-profit validation |
| `/api/admin/reconcile` | Position reconciliation |
| `/api/admin/evaluate` | Strategy evaluation |
| `/api/admin/backup` | Database backup trigger |

- The client must include `X-Service-Key: <secret>` in every request.
- The server validates the key against the `SERVICE_KEY` environment variable using **constant-time comparison** (`crypto.timingSafeEqual`).
- Missing or invalid keys result in **401 Unauthorized** — no information leakage about whether the key exists.

### 5.2 X-Bridge-Key

Protects the **MT5 bridge** communication channel:

- The MT5 integration communicates with the backend via a dedicated bridge endpoint.
- Every bridge request must include `X-Bridge-Key: <secret>` validated against the `BRIDGE_KEY` environment variable.
- Additional **CORS restrictions** limit bridge access to the MT5 server's IP address.
- Bridge endpoints have their own rate-limit preset.

---

## 6. Data Protection

### 6.1 Password Security

- Stored using **bcrypt** with a cost factor of 12.
- Passwords are **never logged**, never included in error messages, and never returned in API responses.

### 6.2 JWT Secret Management

| Property | Requirement |
|---|---|
| Variable | `NEXTAUTH_SECRET` |
| Minimum length | **32 characters** (enforced at startup) |
| Storage | Environment variable only — never committed to source control |
| Rotation | Rotate by changing the value; existing tokens are invalidated on next request |

### 6.3 Environment Variable Handling

- All secrets are loaded from environment variables (`.env` files are `.gitignore`d).
- The application validates required secrets at boot and fails fast if any are missing or too short.
- No secrets are exposed to the client bundle; server-only variables are gated behind `NEXT_PUBLIC_` prefix absence.

### 6.4 Database Security

- All database queries use **Prisma ORM** with parameterized queries — raw SQL is prohibited unless explicitly reviewed.
- The MySQL connection uses TLS in production.
- Database credentials are stored in environment variables, never in code.

---

## 7. Input Sanitization

### 7.1 `sanitizeMessage()` (api-handler.ts)

The `sanitizeMessage()` utility in `api-handler.ts` provides an additional layer of sanitization for string inputs:

- Strips or escapes HTML entities (`<`, `>`, `&`, `"`, `'`).
- Removes null bytes and control characters.
- Trims whitespace and normalizes Unicode where applicable.
- Applied to all user-supplied text before storage or processing.

### 7.2 Zod Schema Validation

- **First line of defense**: Zod schemas reject malformed input before it reaches any business logic.
- Type coercion is disabled by default (`z.string()` does not auto-coerce numbers).
- Enums restrict values to known safe options.

### 7.3 SQL Injection Prevention

- frxAI uses **Prisma ORM** exclusively for database access.
- Prisma generates **parameterized queries** for all operations — user input is never interpolated into raw SQL.
- Raw queries (`$queryRaw`, `$executeRaw`) are banned by ESLint rule; any exception requires explicit `// eslint-disable-next-line` with a security review comment.

### 7.4 Cross-Site Scripting (XSS)

- Next.js provides automatic XSS protection via React's default escaping.
- HTTP-only cookies prevent JavaScript access to session tokens.
- Content Security Policy (CSP) headers are recommended for production deployments.

---

## 8. Audit Logging

### 8.1 `audit()` Function

All security-sensitive operations are recorded via the `audit()` function, which writes structured records to the database:

```ts
await audit({
  userId:    session.user.id,
  action:    'KILL_SWITCH_ACTIVATED',
  resource:  'system',
  details:   { reason: 'Drawdown limit exceeded' },
  ip:        request.ip,
  requestId: request.headers['x-request-id'],
});
```

### 8.2 Tracked Operations

| Category | Examples |
|---|---|
| **Authentication** | Login success/failure, password change, session events |
| **Authorization** | Role changes, permission escalation attempts |
| **Trading** | Signal creation/modification/deletion, AI analysis requests |
| **System** | Kill-switch activation/deactivation, backup triggers, reconciliation runs |
| **Data** | Bulk exports, configuration changes, user management (create/delete) |

### 8.3 Audit Log Properties

Each audit record includes:

- `id` — Unique identifier (UUID)
- `userId` — Actor (null for system-initiated events)
- `action` — High-level action name (e.g., `SIGNAL_CREATED`)
- `resource` — Affected resource type
- `details` — JSON payload with context-specific data
- `ip` — Client IP address
- `requestId` — Correlation ID for request tracing
- `createdAt` — Timestamp (UTC)

Audit logs are **append-only** — they cannot be modified or deleted through the API.

---

## 9. Log Retention & Privacy

### 9.1 Tiered Cleanup

Application logs are cleaned up on a rolling schedule based on severity:

| Level | Retention | Rationale |
|---|---|---|
| `debug` | **3 days** | High volume, low long-term value |
| `info` | **7 days** | Operational visibility, moderate volume |
| `warn` | **14 days** | Potential issues requiring investigation |
| `error` | **30 days** | Critical failures, security incidents |

Audit log records (database-stored) follow a separate retention policy and are **not automatically purged** by the log cleanup process.

### 9.2 Cleanup Mechanism

- Cleanup runs as a **scheduled task** (via a process signal / cron).
- The `SIGUSR2` signal can trigger an immediate cleanup cycle for operational use.
- Cleanup is idempotent and safe to run concurrently.

### 9.3 Privacy Considerations

- IP addresses in logs are subject to the same retention tiers as the log level they appear in.
- Passwords, JWT tokens, and API keys are **never written to logs**.
- PII is minimized — only data necessary for security auditing is retained.
- Audit logs containing user actions are retained according to organizational policy and applicable regulations.

---

## 10. Environment Variables

### 10.1 Required Variables

| Variable | Purpose | Production Requirement |
|---|---|---|
| `DATABASE_URL` | MySQL connection string | Must use TLS (`?sslmode=require`) |
| `NEXTAUTH_SECRET` | JWT signing key | **≥ 32 characters**, cryptographically random |
| `NEXTAUTH_URL` | Canonical app URL | Must match production domain (HTTPS) |
| `SERVICE_KEY` | Internal service auth header | Cryptographically random, ≥ 24 chars |
| `BRIDGE_KEY` | MT5 bridge auth header | Cryptographically random, ≥ 24 chars |

### 10.2 Optional Variables

| Variable | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Client-side API base URL | Derived from `NEXTAUTH_URL` |
| `LOG_LEVEL` | Minimum log level | `info` |
| `RATE_LIMIT_ENABLED` | Global rate-limit toggle | `true` |
| `AUDIT_ENABLED` | Global audit toggle | `true` |

### 10.3 Security Rules

- **Never** commit `.env` files to version control (enforced via `.gitignore`).
- **Never** prefix secrets with `NEXT_PUBLIC_` — this exposes them to the client bundle.
- Validate all required variables at application startup; fail fast if missing.
- Rotate secrets periodically and after any suspected compromise.

---

## 11. Reporting Vulnerabilities

We take security seriously. If you discover a vulnerability in frxAI, please report it responsibly.

### How to Report

1. **Email**: Send a detailed report to the project security contacts.
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Any proof-of-concept code (if applicable)
3. **Do NOT**:
   - Publicly disclose the vulnerability before a fix is released
   - Exploit the vulnerability beyond what is necessary to demonstrate it
   - Access or exfiltrate real user data

### What to Expect

| Phase | Timeline |
|---|---|
| Acknowledgment | Within **48 hours** of receiving the report |
| Initial assessment | Within **5 business days** |
| Fix development | Varies by severity; critical issues are prioritized |
| Disclosure | Coordinated disclosure after the fix is deployed |

### Safe Harbor

We commit to **not pursuing legal action** against researchers who:
- Follow this responsible disclosure policy
- Do not exceed the scope necessary to demonstrate the vulnerability
- Do not access, modify, or delete data belonging to others

---

## 12. Security Checklist

Use this checklist before every production deployment:

### Authentication & Authorization

- [ ] `NEXTAUTH_SECRET` is set and ≥ 32 characters
- [ ] `NEXTAUTH_URL` matches the production domain (HTTPS)
- [ ] All API endpoints call `requireAuth()`, `requireTrader()`, or `requireAdmin()`
- [ ] No endpoint accidentally allows anonymous access
- [ ] Session cookies are HTTP-only, Secure, and SameSite=Lax

### API Security

- [ ] Rate limiting is enabled (`RATE_LIMIT_ENABLED=true`)
- [ ] All 12 rate-limit presets are configured correctly
- [ ] Zod validation schemas are applied to all endpoints
- [ ] CORS allowlist contains only trusted origins
- [ ] Request ID tracing is active (`X-Request-Id` header present in responses)

### Service-to-Service

- [ ] `SERVICE_KEY` is set and differs from `BRIDGE_KEY`
- [ ] `BRIDGE_KEY` is set
- [ ] Protected endpoints (`check-sl-tp`, `reconcile`, `evaluate`, `backup`) validate `X-Service-Key`
- [ ] MT5 bridge endpoint validates `X-Bridge-Key` and CORS restrictions

### Data Protection

- [ ] Database connection uses TLS (`sslmode=require`)
- [ ] No secrets are prefixed with `NEXT_PUBLIC_`
- [ ] `.env` files are in `.gitignore`
- [ ] No hardcoded credentials in source code

### Logging & Monitoring

- [ ] Audit logging is enabled (`AUDIT_ENABLED=true`)
- [ ] Sensitive operations (auth, trading, system) are covered by `audit()` calls
- [ ] Log cleanup schedule is active
- [ ] No passwords, tokens, or keys appear in log output

### Infrastructure

- [ ] TLS certificate is valid and not expiring soon
- [ ] HTTP requests are redirected to HTTPS
- [ ] Database firewall restricts access to application servers only
- [ ] Dependency vulnerabilities are scanned (e.g., `npm audit`, Snyk)

### Post-Deployment

- [ ] Verify login flow works end-to-end
- [ ] Verify role-based access control (admin, trader, viewer)
- [ ] Verify rate limiting returns 429 when exceeded
- [ ] Verify kill-switch rate limit (2 per 30s) is enforced
- [ ] Verify audit logs are being written
- [ ] Verify service-to-service auth rejects missing/invalid keys

---

*This document is maintained by the frxAI security team. Last reviewed: see git history.*