/**
 * Translator-section navigation (set sections + next/prev).
 */

import type { TranslatorSection } from '@bt-synergy/scripture-loader'
import { findSectionIndexForRef } from './bcvNavHelpers'
import type { NavigationGet, NavigationSet, NavigationStore } from './navigationTypes'

export type SectionSlice = Pick<
  NavigationStore,
  | 'setBookSections'
  | 'nextSection'
  | 'previousSection'
  | 'canGoToNextSection'
  | 'canGoToPreviousSection'
>

export function createSectionSlice(set: NavigationSet, get: NavigationGet): SectionSlice {
  return {
    setBookSections: (bookCode: string, sections: TranslatorSection[]) => {
      set((state) => {
        state.currentSections = sections
        state.currentSectionIndex = findSectionIndexForRef(bookCode, state.currentReference, sections)
      })
    },

    nextSection: () => {
      const { currentSections, currentSectionIndex } = get()

      if (currentSections.length === 0) {
        console.warn('❌ Cannot navigate: no sections available')
        return
      }

      const nextIndex = currentSectionIndex + 1
      if (nextIndex < currentSections.length) {
        const nextSection = currentSections[nextIndex]
        get().navigateToReference({
          book: get().currentReference.book,
          chapter: nextSection.start.chapter,
          verse: nextSection.start.verse,
          endChapter:
            nextSection.end.chapter !== nextSection.start.chapter ? nextSection.end.chapter : undefined,
          endVerse: nextSection.end.verse,
        })

        set((state) => {
          state.currentSectionIndex = nextIndex
        })
      }
    },

    previousSection: () => {
      const { currentSections, currentSectionIndex } = get()

      if (currentSections.length === 0) {
        console.warn('❌ Cannot navigate: no sections available')
        return
      }

      const prevIndex = currentSectionIndex - 1
      if (prevIndex >= 0) {
        const prevSection = currentSections[prevIndex]
        get().navigateToReference({
          book: get().currentReference.book,
          chapter: prevSection.start.chapter,
          verse: prevSection.start.verse,
          endChapter:
            prevSection.end.chapter !== prevSection.start.chapter ? prevSection.end.chapter : undefined,
          endVerse: prevSection.end.verse,
        })

        set((state) => {
          state.currentSectionIndex = prevIndex
        })
      }
    },

    canGoToNextSection: () => {
      const { currentSections, currentSectionIndex } = get()
      return currentSections.length > 0 && currentSectionIndex < currentSections.length - 1
    },

    canGoToPreviousSection: () => get().currentSectionIndex > 0,
  }
}
