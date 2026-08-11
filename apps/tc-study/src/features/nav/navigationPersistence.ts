/**
 * localStorage load/save for navigation BCV state.
 * Kept separate from NavigationContext so the React layer stays thin.
 */

import type { BCVReference, NavigationCatalogScope, NavigationMode } from '../../contexts/types'

export const NAVIGATION_STORAGE_KEY = 'bt-synergy:navigation-state'

/** Slice of nav state written to localStorage */
export interface PersistedNavigationSlice {
  currentReference: BCVReference
  navigationHistory: BCVReference[]
  historyIndex: number
  navigationMode: NavigationMode
  navigationScope: NavigationCatalogScope
  obsFrameCountByStory: Record<string, number>
}

export type PersistedNavigationPartial = Partial<PersistedNavigationSlice>

function canUseLocalStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

/** Load persisted navigation state from localStorage */
export function loadPersistedNavigationState(): PersistedNavigationPartial {
  if (!canUseLocalStorage()) return {}
  try {
    const saved = localStorage.getItem(NAVIGATION_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as PersistedNavigationPartial
      return parsed
    }
  } catch (err) {
    console.warn('Failed to load persisted navigation state:', err)
  }
  return {}
}

/** Save navigation state to localStorage */
export function persistNavigationState(state: PersistedNavigationSlice): void {
  if (!canUseLocalStorage()) return
  try {
    const toPersist: PersistedNavigationSlice = {
      currentReference: state.currentReference,
      navigationHistory: state.navigationHistory,
      historyIndex: state.historyIndex,
      navigationMode: state.navigationMode,
      navigationScope: state.navigationScope,
      obsFrameCountByStory: state.obsFrameCountByStory,
    }
    localStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify(toPersist))
  } catch (err) {
    console.warn('Failed to persist navigation state:', err)
  }
}
