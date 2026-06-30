'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { SessionProvider } from 'next-auth/react'
import { useState, ReactNode } from 'react'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  // Theme is now user-toggleable (dark default for trading, light available).
  // next-themes handles persistence via localStorage under the "theme" key.
  // SessionProvider wraps the app so useSession() works everywhere.
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
        <QueryClientProvider client={client}>
          {children}
          <Toaster />
          <SonnerToaster position="top-right" richColors closeButton />
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
