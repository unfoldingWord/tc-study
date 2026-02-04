/**
 * Utility functions for extracting and filtering scripture tokens
 */

import type { OptimizedScripture, OptimizedToken } from '../services/usfm-processor';

export interface NavigationReference {
  book: string;
  chapter: number;
  verse: number;
  endChapter?: number;
  endVerse?: number;
}

/**
 * Extract tokens from scripture content based on navigation reference range
 * @param scripture The optimized scripture content
 * @param reference The navigation reference (verse range)
 * @returns Array of tokens from the filtered verse range
 */
export function extractTokensFromVerseRange(
  scripture: OptimizedScripture,
  reference: NavigationReference
): OptimizedToken[] {
  if (!scripture || !reference.chapter || !reference.verse) {
    return [];
  }

  const tokens: OptimizedToken[] = [];
  
  // Determine the range to process
  const startChapter = reference.chapter;
  const startVerse = reference.verse;
  const endChapter = reference.endChapter || reference.chapter;
  const endVerse = reference.endVerse || reference.verse;

  

  // Iterate through chapters in the scripture
  for (const chapter of scripture.chapters) {
    // Skip chapters outside our range
    if (chapter.number < startChapter || chapter.number > endChapter) {
      continue;
    }

    // Iterate through verses in the chapter
    for (const verse of chapter.verses) {
      // Determine if this verse is in our range
      const isInRange = isVerseInRange(
        chapter.number,
        verse.number,
        startChapter,
        startVerse,
        endChapter,
        endVerse
      );

      if (isInRange) {
        // Add all tokens from this verse
        tokens.push(...verse.tokens);
        
      }
    }
  }

  
  return tokens;
}

/**
 * Check if a verse is within the specified range
 */
function isVerseInRange(
  chapterNum: number,
  verseNum: number,
  startChapter: number,
  startVerse: number,
  endChapter: number,
  endVerse: number
): boolean {
  // If it's a single chapter range
  if (startChapter === endChapter) {
    return chapterNum === startChapter && verseNum >= startVerse && verseNum <= endVerse;
  }

  // Multi-chapter range
  if (chapterNum === startChapter) {
    // First chapter: from startVerse to end of chapter
    return verseNum >= startVerse;
  } else if (chapterNum === endChapter) {
    // Last chapter: from beginning to endVerse
    return verseNum <= endVerse;
  } else if (chapterNum > startChapter && chapterNum < endChapter) {
    // Middle chapters: all verses
    return true;
  }

  return false;
}

/**
 * Get a summary of tokens for debugging/logging
 */
export function getTokenSummary(tokens: OptimizedToken[]): {
  totalTokens: number;
  uniqueTokens: number;
  sampleTokens: string[];
} {
  const uniqueTexts = new Set(tokens.map(t => t.text));
  const sampleTokens = Array.from(uniqueTexts).slice(0, 10); // First 10 unique tokens

  return {
    totalTokens: tokens.length,
    uniqueTokens: uniqueTexts.size,
    sampleTokens
  };
}
