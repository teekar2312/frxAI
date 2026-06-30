// NextAuth configuration — credentials provider with bcrypt password verification.
// Session strategy: JWT (stateless, no session table needed for reads).
// The User model in Prisma stores email + bcrypt passwordHash + role.

import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { authenticateUser, type SafeUser } from './auth'

// In-memory rate limiting for login attempts (per email).
// Prevents brute-force credential stuffing on specific accounts.
// 5 attempts per 5 minutes per email.
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

function checkLoginRateLimit(email: string): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now()
  const entry = loginAttempts.get(email)

  if (!entry || entry.resetAt < now) {
    // First attempt or window expired
    loginAttempts.set(email, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return { allowed: true, remaining: LOGIN_MAX_ATTEMPTS - 1, retryAfter: 0 }
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, remaining: 0, retryAfter }
  }

  entry.count++
  return {
    allowed: true,
    remaining: LOGIN_MAX_ATTEMPTS - entry.count,
    retryAfter: 0,
  }
}

function resetLoginRateLimit(email: string) {
  // Clear rate limit on successful login
  loginAttempts.delete(email)
}

// Clean expired entries every 10 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [email, entry] of loginAttempts.entries()) {
    if (entry.resetAt < now) loginAttempts.delete(email)
  }
}, 10 * 60 * 1000)

// Extend the default session type to include user role + id.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: 'admin' | 'trader' | 'viewer'
    }
  }
  interface User {
    id: string
    email: string
    name: string
    role: 'admin' | 'trader' | 'viewer'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'admin' | 'trader' | 'viewer'
  }
}

export const authOptions: NextAuthOptions = {
  // JWT strategy — stateless, scales horizontally, no DB session lookups.
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'trader@finexfx.local' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log('[auth] authorize: missing credentials')
          return null
        }

        const email = credentials.email.toLowerCase().trim()

        // ─── Rate limit check (brute force protection) ────────────────────────
        const rateLimit = checkLoginRateLimit(email)
        if (!rateLimit.allowed) {
          console.log(`[auth] authorize: rate limit exceeded for ${email} — retry in ${rateLimit.retryAfter}s`)
          // Return null (auth failed) — NextAuth will redirect to error page.
          // The user sees "invalid credentials" but the real reason is rate limit.
          // For better UX, the login page could check this separately, but this
          // is the simplest integration with NextAuth's credentials provider.
          return null
        }

        console.log(`[auth] authorize: attempting login for ${email} (${rateLimit.remaining} attempts remaining)`)

        const user = await authenticateUser(email, credentials.password)
        if (!user) {
          console.log(`[auth] authorize: authentication failed for ${email}`)
          return null
        }

        // ─── Reset rate limit on successful login ─────────────────────────────
        resetLoginRateLimit(email)
        console.log(`[auth] authorize: success for ${user.email} role=${user.role}`)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],

  callbacks: {
    // Inject user id + role into the JWT token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.role = (user as any).role as 'admin' | 'trader' | 'viewer'
      }
      return token
    },

    // Inject user id + role into the session object (available client-side)
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
      }
      return session
    },
  },

  pages: {
    signIn: '/login',
  },

  // Secret is read from NEXTAUTH_SECRET env var (auto-generated if missing).
  // In production, set NEXTAUTH_SECRET to a stable random string (>= 32 chars).
  secret: process.env.NEXTAUTH_SECRET || 'finexfx-dev-secret-change-in-production-please-32chars',
}
