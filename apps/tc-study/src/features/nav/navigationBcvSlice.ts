/**
 * Core BCV navigation: navigateToReference, books catalog, mode, hasSource.
 */

import type { BCVReference, BookInfo, NavigationMode } from '../../contexts/types'
import { getStandardVerseCount } from '../../lib/versification'
import {
  coerceReferenceToAvailableBooks,
  fallbackBookIfUnavailable,
  isSameBCVReference,
} from './navigationHelpers'
import { persistNavigationState } from './navigationPersistence'
import type { NavigationGet, NavigationSet, NavigationStore } from './navigationTypes'

export type BcvSlice = Pick<
  NavigationStore,
  | 'navigateToReference'
  | 'navigateToBook'
  | 'setAvailableBooks'
  | 'updateBookVerseCount'
  | 'getBookInfo'
  | 'setNavigationMode'
  | 'hasNavigationSource'
>

export function createBcvSlice(set: NavigationSet, get: NavigationGet): BcvSlice {
  return {
    navigateToReference: (ref: BCVReference) => {
      const current = get().currentReference
      const historyLength = get().navigationHistory.length
      // Partial GL / language switch: snap off books the catalog dropped (incl. deep-links).
      const refToUse = coerceReferenceToAvailableBooks(
        ref,
        get().availableBooks,
        get().navigationScope,
        get().navigationMode,
        get().getBookInfo
      )

      // Check if same reference (but allow if history is empty - for initial navigation)
      if (isSameBCVReference(current, refToUse) && historyLength > 0) return

      set((state) => {
        if (state.navigationHistory.length === 0) {
          state.navigationHistory = [{ ...refToUse }]
          state.historyIndex = 0
        } else {
          state.navigationHistory = state.navigationHistory.slice(0, state.historyIndex + 1)
          state.navigationHistory.push({ ...refToUse })

          if (state.navigationHistory.length > state.maxHistorySize) {
            state.navigationHistory = state.navigationHistory.slice(-state.maxHistorySize)
          }

          state.historyIndex = state.navigationHistory.length - 1
        }

        state.currentReference = refToUse

        // Auto-switch navigation scope to match the reference book so that
        // links in TW/TA articles (and history navigation) always land in the
        // correct mode without callers needing to call setNavigationScope manually.
        if (refToUse.book === 'obs' && state.navigationScope !== 'obs') {
          state.navigationScope = 'obs'
        } else if (refToUse.book !== 'obs' && state.navigationScope !== 'scripture') {
          state.navigationScope = 'scripture'
        }

        persistNavigationState(state)
      })

    },

    navigateToBook: (bookCode: string) => {
      const bookInfo = get().getBookInfo(bookCode)
      if (!bookInfo) {
        console.warn('❌ Book not found:', bookCode)
        return
      }

      get().navigateToReference({
        book: bookCode,
        chapter: 1,
        verse: 1,
      })
    },

    setAvailableBooks: (books: BookInfo[]) => {
      let snapBook: string | null = null
      set((state) => {
        state.availableBooks = books
        // Re-expand current chapter reference if book info just became available
        if (
          state.navigationMode === 'chapter' &&
          state.currentReference.book !== 'obs' &&
          !state.currentReference.endVerse
        ) {
          const bookInfo = books.find((b) => b.code === state.currentReference.book)
          if (bookInfo?.verses && state.currentReference.chapter) {
            const lastVerse = bookInfo.verses[state.currentReference.chapter - 1] ?? 1
            state.currentReference = { ...state.currentReference, verse: 1, endVerse: lastVerse }
          }
        }
        // Language switch / partial GL: leave books the gateway language does not have
        if (state.navigationScope === 'scripture') {
          snapBook = fallbackBookIfUnavailable(state.currentReference.book, books)
        }
      })
      if (snapBook) {
        get().navigateToReference({ book: snapBook, chapter: 1, verse: 1 })
      }
    },

    updateBookVerseCount: (bookCode: string, verses: number[]) => {
      set((state) => {
        const bookIndex = state.availableBooks.findIndex((b) => b.code === bookCode)
        if (bookIndex >= 0) {
          const prev = state.availableBooks[bookIndex].verses ?? []
          const standard = getStandardVerseCount(bookCode) ?? []
          // Never shrink below standard/existing length — chapter-grained SoT
          // often reports only the open chapter (e.g. Psalms → [6]).
          const len = Math.max(standard.length, prev.length, verses.length)
          const merged =
            len <= verses.length
              ? verses.slice()
              : Array.from({ length: len }, (_, i) => {
                  const incoming = verses[i]
                  if (typeof incoming === 'number' && incoming > 0) return incoming
                  const fromPrev = prev[i]
                  if (typeof fromPrev === 'number' && fromPrev > 0) return fromPrev
                  const fromStandard = standard[i]
                  if (typeof fromStandard === 'number' && fromStandard > 0) return fromStandard
                  return 1
                })
          state.availableBooks[bookIndex].verses = merged
          state.availableBooks[bookIndex].chapters = merged.length
          if (
            state.navigationMode === 'chapter' &&
            state.currentReference.book === bookCode &&
            state.currentReference.book !== 'obs' &&
            !state.currentReference.endVerse &&
            state.currentReference.chapter
          ) {
            const lastVerse = merged[state.currentReference.chapter - 1] ?? 1
            state.currentReference = { ...state.currentReference, verse: 1, endVerse: lastVerse }
          }
        }
      })
    },

    getBookInfo: (bookCode: string) => {
      return get().availableBooks.find((b) => b.code === bookCode) || null
    },

    setNavigationMode: (mode: NavigationMode) => {
      set((state) => {
        state.navigationMode = mode
        if (mode === 'chapter') {
          if (state.currentReference.book === 'obs') {
            // Story mode: collapse any range — always show exactly one story at a time.
            // Leaving endChapter in place would make ObsViewer load multiple stories on
            // every arrow click, causing cascading setObsStoryFrameCount store updates.
            state.currentReference = {
              book: 'obs',
              chapter: state.currentReference.chapter || 1,
              verse: 1,
            }
          } else {
            const bookInfo = get().getBookInfo(state.currentReference.book)
            if (bookInfo?.verses && state.currentReference.chapter) {
              const lastVerse = bookInfo.verses[state.currentReference.chapter - 1] ?? 1
              state.currentReference = {
                ...state.currentReference,
                verse: 1,
                endVerse: lastVerse,
              }
            }
          }
        }
        persistNavigationState(state)
      })
    },

    hasNavigationSource: () => {
      const { availableBooks, currentPassageSet, navigationScope } = get()
      return availableBooks.length > 0 || !!currentPassageSet || navigationScope === 'obs'
    },
  }
}
