/**
 * Navigation Zustand store facade — composes domain slices.
 * Persistence: navigationPersistence.ts. Pure helpers: navigationHelpers.ts.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { BCVReference } from '../../contexts/types'
import { createBcvSlice } from './navigationBcvSlice'
import { createHistorySlice } from './navigationHistorySlice'
import { createObsSlice } from './navigationObsSlice'
import { createPassageSlice } from './navigationPassageSlice'
import { loadPersistedNavigationState } from './navigationPersistence'
import { createSectionSlice } from './navigationSectionSlice'
import type { NavigationGet, NavigationSet, NavigationStore } from './navigationTypes'
import { createVerseChapterSlice } from './navigationVerseChapterSlice'

export type { NavigationStore } from './navigationTypes'

const persistedState = loadPersistedNavigationState()

const NAV_STORE_KEY = '__tcStudyNavigationStore__' as const

type NavStoreGlobal = typeof globalThis & {
  [NAV_STORE_KEY]?: ReturnType<typeof createNavigationStore>
}

function createNavigationStore() {
  return create<NavigationStore>()(
    immer((set, get) => {
      const navSet = set as unknown as NavigationSet
      const navGet = get as NavigationGet

      return {
        currentReference: persistedState.currentReference || {
          book: 'tit',
          chapter: 1,
          verse: 1,
        },
        availableBooks: [
          { code: 'tit', name: 'Titus', testament: 'NT', chapters: 3, verses: [16, 15, 15] },
        ],
        navigationHistory: persistedState.navigationHistory || ([] as BCVReference[]),
        historyIndex: persistedState.historyIndex ?? -1,
        maxHistorySize: 50,

        currentSections: [],
        currentSectionIndex: -1,

        currentPassageSet: null,
        currentPassageList: [] as BCVReference[],
        currentPassageIndex: -1,
        navigationMode: persistedState.navigationMode || 'chapter',
        navigationScope: persistedState.navigationScope || 'scripture',
        obsFrameCountByStory: persistedState.obsFrameCountByStory || {},

        ...createBcvSlice(navSet, navGet),
        ...createVerseChapterSlice(navGet),
        ...createHistorySlice(navSet, navGet),
        ...createSectionSlice(navSet, navGet),
        ...createPassageSlice(navSet, navGet),
        ...createObsSlice(navSet, navGet),
      }
    })
  )
}

/** HMR-safe singleton — Vite can evaluate this module twice during hot reload. */
export const useNavigationStore =
  (globalThis as NavStoreGlobal)[NAV_STORE_KEY] ?? createNavigationStore()
;(globalThis as NavStoreGlobal)[NAV_STORE_KEY] = useNavigationStore
