/**
 * OBS catalog scope + story/frame navigation.
 */

import type { NavigationCatalogScope } from '../../contexts/types'
import { persistNavigationState } from './navigationPersistence'
import type { NavigationGet, NavigationSet, NavigationStore } from './navigationTypes'

export type ObsSlice = Pick<
  NavigationStore,
  | 'setNavigationScope'
  | 'setObsStoryFrameCount'
  | 'nextObsFrame'
  | 'previousObsFrame'
  | 'canGoToNextObsFrame'
  | 'canGoToPreviousObsFrame'
  | 'nextObsStory'
  | 'previousObsStory'
  | 'canGoToNextObsStory'
  | 'canGoToPreviousObsStory'
>

export function createObsSlice(set: NavigationSet, get: NavigationGet): ObsSlice {
  return {
    setNavigationScope: (scope: NavigationCatalogScope) => {
      set((state) => {
        state.navigationScope = scope
        if (scope === 'obs') {
          const cur = state.currentReference
          // Only preserve the existing OBS ref when chapter/verse are valid numbers;
          // otherwise default to 1·1 (guards against stale/corrupted localStorage state).
          state.currentReference =
            cur.book === 'obs' && cur.chapter >= 1 && cur.verse >= 1
              ? { book: 'obs', chapter: cur.chapter, verse: cur.verse }
              : { book: 'obs', chapter: 1, verse: 1 }
        } else {
          const cur = state.currentReference
          if (cur.book === 'obs') {
            const first = state.availableBooks[0]
            if (first) {
              state.currentReference = { book: first.code, chapter: 1, verse: 1 }
            }
          }
        }
        persistNavigationState(state)
      })
    },

    setObsStoryFrameCount: (storyNumber: number, frameCount: number) => {
      set((state) => {
        state.obsFrameCountByStory[String(storyNumber)] = frameCount
        persistNavigationState(state)
      })
    },

    nextObsFrame: () => {
      const { currentReference, obsFrameCountByStory } = get()
      if (currentReference.book !== 'obs') return
      // Advance from the END of the range (or single frame) so the arrow lands
      // on the first frame that was NOT part of the previous selection.
      const story = (currentReference.endChapter ?? currentReference.chapter) || 1
      const frame = (currentReference.endVerse ?? currentReference.verse) || 1
      const max = obsFrameCountByStory[String(story)] ?? 1
      if (frame < max) {
        get().navigateToReference({ book: 'obs', chapter: story, verse: frame + 1 })
      } else if (story < 50) {
        get().navigateToReference({ book: 'obs', chapter: story + 1, verse: 1 })
      }
    },

    previousObsFrame: () => {
      const { currentReference, obsFrameCountByStory } = get()
      if (currentReference.book !== 'obs') return
      const story = currentReference.chapter || 1
      const frame = currentReference.verse || 1
      if (frame > 1) {
        get().navigateToReference({ book: 'obs', chapter: story, verse: frame - 1 })
      } else if (story > 1) {
        const prevStory = story - 1
        const prevMax = obsFrameCountByStory[String(prevStory)] ?? 1
        get().navigateToReference({ book: 'obs', chapter: prevStory, verse: prevMax })
      }
    },

    canGoToNextObsFrame: () => {
      const { currentReference, obsFrameCountByStory } = get()
      if (currentReference.book !== 'obs') return false
      const story = (currentReference.endChapter ?? currentReference.chapter) || 1
      const frame = (currentReference.endVerse ?? currentReference.verse) || 1
      const max = obsFrameCountByStory[String(story)] ?? 0
      if (max > 0 && frame < max) return true
      return story < 50
    },

    canGoToPreviousObsFrame: () => {
      const { currentReference } = get()
      if (currentReference.book !== 'obs') return false
      return (currentReference.verse || 0) > 1 || (currentReference.chapter || 0) > 1
    },

    nextObsStory: () => {
      const { currentReference } = get()
      if (currentReference.book !== 'obs') return
      const story = currentReference.chapter || 1
      if (story < 50) {
        get().navigateToReference({ book: 'obs', chapter: story + 1, verse: 1 })
      }
    },

    previousObsStory: () => {
      const { currentReference } = get()
      if (currentReference.book !== 'obs') return
      const story = currentReference.chapter || 1
      if (story > 1) {
        get().navigateToReference({ book: 'obs', chapter: story - 1, verse: 1 })
      }
    },

    canGoToNextObsStory: () => {
      const { currentReference } = get()
      if (currentReference.book !== 'obs') return false
      return (currentReference.chapter || 0) < 50
    },

    canGoToPreviousObsStory: () => {
      const { currentReference } = get()
      if (currentReference.book !== 'obs') return false
      return (currentReference.chapter || 0) > 1
    },
  }
}
