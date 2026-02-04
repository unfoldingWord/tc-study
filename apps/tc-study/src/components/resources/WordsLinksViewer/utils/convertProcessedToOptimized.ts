/**
 * Convert ProcessedScripture (from @bt-synergy/usfm-processor) to OptimizedChapter[]
 * (from @bt-synergy/resource-parsers) for use with quote building utilities.
 */

import type { OptimizedChapter, OptimizedToken, OptimizedVerse } from '@bt-synergy/resource-parsers'
import type { ProcessedChapter, ProcessedScripture, ProcessedVerse, WordToken } from '@bt-synergy/usfm-processor'

/**
 * Convert WordToken to OptimizedToken
 */
function convertWordTokenToOptimizedToken(wordToken: WordToken, index: number): OptimizedToken {
  // Extract semantic ID from uniqueId if available
  // Format: "verseRef:content:occurrence" -> extract numeric ID
  let semanticId = index + 1 // Default to sequential ID
  
  // Try to extract semantic ID from uniqueId
  if (wordToken.uniqueId) {
    // If uniqueId contains a numeric ID, use it
    const idMatch = wordToken.uniqueId.match(/:(\d+)$/)
    if (idMatch) {
      semanticId = parseInt(idMatch[1], 10)
    } else {
      // Generate a hash-based ID from the uniqueId
      let hash = 0
      for (let i = 0; i < wordToken.uniqueId.length; i++) {
        const char = wordToken.uniqueId.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32-bit integer
      }
      semanticId = Math.abs(hash) || (index + 1)
    }
  }

  // Map WordToken.type to OptimizedToken.type
  // WordToken: 'word' | 'text' | 'punctuation'
  // OptimizedToken: 'word' | 'punctuation' | 'number' | 'whitespace' | 'paragraph-marker'
  let tokenType: OptimizedToken['type'] = 'word'
  
  // Check content to properly categorize the token
  const content = wordToken.content || ''
  const trimmedContent = content.trim()
  
  // If content is only whitespace, mark as whitespace
  if (content.length > 0 && trimmedContent.length === 0) {
    tokenType = 'whitespace'
  }
  // If content is only punctuation (non-word characters), mark as punctuation
  else if (trimmedContent.length > 0 && /^[^\p{L}\p{N}]+$/u.test(trimmedContent)) {
    tokenType = 'punctuation'
  }
  // If type is explicitly marked as punctuation
  else if (wordToken.type === 'punctuation') {
    tokenType = 'punctuation'
  }
  // Otherwise it's a word
  else if (wordToken.type === 'word' || wordToken.type === 'text') {
    tokenType = 'word'
  }

  // CRITICAL: Extract lemma and strong data for original language tokens
  // These come from USFM \zaln markers in original language texts
  // For original language (UGNT/UHB): alignment data IS the token's own lemma/strong
  const lemma = wordToken.alignment?.lemma || (wordToken as any).lemma
  const strong = wordToken.alignment?.strong || (wordToken as any).strong  
  const morph = wordToken.alignment?.morph || (wordToken as any).morph

  const optimizedToken: OptimizedToken = {
    id: semanticId,
    text: wordToken.content || '',
    type: tokenType,
    strong,
    lemma,
    morph,
  }

  return optimizedToken
}

/**
 * Convert ProcessedVerse to OptimizedVerse
 */
function convertProcessedVerseToOptimizedVerse(processedVerse: ProcessedVerse): OptimizedVerse {
  const optimizedTokens: OptimizedToken[] = []
  
  if (processedVerse.wordTokens && processedVerse.wordTokens.length > 0) {
    processedVerse.wordTokens.forEach((wordToken, index) => {
      // Only convert word tokens (skip punctuation-only tokens if needed, but include them for now)
      const optimizedToken = convertWordTokenToOptimizedToken(wordToken, index)
      optimizedTokens.push(optimizedToken)
    })
  }

  // Convert paragraphId from string to number if needed
  let paragraphIdNum: number | undefined = undefined
  if (processedVerse.paragraphId !== undefined) {
    if (typeof processedVerse.paragraphId === 'number') {
      paragraphIdNum = processedVerse.paragraphId
    } else if (typeof processedVerse.paragraphId === 'string') {
      const parsed = parseInt(processedVerse.paragraphId, 10)
      paragraphIdNum = isNaN(parsed) ? undefined : parsed
    }
  }

  return {
    number: processedVerse.number,
    text: processedVerse.text || '',
    paragraphId: paragraphIdNum,
    tokens: optimizedTokens,
    isSpan: processedVerse.isSpan,
    spanStart: processedVerse.spanStart,
    spanEnd: processedVerse.spanEnd,
    originalVerseString: processedVerse.originalVerseString,
  }
}

/**
 * Convert ProcessedChapter to OptimizedChapter
 */
function convertProcessedChapterToOptimizedChapter(processedChapter: ProcessedChapter): OptimizedChapter {
  const optimizedVerses: OptimizedVerse[] = processedChapter.verses.map(convertProcessedVerseToOptimizedVerse)

  return {
    number: processedChapter.number,
    verseCount: processedChapter.verseCount,
    paragraphCount: processedChapter.paragraphCount,
    verses: optimizedVerses,
  }
}

/**
 * Convert ProcessedScripture to OptimizedChapter[]
 */
export function convertProcessedScriptureToOptimizedChapters(
  processedScripture: ProcessedScripture
): OptimizedChapter[] {
  if (!processedScripture || !processedScripture.chapters) {
    console.warn('[convertProcessedScriptureToOptimizedChapters] No chapters found in ProcessedScripture')
    return []
  }

  const optimizedChapters: OptimizedChapter[] = processedScripture.chapters.map(
    convertProcessedChapterToOptimizedChapter
  )

  return optimizedChapters
}
