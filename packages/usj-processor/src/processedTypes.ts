/**
 * Transitional ProcessedScripture DTO types (projection from UsjScriptureViewModel).
 *
 * Runtime identity SoT: UsjScriptureViewModel / UsjWordToken.
 * Keep these types for ResourceLoader.loadContent + cache migrate helpers.
 */

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
    content: string
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
 * Processed Scripture — transitional Helps / TokenRenderer projection from USJ.
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
    hasWordTokens: boolean
    totalChapters: number
    totalVerses: number
    totalParagraphs: number
    chapterVerseMap: Record<number, number>
    statistics: {
      totalChapters: number
      totalVerses: number
      totalParagraphs: number
      totalSections: number
      totalAlignments: number
      totalWordTokens?: number
    }
  }
  chapters: ProcessedChapter[]
  translatorSections?: TranslatorSection[]
  alignments?: WordAlignment[]
}

export interface ProcessingResult {
  structuredText: ProcessedScripture
  translatorSections: TranslatorSection[]
  alignments: WordAlignment[]
  metadata: ProcessedScripture['metadata']
}

export interface USJProcessingOptions {
  language?: string
  includeWordTokens?: boolean
  includeAlignments?: boolean
  includeParagraphs?: boolean
  generateTokenIds?: boolean
}
