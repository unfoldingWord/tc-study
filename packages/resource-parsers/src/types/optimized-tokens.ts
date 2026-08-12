/**
 * Optimized token / chapter DTOs for QuoteMatcher and Helps.
 *
 * Prefer projecting from UsjScriptureViewModel via viewModelToOptimizedChapters
 * (parsers/usfm/usj-projection.ts). Kept as a stable DTO for Helps matchers.
 */

export interface OptimizedToken {
  /** Numeric ID (semantic for original language, sequential for target language) */
  id: number
  /** The actual text content */
  text: string
  /** Token type for rendering logic */
  type: 'word' | 'punctuation' | 'number' | 'whitespace' | 'paragraph-marker'
  /** Array of semantic IDs this token aligns to (target language only) */
  align?: number[]
  /** Strong's number (original language only) */
  strong?: string
  /** Lemma (original language only) */
  lemma?: string
  /** Morphology (original language only) */
  morph?: string
  /** Occurrence number within the verse (calculated by QuoteMatcher for alignment) */
  occurrence?: number
  /** Paragraph segment information for intra-verse formatting */
  paragraphSegment?: {
    id: number
    style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
    type: 'paragraph' | 'quote'
    indentLevel: number
  }
  /** Paragraph marker properties (only for paragraph-marker tokens) */
  paragraphMarker?: {
    style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
    type: 'paragraph' | 'quote'
    indentLevel: number
    /** Whether this marker starts a new paragraph or continues formatting within a verse */
    isNewParagraph: boolean
  }
}

export interface OptimizedVerse {
  number: number
  text: string
  paragraphId?: number
  tokens: OptimizedToken[]
  isSpan?: boolean
  spanStart?: number
  spanEnd?: number
  originalVerseString?: string
}

export interface OptimizedParagraph {
  id: number
  type: 'paragraph' | 'quote'
  style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
  indentLevel: number
  startVerse: number
  endVerse: number
  verseNumbers: number[]
}

export interface OptimizedChapter {
  number: number
  verseCount: number
  paragraphCount: number
  verses: OptimizedVerse[]
}
