/**
 * Browser-style BCV history (back / forward / jump).
 */

import { persistNavigationState } from './navigationPersistence'
import type { NavigationGet, NavigationSet, NavigationStore } from './navigationTypes'

export type HistorySlice = Pick<
  NavigationStore,
  'goBack' | 'goForward' | 'goToHistoryIndex' | 'canGoBack' | 'canGoForward'
>

export function createHistorySlice(set: NavigationSet, get: NavigationGet): HistorySlice {
  return {
    goBack: () => {
      const { navigationHistory, historyIndex } = get()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        set((state) => {
          state.currentReference = navigationHistory[newIndex]
          state.historyIndex = newIndex
          persistNavigationState(state)
        })
      }
    },

    goForward: () => {
      const { navigationHistory, historyIndex } = get()
      if (historyIndex < navigationHistory.length - 1) {
        const newIndex = historyIndex + 1
        set((state) => {
          state.currentReference = navigationHistory[newIndex]
          state.historyIndex = newIndex
          persistNavigationState(state)
        })
      }
    },

    goToHistoryIndex: (index: number) => {
      const { navigationHistory } = get()
      if (index >= 0 && index < navigationHistory.length) {
        set((state) => {
          state.currentReference = navigationHistory[index]
          state.historyIndex = index
          persistNavigationState(state)
        })
      }
    },

    canGoBack: () => get().historyIndex > 0,

    canGoForward: () => {
      const { navigationHistory, historyIndex } = get()
      return historyIndex < navigationHistory.length - 1
    },
  }
}
