/**
 * Pure helpers for SCRIPTURE_TOKENS STATE shape (owner scripture → CombinedHelps).
 * Kept free of React so USJ soak / underline tests can exercise the same path.
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { semanticIdFor } from '@bt-synergy/scripture-loader'
import type { ProcessedScripture, WordToken } from '@bt-synergy/usfm-processor'

export type BroadcastScriptureToken = OptimizedToken & {
  verseRef: string
  occurrence: number
  semanticId: string
  alignedOriginalWordIds: string[]
}

/**
 * Convert ProcessedScripture tokens to OptimizedToken format for broadcasting.
 * Supports both single verse and verse ranges.
 */
export function extractOptimizedTokens(
  loadedContent: ProcessedScripture,
  startChapter: number,
  startVerse: number,
  endChapter?: number,
  endVerse?: number
): BroadcastScriptureToken[] {
  const tokens: BroadcastScriptureToken[] = []
  const bookCode = loadedContent.metadata?.bookCode || ''

  const actualEndChapter = endChapter || startChapter
  const actualEndVerse = endVerse || startVerse

  for (let chapterNum = startChapter; chapterNum <= actualEndChapter; chapterNum++) {
    const chapterData = loadedContent.chapters.find((ch) => ch.number === chapterNum)
    if (!chapterData) continue

    const verseStart = chapterNum === startChapter ? startVerse : 1
    const lastVerseInChapter =
      chapterData.verses.length > 0
        ? chapterData.verses[chapterData.verses.length - 1].number
        : verseStart
    const verseEnd = chapterNum === actualEndChapter ? actualEndVerse : lastVerseInChapter

    for (const verseData of chapterData.verses) {
      const verseNum = verseData.number
      if (verseNum < verseStart || verseNum > verseEnd) continue
      if (!verseData.wordTokens) continue

      verseData.wordTokens.forEach((token: WordToken) => {
        const verseRef = token.verseRef || `${bookCode} ${chapterNum}:${verseNum}`
        const occurrence = token.occurrence || 1
        const tokenType: BroadcastScriptureToken['type'] =
          token.type === 'text' ? 'whitespace' : token.type

        tokens.push({
          id: tokens.length,
          text: token.content,
          type: tokenType,
          verseRef,
          occurrence,
          semanticId:
            token.type === 'word'
              ? semanticIdFor(verseRef, token.content, occurrence)
              : `${verseRef}:${token.type}:${tokens.length}`,
          alignedOriginalWordIds: token.alignedOriginalWordIds || [],
        })
      })
    }
  }

  return tokens
}
