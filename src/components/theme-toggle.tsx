'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Subscribe to whether the component has mounted (avoids hydration mismatch
// for theme-dependent rendering without calling setState in an effect).
const emptySubscribe = () => () => {}
function getMountedSnapshot() {
  return true
}
function getServerSnapshot() {
  return false
}

/**
 * Dark/Light theme toggle.
 * Defaults to dark (trading UI). Persists selection via next-themes localStorage.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme()
  // useSyncExternalStore with an empty subscribe is the recommended pattern
  // for detecting mount without setState-in-effect.
  const mounted = useSyncExternalStore(emptySubscribe, getMountedSnapshot, getServerSnapshot)

  const isDark = (mounted ? resolvedTheme : 'dark') === 'dark'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-9 w-9 rounded-full', className)}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <Sun
            className={cn(
              'h-4 w-4 transition-all duration-300',
              isDark ? 'rotate-0 scale-100' : '-rotate-90 scale-0 absolute',
            )}
          />
          <Moon
            className={cn(
              'h-4 w-4 transition-all duration-300',
              isDark ? 'rotate-90 scale-0 absolute' : 'rotate-0 scale-100',
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {isDark ? '🌙 Mode Gelap — Klik untuk mode terang' : '☀️ Mode Terang — Klik untuk mode gelap'}
      </TooltipContent>
    </Tooltip>
  )
}
