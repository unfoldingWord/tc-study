/**
 * Verse / chapter arrow navigation and canGo* predicates.
 */

import type { NavigationGet, NavigationStore } from './navigationTypes'

export type VerseChapterSlice = Pick<
  NavigationStore,
  | 'nextVerse'
  | 'previousVerse'
  | 'nextChapter'
  | 'previousChapter'
  | 'canGoToNextVerse'
  | 'canGoToPreviousVerse'
  | 'canGoToNextChapter'
  | 'canGoToPreviousChapter'
>

export function createVerseChapterSlice(get: NavigationGet): VerseChapterSlice {
  return {
    nextVerse: () => {
      const { currentReference, availableBooks } = get()
      const bookInfo = get().getBookInfo(currentReference.book)

      if (!bookInfo || !bookInfo.verses) {
        console.warn('❌ Cannot navigate: no book info available')
        return
      }

      const currentChapter = currentReference.chapter
      const currentVerse = currentReference.verse
      const versesInChapter = bookInfo.verses[currentChapter - 1] || 0

      if (currentVerse < versesInChapter) {
        get().navigateToReference({
          book: currentReference.book,
          chapter: currentChapter,
          verse: currentVerse + 1,
        })
      } else if (currentChapter < (bookInfo.chapters ?? 0)) {
        get().navigateToReference({
          book: currentReference.book,
          chapter: currentChapter + 1,
          verse: 1,
        })
      } else {
        const currentBookIndex = availableBooks.findIndex((b) => b.code === currentReference.book)
        if (currentBookIndex >= 0 && currentBookIndex < availableBooks.length - 1) {
          const nextBook = availableBooks[currentBookIndex + 1]
          get().navigateToReference({
            book: nextBook.code,
            chapter: 1,
            verse: 1,
          })
        }
      }
    },

    previousVerse: () => {
      const { currentReference, availableBooks } = get()
      const bookInfo = get().getBookInfo(currentReference.book)

      if (!bookInfo || !bookInfo.verses) {
        console.warn('❌ Cannot navigate: no book info available')
        return
      }

      const currentChapter = currentReference.chapter
      const currentVerse = currentReference.verse

      if (currentVerse > 1) {
        get().navigateToReference({
          book: currentReference.book,
          chapter: currentChapter,
          verse: currentVerse - 1,
        })
      } else if (currentChapter > 1) {
        const previousChapterVerses = bookInfo.verses[currentChapter - 2] || 1
        get().navigateToReference({
          book: currentReference.book,
          chapter: currentChapter - 1,
          verse: previousChapterVerses,
        })
      } else {
        const currentBookIndex = availableBooks.findIndex((b) => b.code === currentReference.book)
        if (currentBookIndex > 0) {
          const previousBook = availableBooks[currentBookIndex - 1]
          const previousBookInfo = get().getBookInfo(previousBook.code)
          if (previousBookInfo && previousBookInfo.verses) {
            const lastChapter = previousBookInfo.chapters ?? 1
            const lastVerse = previousBookInfo.verses[lastChapter - 1] ?? 1
            get().navigateToReference({
              book: previousBook.code,
              chapter: lastChapter,
              verse: lastVerse,
            })
          }
        }
      }
    },

    nextChapter: () => {
      const { currentReference, availableBooks, navigationMode } = get()
      const bookInfo = get().getBookInfo(currentReference.book)

      if (!bookInfo) {
        console.warn('❌ Cannot navigate: no book info available')
        return
      }

      const currentChapter = currentReference.chapter
      const chapters = bookInfo.chapters ?? 0
      if (currentChapter < chapters) {
        const newChapter = currentChapter + 1
        const lastVerse =
          navigationMode === 'chapter' && bookInfo.verses ? (bookInfo.verses[newChapter - 1] ?? 1) : undefined
        get().navigateToReference({
          book: currentReference.book,
          chapter: newChapter,
          verse: 1,
          ...(lastVerse !== undefined && { endVerse: lastVerse }),
        })
      } else {
        const currentBookIndex = availableBooks.findIndex((b) => b.code === currentReference.book)
        if (currentBookIndex >= 0 && currentBookIndex < availableBooks.length - 1) {
          const nextBook = availableBooks[currentBookIndex + 1]
          const nextBookInfo = get().getBookInfo(nextBook.code)
          const lastVerse =
            navigationMode === 'chapter' && nextBookInfo?.verses ? (nextBookInfo.verses[0] ?? 1) : undefined
          get().navigateToReference({
            book: nextBook.code,
            chapter: 1,
            verse: 1,
            ...(lastVerse !== undefined && { endVerse: lastVerse }),
          })
        }
      }
    },

    previousChapter: () => {
      const { currentReference, availableBooks, navigationMode } = get()
      const bookInfo = get().getBookInfo(currentReference.book)

      if (!bookInfo) {
        console.warn('❌ Cannot navigate: no book info available')
        return
      }

      const currentChapter = currentReference.chapter

      if (currentChapter > 1) {
        const newChapter = currentChapter - 1
        const lastVerse =
          navigationMode === 'chapter' && bookInfo.verses ? (bookInfo.verses[newChapter - 1] ?? 1) : undefined
        get().navigateToReference({
          book: currentReference.book,
          chapter: newChapter,
          verse: 1,
          ...(lastVerse !== undefined && { endVerse: lastVerse }),
        })
      } else {
        const currentBookIndex = availableBooks.findIndex((b) => b.code === currentReference.book)
        if (currentBookIndex > 0) {
          const previousBook = availableBooks[currentBookIndex - 1]
          const previousBookInfo = get().getBookInfo(previousBook.code)
          if (previousBookInfo) {
            const prevChapter = previousBookInfo.chapters ?? 1
            const lastVerse =
              navigationMode === 'chapter' && previousBookInfo.verses
                ? (previousBookInfo.verses[prevChapter - 1] ?? 1)
                : undefined
            get().navigateToReference({
              book: previousBook.code,
              chapter: prevChapter,
              verse: 1,
              ...(lastVerse !== undefined && { endVerse: lastVerse }),
            })
          }
        }
      }
    },

    canGoToNextVerse: () => {
      const { currentReference, availableBooks } = get()
      const bookInfo = get().getBookInfo(currentReference.book)

      if (!bookInfo || !bookInfo.verses) return false

      const currentChapter = currentReference.chapter
      const currentVerse = currentReference.verse
      const versesInChapter = bookInfo.verses[currentChapter - 1] || 0

      if (currentVerse < versesInChapter) return true
      if (currentChapter < (bookInfo.chapters ?? 0)) return true

      const currentBookIndex = availableBooks.findIndex((b) => b.code === currentReference.book)
      return currentBookIndex >= 0 && currentBookIndex < availableBooks.length - 1
    },

    canGoToPreviousVerse: () => {
      const { currentReference, availableBooks } = get()
      const bookInfo = get().getBookInfo(currentReference.book)

      if (!bookInfo || !bookInfo.verses) return false

      const currentChapter = currentReference.chapter
      const currentVerse = currentReference.verse

      if (currentVerse > 1) return true
      if (currentChapter > 1) return true

      const currentBookIndex = availableBooks.findIndex((b) => b.code === currentReference.book)
      return currentBookIndex > 0
    },

    canGoToNextChapter: () => {
      const { currentReference, availableBooks } = get()
      const bookInfo = get().getBookInfo(currentReference.book)
      if (!bookInfo) return false
      const currentChapter = currentReference.chapter
      if (currentChapter < (bookInfo.chapters ?? 0)) return true
      const currentBookIndex = availableBooks.findIndex((b) => b.code === currentReference.book)
      return currentBookIndex >= 0 && currentBookIndex < availableBooks.length - 1
    },

    canGoToPreviousChapter: () => {
      const { currentReference, availableBooks } = get()
      const bookInfo = get().getBookInfo(currentReference.book)

      if (!bookInfo) return false

      const currentChapter = currentReference.chapter
      if (currentChapter > 1) return true

      const currentBookIndex = availableBooks.findIndex((b) => b.code === currentReference.book)
      return currentBookIndex > 0
    },
  }
}
