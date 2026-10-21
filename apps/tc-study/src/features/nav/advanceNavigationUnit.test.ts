import { describe, expect, it, vi } from 'vitest'
import type { BCVReference, BookInfo } from '../../contexts/types'
import type { NavigationActions } from './navigationTypes'
import {
  advanceNavigationUnit,
  canAdvanceNavigationUnit,
  isMultiVerseSpan,
  verseAfterRef,
  verseBeforeRef,
} from './advanceNavigationUnit'

function ref(
  partial: Partial<BCVReference> & Pick<BCVReference, 'book' | 'chapter' | 'verse'>
): BCVReference {
  return { ...partial }
}

const titusBookInfo: BookInfo = {
  code: 'tit',
  name: 'Titus',
  chapters: 3,
  // Titus 1 has 16 verses
  verses: [16, 15, 15],
}

function makeNav(overrides: Partial<NavigationActions> = {}): NavigationActions {
  return {
    navigateToReference: vi.fn(),
    navigateToBook: vi.fn(),
    setAvailableBooks: vi.fn(),
    updateBookVerseCount: vi.fn(),
    getBookInfo: vi.fn(() => titusBookInfo),
    goBack: vi.fn(),
    goForward: vi.fn(),
    goToHistoryIndex: vi.fn(),
    canGoBack: vi.fn(() => false),
    canGoForward: vi.fn(() => false),
    nextVerse: vi.fn(),
    previousVerse: vi.fn(),
    nextChapter: vi.fn(),
    previousChapter: vi.fn(),
    canGoToNextVerse: vi.fn(() => true),
    canGoToPreviousVerse: vi.fn(() => true),
    canGoToNextChapter: vi.fn(() => true),
    canGoToPreviousChapter: vi.fn(() => true),
    setBookSections: vi.fn(),
    nextSection: vi.fn(),
    previousSection: vi.fn(),
    canGoToNextSection: vi.fn(() => true),
    canGoToPreviousSection: vi.fn(() => true),
    loadPassageSet: vi.fn(),
    clearPassageSet: vi.fn(),
    nextPassage: vi.fn(),
    previousPassage: vi.fn(),
    canGoToNextPassage: vi.fn(() => true),
    canGoToPreviousPassage: vi.fn(() => true),
    setNavigationMode: vi.fn(),
    setNavigationScope: vi.fn(),
    setObsStoryFrameCount: vi.fn(),
    nextObsFrame: vi.fn(),
    previousObsFrame: vi.fn(),
    canGoToNextObsFrame: vi.fn(() => true),
    canGoToPreviousObsFrame: vi.fn(() => true),
    nextObsStory: vi.fn(),
    previousObsStory: vi.fn(),
    canGoToNextObsStory: vi.fn(() => true),
    canGoToPreviousObsStory: vi.fn(() => true),
    hasNavigationSource: vi.fn(() => true),
    ...overrides,
  }
}

describe('isMultiVerseSpan', () => {
  it('is false for single verse', () => {
    expect(isMultiVerseSpan(ref({ book: 'tit', chapter: 1, verse: 7 }))).toBe(false)
  })

  it('is true for same-chapter range', () => {
    expect(isMultiVerseSpan(ref({ book: 'tit', chapter: 1, verse: 7, endChapter: 1, endVerse: 8 }))).toBe(
      true
    )
  })
})

describe('verseAfterRef / verseBeforeRef', () => {
  it('steps past range end to next single verse', () => {
    expect(
      verseAfterRef(ref({ book: 'tit', chapter: 1, verse: 7, endChapter: 1, endVerse: 8 }), titusBookInfo)
    ).toEqual({ book: 'tit', chapter: 1, verse: 9 })
  })

  it('steps before range start', () => {
    expect(
      verseBeforeRef(ref({ book: 'tit', chapter: 1, verse: 7, endChapter: 1, endVerse: 8 }), titusBookInfo)
    ).toEqual({ book: 'tit', chapter: 1, verse: 6 })
  })

  it('returns null without book info', () => {
    expect(verseAfterRef(ref({ book: 'tit', chapter: 1, verse: 7, endChapter: 1, endVerse: 8 }), null)).toBeNull()
  })
})

describe('advanceNavigationUnit', () => {
  it('delegates chapter mode', () => {
    const navigation = makeNav()
    expect(
      advanceNavigationUnit({
        direction: 'next',
        navigationMode: 'chapter',
        currentRef: ref({ book: 'tit', chapter: 1, verse: 1 }),
        navigation,
        hasPassageSet: false,
      })
    ).toBe(true)
    expect(navigation.nextChapter).toHaveBeenCalled()
  })

  it('delegates section mode', () => {
    const navigation = makeNav()
    expect(
      advanceNavigationUnit({
        direction: 'previous',
        navigationMode: 'section',
        currentRef: ref({ book: 'tit', chapter: 1, verse: 1 }),
        navigation,
        hasPassageSet: false,
      })
    ).toBe(true)
    expect(navigation.previousSection).toHaveBeenCalled()
  })

  it('delegates passage-set mode', () => {
    const navigation = makeNav()
    expect(
      advanceNavigationUnit({
        direction: 'next',
        navigationMode: 'passage-set',
        currentRef: ref({ book: 'tit', chapter: 1, verse: 1 }),
        navigation,
        hasPassageSet: true,
      })
    ).toBe(true)
    expect(navigation.nextPassage).toHaveBeenCalled()
  })

  it('uses nextVerse for single-verse mode', () => {
    const navigation = makeNav()
    expect(
      advanceNavigationUnit({
        direction: 'next',
        navigationMode: 'verse',
        currentRef: ref({ book: 'tit', chapter: 1, verse: 7 }),
        navigation,
        hasPassageSet: false,
      })
    ).toBe(true)
    expect(navigation.nextVerse).toHaveBeenCalled()
    expect(navigation.navigateToReference).not.toHaveBeenCalled()
  })

  it('steps past verse range end instead of nextVerse', () => {
    const navigation = makeNav()
    expect(
      advanceNavigationUnit({
        direction: 'next',
        navigationMode: 'verse',
        currentRef: ref({ book: 'tit', chapter: 1, verse: 7, endChapter: 1, endVerse: 8 }),
        navigation,
        hasPassageSet: false,
      })
    ).toBe(true)
    expect(navigation.nextVerse).not.toHaveBeenCalled()
    expect(navigation.navigateToReference).toHaveBeenCalledWith({ book: 'tit', chapter: 1, verse: 9 })
  })

  it('steps before verse range start instead of previousVerse', () => {
    const navigation = makeNav()
    expect(
      advanceNavigationUnit({
        direction: 'previous',
        navigationMode: 'verse',
        currentRef: ref({ book: 'tit', chapter: 1, verse: 7, endChapter: 1, endVerse: 8 }),
        navigation,
        hasPassageSet: false,
      })
    ).toBe(true)
    expect(navigation.previousVerse).not.toHaveBeenCalled()
    expect(navigation.navigateToReference).toHaveBeenCalledWith({ book: 'tit', chapter: 1, verse: 6 })
  })
})

describe('canAdvanceNavigationUnit', () => {
  it('reports false when chapter cannot advance', () => {
    const navigation = makeNav({ canGoToNextChapter: vi.fn(() => false) })
    expect(
      canAdvanceNavigationUnit({
        direction: 'next',
        navigationMode: 'chapter',
        currentRef: ref({ book: 'tit', chapter: 1, verse: 1 }),
        navigation,
        hasPassageSet: false,
      })
    ).toBe(false)
  })

  it('reports true for verse range when end has a successor', () => {
    const navigation = makeNav()
    expect(
      canAdvanceNavigationUnit({
        direction: 'next',
        navigationMode: 'verse',
        currentRef: ref({ book: 'tit', chapter: 1, verse: 7, endChapter: 1, endVerse: 8 }),
        navigation,
        hasPassageSet: false,
      })
    ).toBe(true)
  })
})
