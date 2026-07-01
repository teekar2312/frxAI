# Contributing to frxAI

Thank you for your interest in contributing to **frxAI** — an AI-powered Forex trading dashboard. This guide will help you get set up and ship high-quality code.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [API Development](#api-development)
- [Database Changes](#database-changes)
- [Testing](#testing)
- [Documentation](#documentation)
- [Code Review](#code-review)

---

## Getting Started

### 1. Fork & Clone

Fork the repository, then clone your fork locally:

```bash
git clone https://github.com/<your-username>/frxAI.git
cd frxAI
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Set Up MySQL

Make sure you have MySQL running locally. Create a database for the project, then copy the environment template and fill in your connection details:

```bash
cp .env.example .env.local
```

Set at minimum:

```
DATABASE_URL="mysql://user:password@localhost:3306/frxai"
```

### 4. Push Schema & Seed Auth Data

```bash
bunx prisma db:push
bun run seed:auth
```

`db:push` synchronises the Prisma schema with your database without generating migrations. `seed:auth` creates the initial admin/user records needed for authentication.

### 5. Start Development Server

```bash
bun dev
```

The app should now be running at `http://localhost:3000`.

---

## Development Workflow

### Branch Naming

Use descriptive, prefixed branches:

| Prefix       | Purpose                        | Example                          |
|--------------|--------------------------------|----------------------------------|
| `feat/`      | New feature                    | `feat/trade-history-export`      |
| `fix/`       | Bug fix                        | `fix/rate-limit-middleware`      |
| `refactor/`  | Code restructuring (no behaviour change) | `refactor/api-error-handling` |
| `docs/`      | Documentation only             | `docs/api-overview`              |
| `chore/`     | Tooling, deps, config          | `chore/bump-nextjs`              |

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(api): add trade export endpoint
fix(auth): resolve token refresh race condition
refactor(components): extract shared chart wrapper
```

### Pull Request Process

1. Rebase on `main` and resolve any conflicts.
2. Fill in the PR template (if available) — describe **what** changed and **why**.
3. Ensure the dev server starts cleanly and all tests pass.
4. Request at least one review before merging.

---

## Project Structure

```
frxAI/
├── src/
│   ├── app/
│   │   └── api/            # Next.js App Router API routes (one folder per route)
│   ├── components/
│   │   └── ui/             # shadcn/ui components (auto-generated — do not edit manually)
│   ├── lib/                # Shared utilities, helpers, validation schemas, constants
│   └── ...
├── mini-services/          # Standalone microservices used by the dashboard
├── prisma/
│   └── schema.prisma       # Database schema definition
├── package.json
└── ...
```

- **`src/app/api/`** — Each API route lives in its own folder with a `route.ts` file (Next.js App Router convention).
- **`src/components/`** — React components. The `ui/` subdirectory contains shadcn/ui primitives.
- **`src/lib/`** — Non-UI logic: auth guards, rate limiting, Zod schemas, error helpers, and shared utilities.
- **`mini-services/`** — Auxiliary services (e.g. data feeds, notification workers) that run alongside the main app.
- **`prisma/`** — Prisma schema and migration files.

---

## Coding Standards

- **TypeScript 5 — strict mode** is enabled. No `any` types; prefer proper typing or `unknown` with narrowing.
- **ESLint** configured via `eslint-config-next`. Run `bun lint` before every commit.
- **shadcn/ui components** — Always use the components in `src/components/ui/`. Do **not** build custom UI primitives when a shadcn equivalent exists. Add new shadcn components with:

  ```bash
  bunx shadcn@latest add <component-name>
  ```

- **`'use client'` / `'use server'`** — Mark components that need browser APIs or interactivity with `'use client'`. Mark server-only functions exported from API routes or Server Actions with `'use server'` when required.
- **Tailwind CSS** — Use Tailwind utility classes for styling. Avoid inline styles. Follow the existing colour and spacing conventions in the codebase.

---

## API Development

### Adding a New API Route

1. Create a folder under `src/app/api/` matching the route path:

   ```
   src/app/api/trades/export/route.ts
   ```

2. Implement the handler. A typical route looks like this:

   ```ts
   import { NextRequest, NextResponse } from 'next/server';
   import { requireTrader } from '@/lib/auth';
   import { applyRateLimit } from '@/lib/rate-limit';
   import { RATE_LIMITS } from '@/lib/constants';
   import { apiCatch } from '@/lib/api-catch';
   import { exportTradesSchema } from '@/lib/validations';

   export async function POST(req: NextRequest) {
     try {
       // 1. Auth guard
       await requireTrader(req);

       // 2. Rate limiting
       await applyRateLimit(req, RATE_LIMITS.preset);

       // 3. Input validation
       const body = await req.json();
       const parsed = exportTradesSchema.safeParse(body);
       if (!parsed.success) {
         return NextResponse.json(
           { error: 'Validation failed', details: parsed.error.flatten() },
           { status: 400 },
         );
       }

       // 4. Business logic
       const data = await exportTrades(parsed.data);

       return NextResponse.json({ success: true, data });
     } catch (e) {
       // 5. Centralised error handling
       return apiCatch(e, 'trade-export', 'POST', req);
     }
   }
   ```

### Auth Guards

| Guard            | Use case                                    |
|------------------|---------------------------------------------|
| `requireAuth()`  | Any authenticated user                      |
| `requireTrader()`| Operations involving trade data             |
| `requireAdmin()` | Admin-only operations (system config, etc.) |

### Error Handling

Always wrap route handlers in a `try/catch` and delegate to `apiCatch()`:

```ts
return apiCatch(e, 'source-identifier', 'METHOD', req);
```

This ensures consistent error responses, logging, and status codes across the API.

---

## Database Changes

### Modifying the Schema

1. Edit `prisma/schema.prisma`.
2. **Important** — For any `String` field that may exceed MySQL's `VARCHAR(191)` limit, annotate it with `@db.Text`:

   ```prisma
   model Note {
     id   String @id @default(uuid())
     body String @db.Text   // Use @db.Text for potentially long strings
   }
   ```

   Regular short strings (emails, names, slugs) can remain as the default `String` (mapped to `VARCHAR(191)`).

3. Apply the changes:

   ```bash
   bunx prisma db:push
   ```

4. If you need to generate a migration for production deployments:

   ```bash
   bunx prisma migrate dev --name descriptive-name
   ```

---

## Testing

- **Runner**: `bun test`
- **Test files**: Co-locate tests next to the source, or place them in a `__tests__/` directory at the relevant level.
- **Naming convention**: `<module>.test.ts` or `<module>.spec.ts`

  ```
  src/lib/auth.test.ts
  src/app/api/trades/__tests__/export.test.ts
  ```

Run the full suite:

```bash
bun test
```

---

## Documentation

- If your PR adds or changes a feature, update the relevant documentation files.
- If you add a new API route, document the endpoint, parameters, and response shape.
- If you modify `schema.prisma`, note the change in the project docs.

---

## Code Review

Reviewers will check for:

- **Correctness** — Does the code do what the PR description says?
- **Type safety** — No `any`; proper types throughout.
- **Auth & security** — Appropriate auth guard used; no unprotected routes.
- **Error handling** — All routes use `apiCatch()`; no unhandled promise rejections.
- **Input validation** — Zod schemas used for all user-supplied data.
- **Rate limiting** — Applied where appropriate.
- **UI consistency** — shadcn/ui components used instead of custom implementations.
- **Code style** — Passes `bun lint`; follows existing patterns.
- **Test coverage** — New logic is covered by tests.

---

Thank you for contributing to frxAI! If you have questions, feel free to open a discussion or reach out to the maintainers.