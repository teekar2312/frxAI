'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Global active-account store.
 *
 * The dashboard, trading panel, analytics panel, and topbar switcher all read
 * from this single source of truth so that switching accounts in one place
 * updates every panel consistently. The selection is persisted to localStorage
 * so a page refresh keeps the user's last chosen account.
 *
 * `viewMode` controls the dashboard presentation:
 *  - 'single' (default) → show KPIs for the currently selected account only.
 *  - 'all'               → show an aggregated view across every account.
 */
type DashboardViewMode = 'single' | 'all'

interface ActiveAccountState {
  /** The currently selected account ID, or null to fall back to the default. */
  activeAccountId: string | null
  /** Set the active account. Pass null to reset to the default. */
  setActiveAccountId: (id: string | null) => void
  /** Whether the dashboard shows a single account or aggregates all accounts. */
  viewMode: DashboardViewMode
  /** Switch the dashboard between single-account and all-accounts aggregation. */
  setViewMode: (mode: DashboardViewMode) => void
}

export const useActiveAccount = create<ActiveAccountState>()(
  persist(
    (set) => ({
      activeAccountId: null,
      setActiveAccountId: (id) => set({ activeAccountId: id }),
      viewMode: 'single',
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    {
      name: 'finexfx-active-account',
      storage: createJSONStorage(() => localStorage),
      version: 2,
    },
  ),
)

/**
 * Resolve the effective account from a list.
 * Priority: global activeAccountId → isDefault → first.
 */
export function resolveAccount<T extends { id: string; isDefault: boolean }>(
  accounts: T[],
  activeId: string | null,
): T | null {
  if (!accounts.length) return null
  if (activeId) {
    const found = accounts.find((a) => a.id === activeId)
    if (found) return found
  }
  return accounts.find((a) => a.isDefault) ?? accounts[0]
}
