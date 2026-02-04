/**
 * USFM Processing Types
 * Compatible with @bt-toolkit and bt-synergy ecosystems
 */

// ============================================================================
// USFM JSON Types (from usfm-js library)
// ============================================================================

export interface USFMHeader {
  tag?: string
  content?: string
  type?: string
  text?: string
}

export interface USFMWordObject {
  text: string
  tag: 'w'
  type: 'word'
  occurrence: string
  occurrences: string
}

export interface USFMTextObject {
  type: 'text'
  text: string
}

export interface USFMAlignmentObject {
  tag: 'zaln'
  type: 'milestone'
  strong: string
  lemma: string
  morph: string
  occurrence: string
  occurrences: string
  content: string
  children: (USFMWordObject | USFMTextObject)[]
  endTag: string
}

export interface USFMParagraphObject {
  tag: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
  type: 'paragraph' | 'quote'
  nextChar?: string
}

export type USFMVerseObject = USFMAlignmentObject | USFMTextObject | USFMWordObject | USFMParagraphObject

export interface USFMVerse {
  verseObjects: USFMVerseObject[]
}

export interface USFMChapter {
  [verseNumber: string]: USFMVerse
}

export interface USFMDocument {
  headers: USFMHeader[]
  chapters: { [chapterNumber: string]: USFMChapter }
}

// ============================================================================
// Processed Types (output format)
// ============================================================================

export interface WordToken {
  uniqueId: string
  content: string
  occurrence: number
  totalOccurrences: number
  verseRef: string
  position: {
    start: number
    end: number
  }
  type: 'word' | 'text' | 'punctuation'
  isHighlightable: boolean
  alignmentId?: string
  alignmentGroupId?: string
  alignedOriginalWordIds?: string[]
  alignment?: {
    strong: string
    lemma: string
    morph: string
    occurrence: string
    occurrences: string
    content: string
  }
}

export interface WordAlignment {
  verseRef: string
  sourceWords: string[]
  targetWords: string[]
  alignmentData: {
    strong: string
    lemma: string
    morph: string
    occurrence: string
    occurrences: string
  }[]
}

export interface ProcessedVerse {
  number: number
  text: string
  reference: string
  paragraphId?: string
  hasSectionMarker?: boolean
  sectionMarkers?: number
  alignments?: WordAlignment[]
  wordTokens?: WordToken[]
  isSpan?: boolean
  spanStart?: number
  spanEnd?: number
  originalVerseString?: string
}

export interface ProcessedParagraph {
  id: string
  type: 'paragraph' | 'quote'
  style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
  indentLevel: number
  startVerse: number
  endVerse: number
  verseCount: number
  verseNumbers: number[]
  combinedText: string
  verses: ProcessedVerse[]
}

export interface ProcessedChapter {
  number: number
  verseCount: number
  paragraphCount: number
  verses: ProcessedVerse[]
  paragraphs: ProcessedParagraph[]
}

export interface ProcessedBook {
  id: string
  name: string
  headers: USFMHeader[]
  chapters: ProcessedChapter[]
  totalVerses: number
  totalParagraphs: number
  language?: string
}

/**
 * Translator Section (marked with \ts\* in USFM)
 * Used for section-based navigation
 */
export interface TranslatorSection {
  start: {
    chapter: number
    verse: number
    reference: { chapter: string; verse: string }
  }
  end: {
    chapter: number
    verse: number
    reference: { chapter: string; verse: string }
  }
}

/**
 * Processed Scripture (bt-toolkit compatible format)
 * Top-level wrapper with rich metadata
 */
export interface ProcessedScripture {
  book: string
  bookCode: string
  metadata: {
    bookCode: string
    bookName: string
    processingDate: string
    processingDuration: number
    version: string
    hasAlignments: boolean
    hasSections: boolean
    hasWordTokens: boolean  // ✅ Our enhancement
    totalChapters: number
    totalVerses: number
    totalParagraphs: number
    chapterVerseMap: Record<number, number>  // ✅ Quick lookup: { 1: 31, 2: 25, ... } (chapter → verse count)
    statistics: {
      totalChapters: number
      totalVerses: number
      totalParagraphs: number
      totalSections: number
      totalAlignments: number
      totalWordTokens?: number  // ✅ Our enhancement
    }
  }
  chapters: ProcessedChapter[]
  translatorSections?: TranslatorSection[]
  alignments?: WordAlignment[]
}

/**
 * Processing result with separated concerns
 */
export interface ProcessingResult {
  structuredText: ProcessedScripture
  translatorSections: TranslatorSection[]
  alignments: WordAlignment[]
  metadata: ProcessedScripture['metadata']
}

// ============================================================================
// Processing Options
// ============================================================================

export interface USFMProcessingOptions {
  /**
   * Language code (e.g., 'en', 'hbo', 'el-x-koine')
   */
  language?: string
  
  /**
   * Include word tokens for highlighting
   */
  includeWordTokens?: boolean
  
  /**
   * Include alignment data
   */
  includeAlignments?: boolean
  
  /**
   * Include paragraph structure
   */
  includeParagraphs?: boolean
  
  /**
   * Generate unique IDs for tokens
   */
  generateTokenIds?: boolean
}
