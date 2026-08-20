/**
 * Passage-set load / clear / next / prev.
 */

import type { PassageSet } from '../../contexts/types'
import { flattenPassageSetToBCV } from './navigationHelpers'
import { persistNavigationState } from './navigationPersistence'
import type { NavigationGet, NavigationSet, NavigationStore } from './navigationTypes'

export type PassageSlice = Pick<
  NavigationStore,
  | 'loadPassageSet'
  | 'clearPassageSet'
  | 'nextPassage'
  | 'previousPassage'
  | 'canGoToNextPassage'
  | 'canGoToPreviousPassage'
>

export function createPassageSlice(set: NavigationSet, get: NavigationGet): PassageSlice {
  return {
    loadPassageSet: (passageSet: PassageSet) => {
      const flat = flattenPassageSetToBCV(passageSet.root ?? [])
      set((state) => {
        state.currentPassageSet = passageSet
        state.currentPassageList = flat
        state.currentPassageIndex = 0
        state.navigationMode = 'passage-set'
        if (flat.length > 0) {
          state.currentReference = flat[0]
        }
      })
    },

    clearPassageSet: () => {
      set((state) => {
        state.currentPassageSet = null
        state.currentPassageList = []
        state.currentPassageIndex = -1
        if (state.availableBooks.length === 0) {
          state.navigationMode = 'verse'
        }
      })
    },

    nextPassage: () => {
      const { currentPassageList, currentPassageIndex } = get()
      if (currentPassageList.length === 0 || currentPassageIndex >= currentPassageList.length - 1) {
        return
      }
      const newIndex = currentPassageIndex + 1
      set((state) => {
        state.currentPassageIndex = newIndex
        state.currentReference = currentPassageList[newIndex]
        persistNavigationState(state)
      })
    },

    previousPassage: () => {
      const { currentPassageList, currentPassageIndex } = get()
      if (currentPassageList.length === 0 || currentPassageIndex <= 0) {
        return
      }
      const newIndex = currentPassageIndex - 1
      set((state) => {
        state.currentPassageIndex = newIndex
        state.currentReference = currentPassageList[newIndex]
        persistNavigationState(state)
      })
    },

    canGoToNextPassage: () => {
      const { currentPassageList, currentPassageIndex } = get()
      return currentPassageList.length > 0 && currentPassageIndex < currentPassageList.length - 1
    },

    canGoToPreviousPassage: () => {
      const { currentPassageList, currentPassageIndex } = get()
      return currentPassageList.length > 0 && currentPassageIndex > 0
    },
  }
}
