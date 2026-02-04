/**
 * Processed Content Types
 * 
 * Defines the structure of processed content for different resource types.
 * These types represent the final, processed data structure that gets stored
 * and used throughout the application.
 */

import type { OptimizedChapter, OptimizedToken } from './parsers/usfm/usfm-processor';

// ============================================================================
// TRANSLATION NOTES
// ============================================================================

export interface TranslationNote {
  reference: string;
  id: string;
  tags: string;
  supportReference: string;
  quote: string;
  occurrence: string;
  note: string;
  quoteTokens?: OptimizedToken[]; // Original language tokens for the quote (calculated in NotesViewer)
}

export interface ProcessedNotes {
  bookCode: string;
  bookName: string;
  notes: TranslationNote[];
  notesByChapter: Record<string, TranslationNote[]>;
  metadata: {
    bookCode: string;
    bookName: string;
    processingDate: string;
    totalNotes: number;
    chaptersWithNotes: number[];
    statistics: {
      totalNotes: number;
      notesPerChapter: Record<string, number>;
    };
  };
}

// ============================================================================
// TRANSLATION QUESTIONS
// ============================================================================

export interface TranslationQuestion {
  reference: string;
  id: string;
  tags: string;
  quote: string;
  occurrence: string;
  question: string;
  response: string;
}

export interface ProcessedQuestions {
  bookCode: string;
  bookName: string;
  questions: TranslationQuestion[];
  questionsByChapter: Record<string, TranslationQuestion[]>;
  metadata: {
    bookCode: string;
    bookName: string;
    processingDate: string;
    totalQuestions: number;
    chaptersWithQuestions: number[];
    statistics: {
      totalQuestions: number;
      questionsPerChapter: Record<string, number>;
    };
  };
}

// ============================================================================
// TRANSLATION WORDS LINKS
// ============================================================================

export interface TranslationWordsLink {
  reference: string;     // Scripture reference (e.g., "1:1")
  id: string;           // Short identifier (e.g., "trr8") or RC link (rc://*/tw/dict/bible/kt/god)
  tags: string;         // Category (kt, names, other)
  origWords: string;    // Original language words
  occurrence: string;   // Occurrence number
  articlePath: string;  // Extracted path (bible/kt/god) - extracted from twLink
  twLink?: string;      // RC link to Translation Words article (rc://*/tw/dict/bible/kt/god) - from 6th TSV column
  quoteTokens?: OptimizedToken[]; // Original language tokens for the origWords (calculated in TranslationWordsLinksViewer)
}

export interface ProcessedWordsLinks {
  bookCode: string;
  bookName: string;
  links: TranslationWordsLink[];
  linksByChapter: Record<string, TranslationWordsLink[]>;
  metadata: {
    bookCode: string;
    bookName: string;
    processingDate: string;
    totalLinks: number;
    chaptersWithLinks: number[];
    statistics: {
      totalLinks: number;
      linksPerChapter: Record<string, number>;
    };
  };
}

// ============================================================================
// TRANSLATION WORDS
// ============================================================================

export interface TranslationWord {
  id: string;
  term: string;
  definition: string;
}

// ============================================================================
// ACADEMY ARTICLES
// ============================================================================

export interface AcademyArticle {
  id: string;
  title: string;
  content: string;
}

// ============================================================================
// MAIN PROCESSED CONTENT INTERFACE
// ============================================================================

export interface ProcessedContent {
  // Content structure varies by resource type
  chapters?: OptimizedChapter[];     // For scripture
  notes?: ProcessedNotes;            // For translation notes (full structure with metadata)
  words?: TranslationWord[];         // For translation words
  article?: AcademyArticle;          // For academy articles
  questions?: ProcessedQuestions;    // For translation questions
  wordsLinks?: ProcessedWordsLinks;  // For translation words links
}

// Re-export OptimizedToken for convenience
export type { OptimizedToken } from './parsers/usfm/usfm-processor';

