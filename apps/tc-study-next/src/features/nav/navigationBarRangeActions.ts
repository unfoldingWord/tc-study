import type { BCVReference, NavigationMode } from '../../contexts/types'
import type { NavigationActions } from './navigationTypes'

type NavRange = Pick<NavigationActions, 'navigateToReference' | 'getBookInfo'>

const verseKey = (ch: number, v: number) => ch * 1000 + v

export function expandRangeBackward(
  navigation: NavRange,
  currentRef: BCVReference,
  navigationMode: NavigationMode
): void {
  if (navigationMode !== 'verse') return
  if (currentRef.book === 'obs') return

  const bookInfo = navigation.getBookInfo(currentRef.book)
  if (!bookInfo) return

  const startChapter = currentRef.chapter
  const startVerse = currentRef.verse
  const endChapter = currentRef.endChapter || currentRef.chapter
  const endVerse = currentRef.endVerse || currentRef.verse

  let newStartChapter = startChapter
  let newStartVerse = startVerse - 1

  if (newStartVerse < 1) {
    newStartChapter = startChapter - 1
    if (newStartChapter >= 1) {
      newStartVerse = bookInfo.verses?.[newStartChapter - 1] || 1
    } else {
      return
    }
  }

  navigation.navigateToReference({
    book: currentRef.book,
    chapter: newStartChapter,
    verse: newStartVerse,
    endChapter,
    endVerse,
  })
}

export function expandRangeForward(
  navigation: NavRange,
  currentRef: BCVReference,
  navigationMode: NavigationMode
): void {
  if (navigationMode !== 'verse') return
  if (currentRef.book === 'obs') return

  const bookInfo = navigation.getBookInfo(currentRef.book)
  if (!bookInfo) return

  const startChapter = currentRef.chapter
  const startVerse = currentRef.verse
  const endChapter = currentRef.endChapter || currentRef.chapter
  const endVerse = currentRef.endVerse || currentRef.verse

  let newEndChapter = endChapter
  let newEndVerse = endVerse + 1
  const maxVerseInChapter = bookInfo.verses?.[newEndChapter - 1] || 0

  if (newEndVerse > maxVerseInChapter) {
    newEndChapter = endChapter + 1
    if (newEndChapter <= (bookInfo.verses ?? []).length) {
      newEndVerse = 1
    } else {
      return
    }
  }

  navigation.navigateToReference({
    book: currentRef.book,
    chapter: startChapter,
    verse: startVerse,
    endChapter: newEndChapter,
    endVerse: newEndVerse,
  })
}

export function canExpandRangeBackward(
  navigation: NavRange,
  currentRef: BCVReference,
  navigationMode: NavigationMode
): boolean {
  if (navigationMode !== 'verse') return false
  if (currentRef.book === 'obs') return false
  const bookInfo = navigation.getBookInfo(currentRef.book)
  if (!bookInfo) return false
  return currentRef.verse > 1 || currentRef.chapter > 1
}

export function canExpandRangeForward(
  navigation: NavRange,
  currentRef: BCVReference,
  navigationMode: NavigationMode
): boolean {
  if (navigationMode !== 'verse') return false
  if (currentRef.book === 'obs') return false
  const bookInfo = navigation.getBookInfo(currentRef.book)
  if (!bookInfo) return false
  const endChapter = currentRef.endChapter || currentRef.chapter
  const endVerse = currentRef.endVerse || currentRef.verse
  const maxVerse = bookInfo.verses?.[endChapter - 1] || 0
  return endVerse < maxVerse || endChapter < (bookInfo.verses ?? []).length
}

export function shrinkRangeFromStart(
  navigation: NavRange,
  currentRef: BCVReference,
  navigationMode: NavigationMode
): void {
  if (navigationMode !== 'verse') return
  if (currentRef.book === 'obs') return

  const bookInfo = navigation.getBookInfo(currentRef.book)
  if (!bookInfo) return

  const startChapter = currentRef.chapter
  const startVerse = currentRef.verse
  const endChapter = currentRef.endChapter || currentRef.chapter
  const endVerse = currentRef.endVerse || currentRef.verse

  if (startChapter === endChapter && startVerse === endVerse) return

  let newStartChapter = startChapter
  let newStartVerse = startVerse + 1
  const maxVerseInChapter = bookInfo.verses?.[startChapter - 1] || 0

  if (newStartVerse > maxVerseInChapter) {
    newStartChapter = startChapter + 1
    newStartVerse = 1
  }

  if (verseKey(newStartChapter, newStartVerse) >= verseKey(endChapter, endVerse)) {
    navigation.navigateToReference({
      book: currentRef.book,
      chapter: endChapter,
      verse: endVerse,
    })
    return
  }

  navigation.navigateToReference({
    book: currentRef.book,
    chapter: newStartChapter,
    verse: newStartVerse,
    endChapter,
    endVerse,
  })
}

export function shrinkRangeFromEnd(
  navigation: NavRange,
  currentRef: BCVReference,
  navigationMode: NavigationMode
): void {
  if (navigationMode !== 'verse') return
  if (currentRef.book === 'obs') return

  const bookInfo = navigation.getBookInfo(currentRef.book)
  if (!bookInfo) return

  const startChapter = currentRef.chapter
  const startVerse = currentRef.verse
  const endChapter = currentRef.endChapter || currentRef.chapter
  const endVerse = currentRef.endVerse || currentRef.verse

  if (startChapter === endChapter && startVerse === endVerse) return

  let newEndChapter = endChapter
  let newEndVerse = endVerse - 1

  if (newEndVerse < 1) {
    newEndChapter = endChapter - 1
    if (newEndChapter >= 1) {
      newEndVerse = bookInfo.verses?.[newEndChapter - 1] || 1
    } else {
      return
    }
  }

  if (verseKey(newEndChapter, newEndVerse) <= verseKey(startChapter, startVerse)) {
    navigation.navigateToReference({
      book: currentRef.book,
      chapter: startChapter,
      verse: startVerse,
    })
    return
  }

  navigation.navigateToReference({
    book: currentRef.book,
    chapter: startChapter,
    verse: startVerse,
    endChapter: newEndChapter,
    endVerse: newEndVerse,
  })
}

export function canShrinkRange(
  currentRef: BCVReference,
  navigationMode: NavigationMode
): boolean {
  if (navigationMode !== 'verse') return false
  const endChapter = currentRef.endChapter || currentRef.chapter
  const endVerse = currentRef.endVerse || currentRef.verse
  return !(currentRef.chapter === endChapter && currentRef.verse === endVerse)
}
