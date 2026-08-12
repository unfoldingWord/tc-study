import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'

export type BroadcastScriptureToken = OptimizedToken & {
  verseRef: string
  occurrence: number
  semanticId: string
  alignedOriginalWordIds: string[]
}

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
