/**
 * @deprecated Prefer viewModelToOptimizedChapters from @bt-synergy/scripture-loader.
 *
 * Convert transitional ProcessedScripture projection to OptimizedChapter[] for
 * QuoteMatcher. Kept for rollback / non-Helps callers only.
 */

import type { OptimizedChapter, OptimizedToken, OptimizedVerse } from '@bt-synergy/resource-parsers'
import type {
  ProcessedChapter,
  ProcessedScripture,
  ProcessedVerse,
  WordToken,
} from '@bt-synergy/scripture-loader'

/**
 * Convert WordToken to OptimizedToken.
 * Preserves processor-assigned occurrence so QuoteMatcher / semantic IDs stay in lockstep with USJ.
 */
function convertWordTokenToOptimizedToken(wordToken: WordToken, index: number): OptimizedToken {
  const content = wordToken.content || ''
  const trimmedContent = content.trim()

  let tokenType: OptimizedToken['type'] = 'word'
  if (content.length > 0 && trimmedContent.length === 0) {
    tokenType = 'whitespace'
  } else if (trimmedContent.length > 0 && /^[^\p{L}\p{N}]+$/u.test(trimmedContent)) {
    tokenType = 'punctuation'
  } else if (wordToken.type === 'punctuation') {
    tokenType = 'punctuation'
  } else if (wordToken.type === 'word' || wordToken.type === 'text') {
    tokenType = 'word'
  }

  // Sequential numeric id is only for OptimizedToken shape — highlight match key is
  // verseRef:content:occurrence (built later by generateSemanticIdsForQuoteTokens).
  const optimizedToken: OptimizedToken = {
    id: index + 1,
    text: content,
    type: tokenType,
    strong: wordToken.alignment?.strong,
    lemma: wordToken.alignment?.lemma,
    morph: wordToken.alignment?.morph,
    occurrence: wordToken.occurrence,
  }

  return optimizedToken
}

function convertProcessedVerseToOptimizedVerse(processedVerse: ProcessedVerse): OptimizedVerse {
  const optimizedTokens: OptimizedToken[] = []

  if (processedVerse.wordTokens && processedVerse.wordTokens.length > 0) {
    processedVerse.wordTokens.forEach((wordToken, index) => {
      optimizedTokens.push(convertWordTokenToOptimizedToken(wordToken, index))
    })
  }

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

function convertProcessedChapterToOptimizedChapter(processedChapter: ProcessedChapter): OptimizedChapter {
  return {
    number: processedChapter.number,
    verseCount: processedChapter.verseCount,
    paragraphCount: processedChapter.paragraphCount,
    verses: processedChapter.verses.map(convertProcessedVerseToOptimizedVerse),
  }
}

/**
 * Convert ProcessedScripture to OptimizedChapter[]
 * @deprecated Prefer viewModelToOptimizedChapters(viewModel)
 */
export function convertProcessedScriptureToOptimizedChapters(
  processedScripture: ProcessedScripture
): OptimizedChapter[] {
  if (!processedScripture || !processedScripture.chapters) {
    console.warn('[convertProcessedScriptureToOptimizedChapters] No chapters found in ProcessedScripture')
    return []
  }

  return processedScripture.chapters.map(convertProcessedChapterToOptimizedChapter)
}
