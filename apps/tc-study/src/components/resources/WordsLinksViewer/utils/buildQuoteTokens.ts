/**
 * buildQuoteTokens Utility - Core Quote Matching Logic
 * 
 * Matches origWords/quote from TSV resources to original language tokens.
 * Uses QuoteMatcher which implements the complete algorithm from bt-studio.
 * 
 * See packages/resource-parsers/src/utils/quote-matcher.ts for implementation.
 * See apps/tc-study/TWL_ALIGNMENT_SYSTEM.md for documentation.
 * 
 * What QuoteMatcher handles:
 * - Text normalization (Hebrew vowel points, Greek diacritics)
 * - Multi-part quotes with & separator
 * - Occurrence-based matching (distinguishing multiple instances)
 * - Flexible Hebrew matching (words in different order)
 * 
 * Example:
 *   Input: { origWords: "Παῦλος", occurrence: "1" }
 *   Output: [{ text: "Παῦλος", id: "TIT 1:1:Παῦλος:1", ... }]
 */

import type { OptimizedChapter, OptimizedToken } from '@bt-synergy/resource-parsers'
import { QuoteMatcher } from '@bt-synergy/resource-parsers'
import type { TranslationWordsLink } from '../types'

interface BuildQuoteTokensOptions {
  link: TranslationWordsLink
  originalChapters: OptimizedChapter[]
  bookCode: string
}

// Create a single QuoteMatcher instance for reuse
const quoteMatcher = new QuoteMatcher()

/**
 * Build quoteTokens for a TWL link by matching origWords to original language tokens
 */
export function buildQuoteTokens({
  link,
  originalChapters,
  bookCode,
}: BuildQuoteTokensOptions): OptimizedToken[] {
  try {
    // Parse reference (e.g., "1:1" -> chapter: 1, verse: 1)
    const refParts = link.reference.split(':')
    const chapterNum = parseInt(refParts[0] || '1', 10)
    const verseNum = parseInt(refParts[1] || '1', 10)
    const occurrence = parseInt(link.occurrence || '1', 10)
    
    if (originalChapters.length === 0) {
      return []
    }
    
    // Use QuoteMatcher to find matching tokens
    const matchResult = quoteMatcher.findOriginalTokens(
      originalChapters,
      link.origWords,
      occurrence,
      {
        book: bookCode,
        startChapter: chapterNum,
        startVerse: verseNum,
        endChapter: chapterNum,
        endVerse: verseNum,
      }
    )
    
    if (matchResult.success && matchResult.totalTokens.length > 0) {
      return matchResult.totalTokens
    } else {
      return []
    }
  } catch (error) {
    console.error(`❌ [buildQuoteTokens] Error building quote tokens:`, error)
    return []
  }
}
