/**
 * USJ → Helps projection helpers (QuoteMatcher chapters + SCRIPTURE_TOKENS).
 *
 * Prefer these over ProcessedScripture / projectToProcessedScripture.
 */

import type { OptimizedChapter, OptimizedToken } from '@bt-synergy/resource-parsers'
import type { UsjScriptureViewModel, UsjWordToken } from '@bt-synergy/usj-processor'

export type BroadcastScriptureToken = OptimizedToken & {
  verseRef: string
  occurrence: number
  semanticId: string
  alignedOriginalWordIds: string[]
}

function usjWordToOptimizedToken(token: UsjWordToken, index: number): OptimizedToken {
  return {
    id: index + 1,
    text: token.content,
    type: 'word',
    occurrence: token.occurrence,
  }
}

/**
 * Project UsjScriptureViewModel chapters into OptimizedChapter[] for QuoteMatcher.
 */
export function viewModelToOptimizedChapters(
  viewModel: UsjScriptureViewModel
): OptimizedChapter[] {
  return viewModel.chapters.map((chapter) => ({
    number: chapter.number,
    verseCount: chapter.verses.length,
    paragraphCount: 0,
    verses: chapter.verses.map((verse) => ({
      number: verse.number,
      text: verse.text || '',
      tokens: verse.tokens.map((token, index) => usjWordToOptimizedToken(token, index)),
    })),
  }))
}

/**
 * SCRIPTURE_TOKENS payload from UsjScriptureViewModel (owner scripture → CombinedHelps).
 */
export function extractUsjBroadcastTokens(
  viewModel: UsjScriptureViewModel,
  startChapter: number,
  startVerse: number,
  endChapter?: number,
  endVerse?: number
): BroadcastScriptureToken[] {
  const tokens: BroadcastScriptureToken[] = []
  const actualEndChapter = endChapter || startChapter
  const actualEndVerse = endVerse || startVerse

  for (let chapterNum = startChapter; chapterNum <= actualEndChapter; chapterNum++) {
    const chapter = viewModel.chapters.find((ch) => ch.number === chapterNum)
    if (!chapter) continue

    const verseStart = chapterNum === startChapter ? startVerse : 1
    const lastVerse =
      chapter.verses.length > 0
        ? chapter.verses[chapter.verses.length - 1]!.number
        : verseStart
    const verseEnd = chapterNum === actualEndChapter ? actualEndVerse : lastVerse

    for (const verse of chapter.verses) {
      if (verse.number < verseStart || verse.number > verseEnd) continue
      for (const token of verse.tokens) {
        tokens.push({
          id: tokens.length,
          text: token.content,
          type: 'word',
          verseRef: token.verseRef,
          occurrence: token.occurrence,
          semanticId: token.semanticId,
          alignedOriginalWordIds: token.alignedOriginalWordIds || [],
        })
      }
    }
  }

  return tokens
}
