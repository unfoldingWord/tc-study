/**
 * Materialize SCRIPTURE_TOKENS broadcast payload from a full prepared chapter.
 */

import type { BroadcastScriptureToken } from '@bt-synergy/scripture-loader'
import {
  rawSemanticIdForToken,
  type ScriptureFullChapter,
} from './scripturePreparer'

export function extractPreparedBroadcastTokens(
  bookCode: string,
  chapter: number,
  full: ScriptureFullChapter,
  startVerse: number,
  endVerse: number
): BroadcastScriptureToken[] {
  const tokens: BroadcastScriptureToken[] = []
  let verse = 0
  const verseRefPrefix = `${bookCode.toLowerCase()} ${chapter}:`

  for (const block of full.blocks) {
    for (const item of block.inline) {
      if (item.kind === 'verse') {
        verse = item.verseNumber
        continue
      }
      if (item.kind !== 'token') continue
      if (verse < startVerse || verse > endVerse) continue
      const verseRef = `${verseRefPrefix}${verse}`
      const token = item.token
      tokens.push({
        id: tokens.length,
        text: token.c,
        type: 'word',
        verseRef,
        occurrence: token.o,
        semanticId: rawSemanticIdForToken(verseRef, token),
        alignedOriginalWordIds: (token.a ?? [])
          .map((idx) => full.matchKeys[idx])
          .filter((id): id is string => typeof id === 'string'),
      })
    }
  }

  return tokens
}
