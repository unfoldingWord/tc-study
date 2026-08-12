/**
 * Shared Navigation store state/action contracts.
 * Slices under features/nav compose into useNavigationStore.
 */

import type { TranslatorSection } from '@bt-synergy/scripture-loader'
import type { BCVReference, BookInfo, NavigationCatalogScope, NavigationMode, PassageSet } from '../../contexts/types'

export interface NavigationState {
  currentReference: BCVReference
  availableBooks: BookInfo[]
  navigationHistory: BCVReference[]
  historyIndex: number
  maxHistorySize: number

  currentSections: TranslatorSection[]
  currentSectionIndex: number

  currentPassageSet: PassageSet | null
  /** Flat list of BCV refs derived from currentPassageSet.root */
  currentPassageList: BCVReference[]
  currentPassageIndex: number
  navigationMode: NavigationMode

  /** Bible vs OBS catalog (navigator tab + arrow semantics) */
  navigationScope: NavigationCatalogScope
  /** Per-story frame counts for OBS (story number → frames), filled by ObsViewer */
  obsFrameCountByStory: Record<string, number>
}

export interface NavigationActions {
  navigateToReference: (ref: BCVReference) => void
  navigateToBook: (bookCode: string) => void
  setAvailableBooks: (books: BookInfo[]) => void
  updateBookVerseCount: (bookCode: string, verses: number[]) => void
  getBookInfo: (bookCode: string) => BookInfo | null
  goBack: () => void
  goForward: () => void
  goToHistoryIndex: (index: number) => void
  canGoBack: () => boolean
  canGoForward: () => boolean

  nextVerse: () => void
  previousVerse: () => void
  nextChapter: () => void
  previousChapter: () => void
  canGoToNextVerse: () => boolean
  canGoToPreviousVerse: () => boolean
  canGoToNextChapter: () => boolean
  canGoToPreviousChapter: () => boolean

  setBookSections: (bookCode: string, sections: TranslatorSection[]) => void
  nextSection: () => void
  previousSection: () => void
  canGoToNextSection: () => boolean
  canGoToPreviousSection: () => boolean

  loadPassageSet: (passageSet: PassageSet) => void
  clearPassageSet: () => void
  nextPassage: () => void
  previousPassage: () => void
  canGoToNextPassage: () => boolean
  canGoToPreviousPassage: () => boolean
  setNavigationMode: (mode: NavigationMode) => void

  setNavigationScope: (scope: NavigationCatalogScope) => void
  setObsStoryFrameCount: (storyNumber: number, frameCount: number) => void
  nextObsFrame: () => void
  previousObsFrame: () => void
  canGoToNextObsFrame: () => boolean
  canGoToPreviousObsFrame: () => boolean
  nextObsStory: () => void
  previousObsStory: () => void
  canGoToNextObsStory: () => boolean
  canGoToPreviousObsStory: () => boolean

  hasNavigationSource: () => boolean
}

export type NavigationStore = NavigationState & NavigationActions

/** Immer-friendly set used by nav slices (matches zustand/immer recipe usage). */
export type NavigationSet = (fn: (state: NavigationStore) => void) => void
export type NavigationGet = () => NavigationStore
