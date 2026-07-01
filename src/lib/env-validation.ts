// Environment Variable Validation — checks required env vars at module load time.
// Called from src/app/layout.tsx or instrumentation.ts.
//
// In development, missing vars show warnings but don't crash.
// In production, missing critical vars throw and prevent startup.

const REQUIRED_VARS: Array<{ key: string; required: boolean; minLength?: number; description: string }> = [
  { key: 'DATABASE_URL', required: true, description: 'SQLite database file path (file:./db/custom.db)' },
  { key: 'NEXTAUTH_SECRET', required: false, minLength: 32, description: 'JWT signing secret (>= 32 chars, auto-generated in dev)' },
  { key: 'NEXTAUTH_URL', required: false, description: 'Canonical URL of the app (e.g., https://app.example.com)' },
]

export interface EnvValidationResult {
  valid: boolean
  warnings: string[]
  errors: string[]
}

/**
 * Validate all required environment variables.
 * Call once at app startup.
 */
export function validateEnv(): EnvValidationResult {
  const result: EnvValidationResult = { valid: true, warnings: [], errors: [] }
  const isProd = process.env.NODE_ENV === 'production'

  for (const v of REQUIRED_VARS) {
    const value = process.env[v.key]

    if (!value) {
      if (v.required) {
        const msg = `Missing required env var: ${v.key} — ${v.description}`
        if (isProd) {
          result.errors.push(msg)
          result.valid = false
        } else {
          result.warnings.push(`[DEV] ${msg}`)
        }
      }
      continue
    }

    if (v.minLength && value.length < v.minLength) {
      const msg = `${v.key} is too short (${value.length} chars, min ${v.minLength})`
      if (isProd) {
        result.errors.push(msg)
        result.valid = false
      } else {
        result.warnings.push(`[DEV] ${msg}`)
      }
    }
  }

  // Print warnings/errors to console
  for (const w of result.warnings) console.warn(`⚠️  ${w}`)
  for (const e of result.errors) console.error(`❌ ${e}`)

  return result
}