/**
 * ReferenceNavigator - Calculate next/previous verses, chapters, and books
 */

import { BookInfo, NavigationError, NavigationErrorCode, VerseReference } from './types'
import { ReferenceParser } from './ReferenceParser'

export class ReferenceNavigator {
  private bookRegistry: Map<string, BookInfo> = new Map()

  constructor(books?: BookInfo[]) {
    if (books) {
      this.registerBooks(books)
    }
  }

  /**
   * Register book metadata for validation and navigation
   */
  registerBooks(books: BookInfo[]): void {
    books.forEach((book) => {
      this.bookRegistry.set(book.code, book)
    })
  }

  /**
   * Register a single book
   */
  registerBook(book: BookInfo): void {
    this.bookRegistry.set(book.code, book)
  }

  /**
   * Get book info
   */
  getBook(code: string): BookInfo | undefined {
    return this.bookRegistry.get(code.toLowerCase())
  }

  /**
   * Get all registered books
   */
  getAllBooks(): BookInfo[] {
    return Array.from(this.bookRegistry.values())
  }

  /**
   * Calculate the next verse after a reference
   * If reference is a range, starts from the end of the range
   */
  getNextVerse(ref: VerseReference): VerseReference {
    // Start from the end of the range
    const lastBook = ref.bookEnd || ref.book
    const lastChapter = ref.chapterEnd || ref.chapter
    const lastVerse = ref.verseEnd || ref.verse

    const bookInfo = this.getBook(lastBook)
    if (!bookInfo) {
      throw new NavigationError(
        `Book not found: ${lastBook}`,
        NavigationErrorCode.INVALID_BOOK,
        { ref }
      )
    }

    // Check if there's a next verse in the current chapter
    const versesInChapter = bookInfo.versesByChapter[lastChapter - 1]
    if (lastVerse < versesInChapter) {
      return {
        book: lastBook,
        chapter: lastChapter,
        verse: lastVerse + 1,
      }
    }

    // Move to next chapter
    if (lastChapter < bookInfo.chapterCount) {
      return {
        book: lastBook,
        chapter: lastChapter + 1,
        verse: 1,
      }
    }

    // Move to next book
    const nextBook = this.getNextBook(lastBook)
    if (!nextBook) {
      throw new NavigationError(
        `No book after ${lastBook}`,
        NavigationErrorCode.OUT_OF_BOUNDS,
        { ref }
      )
    }

    return {
      book: nextBook.code,
      chapter: 1,
      verse: 1,
    }
  }

  /**
   * Calculate the previous verse before a reference
   */
  getPreviousVerse(ref: VerseReference): VerseReference {
    const { book, chapter, verse } = ReferenceParser.getStart(ref)

    // Check if there's a previous verse in the current chapter
    if (verse > 1) {
      return {
        book,
        chapter,
        verse: verse - 1,
      }
    }

    // Move to previous chapter
    const bookInfo = this.getBook(book)
    if (!bookInfo) {
      throw new NavigationError(
        `Book not found: ${book}`,
        NavigationErrorCode.INVALID_BOOK,
        { ref }
      )
    }

    if (chapter > 1) {
      const prevChapter = chapter - 1
      const versesInPrevChapter = bookInfo.versesByChapter[prevChapter - 1]
      return {
        book,
        chapter: prevChapter,
        verse: versesInPrevChapter,
      }
    }

    // Move to previous book
    const prevBook = this.getPreviousBook(book)
    if (!prevBook) {
      throw new NavigationError(
        `No book before ${book}`,
        NavigationErrorCode.OUT_OF_BOUNDS,
        { ref }
      )
    }

    const lastChapter = prevBook.chapterCount
    const lastVerse = prevBook.versesByChapter[lastChapter - 1]

    return {
      book: prevBook.code,
      chapter: lastChapter,
      verse: lastVerse,
    }
  }

  /**
   * Get the next chapter
   */
  getNextChapter(ref: VerseReference): VerseReference {
    const bookInfo = this.getBook(ref.book)
    if (!bookInfo) {
      throw new NavigationError(
        `Book not found: ${ref.book}`,
        NavigationErrorCode.INVALID_BOOK,
        { ref }
      )
    }

    if (ref.chapter < bookInfo.chapterCount) {
      return {
        book: ref.book,
        chapter: ref.chapter + 1,
        verse: 1,
      }
    }

    // Move to next book
    const nextBook = this.getNextBook(ref.book)
    if (!nextBook) {
      throw new NavigationError(
        `No book after ${ref.book}`,
        NavigationErrorCode.OUT_OF_BOUNDS,
        { ref }
      )
    }

    return {
      book: nextBook.code,
      chapter: 1,
      verse: 1,
    }
  }

  /**
   * Get the previous chapter
   */
  getPreviousChapter(ref: VerseReference): VerseReference {
    if (ref.chapter > 1) {
      return {
        book: ref.book,
        chapter: ref.chapter - 1,
        verse: 1,
      }
    }

    // Move to previous book
    const prevBook = this.getPreviousBook(ref.book)
    if (!prevBook) {
      throw new NavigationError(
        `No book before ${ref.book}`,
        NavigationErrorCode.OUT_OF_BOUNDS,
        { ref }
      )
    }

    return {
      book: prevBook.code,
      chapter: prevBook.chapterCount,
      verse: 1,
    }
  }

  /**
   * Get the next book after the given book
   */
  getNextBook(bookCode: string): BookInfo | null {
    const books = this.getAllBooks().sort((a, b) => {
      // Sort by sortOrder if both have it
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        return a.sortOrder - b.sortOrder
      }
      // Otherwise sort by testament (OT before NT)
      if (a.testament !== b.testament) {
        return a.testament === 'OT' ? -1 : 1
      }
      // Books should be registered in canonical order within testament
      return 0
    })

    const currentIndex = books.findIndex((b) => b.code === bookCode)
    if (currentIndex === -1 || currentIndex === books.length - 1) {
      return null
    }

    return books[currentIndex + 1]
  }

  /**
   * Get the previous book before the given book
   */
  getPreviousBook(bookCode: string): BookInfo | null {
    const books = this.getAllBooks().sort((a, b) => {
      // Sort by sortOrder if both have it
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        return a.sortOrder - b.sortOrder
      }
      // Otherwise sort by testament (OT before NT)
      if (a.testament !== b.testament) {
        return a.testament === 'OT' ? -1 : 1
      }
      // Books should be registered in canonical order within testament
      return 0
    })

    const currentIndex = books.findIndex((b) => b.code === bookCode)
    if (currentIndex <= 0) {
      return null
    }

    return books[currentIndex - 1]
  }

  /**
   * Validate a reference against registered book metadata
   */
  validate(ref: VerseReference): boolean {
    const bookInfo = this.getBook(ref.book)
    if (!bookInfo) {
      return false
    }

    if (ref.chapter < 1 || ref.chapter > bookInfo.chapterCount) {
      return false
    }

    const versesInChapter = bookInfo.versesByChapter[ref.chapter - 1]
    if (ref.verse < 1 || ref.verse > versesInChapter) {
      return false
    }

    // Validate end of range if present
    if (ref.chapterEnd || ref.verseEnd) {
      const endBook = this.getBook(ref.bookEnd || ref.book)
      if (!endBook) {
        return false
      }

      const endChapter = ref.chapterEnd || ref.chapter
      if (endChapter < 1 || endChapter > endBook.chapterCount) {
        return false
      }

      const versesInEndChapter = endBook.versesByChapter[endChapter - 1]
      const endVerse = ref.verseEnd || ref.verse
      if (endVerse < 1 || endVerse > versesInEndChapter) {
        return false
      }
    }

    return true
  }
}
