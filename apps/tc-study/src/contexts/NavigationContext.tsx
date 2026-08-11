/**
 * NavigationContext — thin React provider + selector hooks over the nav Zustand store.
 *
 * Store implementation: `features/nav/navigationStore.ts`
 * Persistence: `features/nav/navigationPersistence.ts`
 * Pure helpers: `features/nav/navigationHelpers.ts`
 *
 * State ownership (BCV / scope / mode) — see `lib/stores/stateOwnership.ts`.
 */

import { createContext, ReactNode, useContext, useEffect } from 'react'
import {
  useNavigationStore,
  type NavigationStore,
} from '../features/nav/navigationStore'

export type { NavigationStore }
export { useNavigationStore }

// ============================================================================
// CONTEXT
// ============================================================================

const NavigationContext = createContext<NavigationStore | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const store = useNavigationStore()

  // Initialize with first reference in history
  useEffect(() => {
    if (store.navigationHistory.length === 0) {
      store.navigateToReference(store.currentReference)
    }
  }, [])

  return <NavigationContext.Provider value={store}>{children}</NavigationContext.Provider>
}

export function useNavigation(): NavigationStore {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}

// Selector hooks for performance
export function useCurrentReference() {
  return useNavigationStore((state) => state.currentReference)
}

export function useAvailableBooks() {
  return useNavigationStore((state) => state.availableBooks)
}

export function useCurrentPassageSet() {
  return useNavigationStore((state) => state.currentPassageSet)
}

export function useNavigationMode() {
  return useNavigationStore((state) => state.navigationMode)
}

export function useNavigationScope() {
  return useNavigationStore((state) => state.navigationScope)
}

export function useHasNavigationSource() {
  return useNavigationStore((state) => state.hasNavigationSource())
}

export function useNavigationHistory() {
  return useNavigationStore((state) => state.navigationHistory)
}

export function useNavigationHistoryIndex() {
  return useNavigationStore((state) => state.historyIndex)
}

export function useCurrentSections() {
  return useNavigationStore((state) => state.currentSections)
}

export function useCurrentSectionIndex() {
  return useNavigationStore((state) => state.currentSectionIndex)
}
