/**
 * Materialize SCRIPTURE_TOKENS broadcast payload from a full prepared chapter.
 */

import type { BroadcastScriptureToken } from '@bt-synergy/scripture-loader'
import {
  rawSemanticIdForToken,
  type ScriptureFullChapter,
} from './scripturePreparer'

function assignedVerseForPreparedToken(
  verseFromMarker: number,
  blockVerse: number
): number {
  if (verseFromMarker > 0) return verseFromMarker
  if (blockVerse > 0) return blockVerse
  return 1
}

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
    const blockVerse = block.verseNumbers?.[0] ?? 0
    for (const item of block.inline) {
      if (item.kind === 'verse') {
        verse = item.verseNumber
        continue
      }
      if (item.kind !== 'token') continue
      // Pre-verse `\d` tokens sit before `\v 1` but belong to verse 1
      // (same convention as zaln harvest / TWL `5:front`).
      const assignedVerse = assignedVerseForPreparedToken(verse, blockVerse)
      if (assignedVerse < startVerse || assignedVerse > endVerse) continue
      const verseRef = `${verseRefPrefix}${assignedVerse}`
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
