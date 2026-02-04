/**
 * Generate semantic IDs for original language tokens
 * 
 * Semantic ID format: verseRef:content:occurrence
 * This matches the format used in ScriptureViewer for cross-panel matching.
 * 
 * These semantic IDs are used to:
 * 1. Match original language tokens to target language tokens via alignments
 * 2. Send token-click signals to highlight aligned tokens in target language panels
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'

interface GenerateSemanticIdOptions {
  token: OptimizedToken
  verseRef: string // Format: "BOOK CHAPTER:VERSE" (e.g., "JHN 3:16")
  occurrence: number // Occurrence of this token in the verse
}

/**
 * Generate a semantic ID for an original language token
 * Format: verseRef:content:occurrence
 * 
 * CRITICAL: Uses the actual text (inflected form) NOT the lemma!
 * TWL origWords contains inflected forms (e.g., "Θεοῦ" genitive)
 * Target tokens align using zaln.content (the inflected form), not zaln.lemma
 */
export function generateSemanticId({ token, verseRef, occurrence }: GenerateSemanticIdOptions): string {
  // Use actual text (inflected form) as it appears in scripture
  return `${verseRef}:${token.text}:${occurrence}`
}

/**
 * Generate semantic IDs for an array of quote tokens
 * 
 * @param tokens - Array of OptimizedToken from original language
 * @param bookCode - Book code (e.g., "JHN")
 * @param chapter - Chapter number
 * @param verse - Verse number
 * @param baseOccurrence - CRITICAL: The occurrence number from the TWL link (for single-token quotes)
 * @returns Array of semantic IDs
 */
export function generateSemanticIdsForQuoteTokens(
  tokens: OptimizedToken[],
  bookCode: string,
  chapter: number,
  verse: number,
  baseOccurrence?: number
): string[] {
  // CRITICAL: Use lowercase to match scripture viewer's semantic ID format!
  // Scripture tokens have IDs like "tit 1:1:word:1" (lowercase book code)
  const verseRef = `${bookCode.toLowerCase()} ${chapter}:${verse}`
  
  // For single-token quotes, use the TWL occurrence directly
  // This ensures "Θεοῦ" occurrence 2 gets semantic ID "tit 1:1:Θεοῦ:2"
  if (tokens.length === 1 && baseOccurrence !== undefined) {
    return [generateSemanticId({
      token: tokens[0],
      verseRef,
      occurrence: baseOccurrence,
    })]
  }
  
  // For multi-token quotes, use the occurrence from the token itself (set by QuoteMatcher)
  // CRITICAL: Use actual text, not lemma!
  // TWL origWords = inflected forms, zaln.content = inflected forms
  // CRITICAL: QuoteMatcher now sets the verse-wide occurrence on each token
  const semanticIds = tokens.map(token => {
    // Use the occurrence from the token (calculated by QuoteMatcher)
    // This is the verse-wide occurrence, not the quote-wide occurrence
    const occurrence = token.occurrence || 1
    
    const semanticId = generateSemanticId({
      token,
      verseRef,
      occurrence,
    })
    
    return semanticId
  })
  
  return semanticIds
}
