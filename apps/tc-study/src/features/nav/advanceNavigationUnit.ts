/**
 * Mode-aware next/prev unit advance shared by nav-bar chevrons and
 * scripture elastic edge navigation.
 */

import type { BCVReference, BookInfo, NavigationMode } from '../../contexts/types'
import type { NavigationActions } from './navigationTypes'

export type NavigationUnitDirection = 'next' | 'previous'

export function isMultiVerseSpan(ref: Pick<BCVReference, 'chapter' | 'verse' | 'endChapter' | 'endVerse'>): boolean {
  const endChapter = ref.endChapter ?? ref.chapter
  const endVerse = ref.endVerse ?? ref.verse
  return endChapter !== ref.chapter || endVerse !== ref.verse
}

/** First verse after end of a range (or after a single verse). */
export function verseAfterRef(
  ref: Pick<BCVReference, 'book' | 'chapter' | 'verse' | 'endChapter' | 'endVerse'>,
  bookInfo: BookInfo | null | undefined
): BCVReference | null {
  if (!bookInfo?.verses?.length) return null

  const endChapter = ref.endChapter ?? ref.chapter
  const endVerse = ref.endVerse ?? ref.verse
  const versesInEnd = bookInfo.verses[endChapter - 1] ?? 0

  if (endVerse < versesInEnd) {
    return { book: ref.book, chapter: endChapter, verse: endVerse + 1 }
  }

  const chapters = bookInfo.chapters ?? bookInfo.verses.length
  if (endChapter < chapters) {
    return { book: ref.book, chapter: endChapter + 1, verse: 1 }
  }

  return null
}

/** Verse immediately before the start of a range (or before a single verse). */
export function verseBeforeRef(
  ref: Pick<BCVReference, 'book' | 'chapter' | 'verse'>,
  bookInfo: BookInfo | null | undefined
): BCVReference | null {
  if (!bookInfo?.verses?.length) return null

  if (ref.verse > 1) {
    return { book: ref.book, chapter: ref.chapter, verse: ref.verse - 1 }
  }

  if (ref.chapter > 1) {
    const prevChapter = ref.chapter - 1
    const lastVerse = bookInfo.verses[prevChapter - 1] ?? 1
    return { book: ref.book, chapter: prevChapter, verse: lastVerse }
  }

  return null
}

export interface AdvanceNavigationUnitArgs {
  direction: NavigationUnitDirection
  navigationMode: NavigationMode
  currentRef: BCVReference
  navigation: NavigationActions
  hasPassageSet: boolean
}

/**
 * Advance one navigation unit. Returns true when a navigation action ran.
 * Verse custom ranges step past the end/start as a single-verse ref.
 */
export function advanceNavigationUnit(args: AdvanceNavigationUnitArgs): boolean {
  const { direction, navigationMode, currentRef, navigation, hasPassageSet } = args
  const isNext = direction === 'next'

  if (currentRef.book === 'obs') {
    if (navigationMode === 'chapter') {
      if (isNext) {
        if (!navigation.canGoToNextObsStory()) return false
        navigation.nextObsStory()
      } else {
        if (!navigation.canGoToPreviousObsStory()) return false
        navigation.previousObsStory()
      }
      return true
    }
    if (isNext) {
      if (!navigation.canGoToNextObsFrame()) return false
      navigation.nextObsFrame()
    } else {
      if (!navigation.canGoToPreviousObsFrame()) return false
      navigation.previousObsFrame()
    }
    return true
  }

  if (navigationMode === 'passage-set' && hasPassageSet) {
    if (isNext) {
      if (!navigation.canGoToNextPassage()) return false
      navigation.nextPassage()
    } else {
      if (!navigation.canGoToPreviousPassage()) return false
      navigation.previousPassage()
    }
    return true
  }

  if (navigationMode === 'verse') {
    if (isMultiVerseSpan(currentRef)) {
      const bookInfo = navigation.getBookInfo(currentRef.book)
      const target = isNext
        ? verseAfterRef(currentRef, bookInfo)
        : verseBeforeRef(currentRef, bookInfo)
      if (!target) return false
      navigation.navigateToReference(target)
      return true
    }
    if (isNext) {
      if (!navigation.canGoToNextVerse()) return false
      navigation.nextVerse()
    } else {
      if (!navigation.canGoToPreviousVerse()) return false
      navigation.previousVerse()
    }
    return true
  }

  if (navigationMode === 'chapter') {
    if (isNext) {
      if (!navigation.canGoToNextChapter()) return false
      navigation.nextChapter()
    } else {
      if (!navigation.canGoToPreviousChapter()) return false
      navigation.previousChapter()
    }
    return true
  }

  if (navigationMode === 'section') {
    if (isNext) {
      if (!navigation.canGoToNextSection()) return false
      navigation.nextSection()
    } else {
      if (!navigation.canGoToPreviousSection()) return false
      navigation.previousSection()
    }
    return true
  }

  return false
}

export function canAdvanceNavigationUnit(
  args: Omit<AdvanceNavigationUnitArgs, 'direction'> & { direction: NavigationUnitDirection }
): boolean {
  const { direction, navigationMode, currentRef, navigation, hasPassageSet } = args
  const isNext = direction === 'next'

  if (currentRef.book === 'obs') {
    return navigationMode === 'chapter'
      ? isNext
        ? navigation.canGoToNextObsStory()
        : navigation.canGoToPreviousObsStory()
      : isNext
        ? navigation.canGoToNextObsFrame()
        : navigation.canGoToPreviousObsFrame()
  }

  if (navigationMode === 'passage-set') {
    if (!hasPassageSet) return false
    return isNext ? navigation.canGoToNextPassage() : navigation.canGoToPreviousPassage()
  }

  if (navigationMode === 'verse') {
    if (isMultiVerseSpan(currentRef)) {
      const bookInfo = navigation.getBookInfo(currentRef.book)
      return isNext
        ? verseAfterRef(currentRef, bookInfo) != null
        : verseBeforeRef(currentRef, bookInfo) != null
    }
    return isNext ? navigation.canGoToNextVerse() : navigation.canGoToPreviousVerse()
  }

  if (navigationMode === 'chapter') {
    return isNext ? navigation.canGoToNextChapter() : navigation.canGoToPreviousChapter()
  }

  if (navigationMode === 'section') {
    return isNext ? navigation.canGoToNextSection() : navigation.canGoToPreviousSection()
  }

  return false
}
