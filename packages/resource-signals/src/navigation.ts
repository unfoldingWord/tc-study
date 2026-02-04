/**
 * Navigation Signals
 * 
 * Cross-platform signals for navigating between biblical content.
 * Work identically on web and mobile.
 */

import type { BaseSignal } from './index'

/**
 * Verse Navigation Signal
 * Navigate to a specific verse in scripture
 * 
 * @example
 * ```typescript
 * sendSignal<VerseNavigationSignal>('verse-navigation', {
 *   verse: { book: 'JHN', chapter: 3, verse: 16 }
 * })
 * ```
 */
export interface VerseNavigationSignal extends BaseSignal {
  type: 'verse-navigation'
  verse: {
    book: string        // USFM book code (e.g., 'GEN', 'MAT')
    chapter: number
    verse?: number      // Optional: navigate to chapter if omitted
    endVerse?: number   // Optional: verse range
  }
}

/**
 * Book Navigation Signal
 * Navigate to a book or chapter
 * 
 * @example
 * ```typescript
 * sendSignal<BookNavigationSignal>('book-navigation', {
 *   location: { book: 'GEN', chapter: 1 }
 * })
 * ```
 */
export interface BookNavigationSignal extends BaseSignal {
  type: 'book-navigation'
  location: {
    book: string
    chapter?: number    // Optional: navigate to book TOC if omitted
  }
}

