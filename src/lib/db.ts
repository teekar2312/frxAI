import { PrismaClient } from '@prisma/client'

// Versioned cache key — bump when schema changes to force a fresh client
// that includes newly-added models (avoids stale PrismaClient in dev HMR).
const DB_CACHE_VERSION = 'v3'

const globalForPrisma = globalThis as unknown as {
  prismaClients: Record<string, PrismaClient> | undefined
}

export const db =
  globalForPrisma.prismaClients?.[DB_CACHE_VERSION] ??
  (() => {
    const client = new PrismaClient({ log: ['error', 'warn'] })
    if (process.env.NODE_ENV !== 'production') {
      if (!globalForPrisma.prismaClients) globalForPrisma.prismaClients = {}
      globalForPrisma.prismaClients[DB_CACHE_VERSION] = client
    }
    return client
  })()