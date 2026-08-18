/**
 * STEP 3 of TSV alignment: map OL semantic IDs → target scripture tokens
 * via alignedOriginalWordIds (USJ / legacy projection) or the token's own
 * semanticId (UGNT/UHB in the text pane).
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { semanticIdFor } from '@bt-synergy/scripture-loader'
import { semanticIdMatchKey } from './semanticIdMatchKey'

export interface AlignedToken {
  content: string
  semanticId: string
  verseRef: string
  position: number
  type?: 'word' | 'punctuation' | 'whitespace' | 'text' | 'gap'
}

type BroadcastishToken = OptimizedToken & {
  alignedOriginalWordIds?: unknown[]
  semanticId?: string
}

function tokenMatchIds(token: OptimizedToken): string[] {
  const tk = token as BroadcastishToken
  const ids: string[] = []
  if (tk.semanticId) ids.push(String(tk.semanticId))
  if (Array.isArray(tk.alignedOriginalWordIds)) {
    for (const id of tk.alignedOriginalWordIds) ids.push(String(id))
  }
  return ids
}

/** Build chip/underline tokens from matched word positions, filling punctuation gaps. */
export function alignedTokensFromPositions(
  targetTokens: OptimizedToken[],
  matchedPositions: number[],
  bookCode: string,
  chapter: number,
  verse: number
): AlignedToken[] {
  if (matchedPositions.length === 0) return []
  const verseRef = `${bookCode.toLowerCase()} ${chapter}:${verse}`
  const result: AlignedToken[] = []

  matchedPositions.forEach((position, matchIndex) => {
    const token = targetTokens[position]
    if (!token) return
    const tokenOccurrence = token.occurrence || 1
    const semanticId = semanticIdFor(verseRef, token.text, tokenOccurrence)

    result.push({
      content: token.text,
      semanticId,
      verseRef,
      position,
      type: 'word',
    })

    if (matchIndex >= matchedPositions.length - 1) return
    const nextPosition = matchedPositions[matchIndex + 1]!
    const gap = nextPosition - position
    if (gap <= 1) return

    const betweenTokens: AlignedToken[] = []
    let hasWordsBetween = false

    for (let i = position + 1; i < nextPosition; i++) {
      const between = targetTokens[i]
      if (!between) continue
      if (between.type === 'word') {
        hasWordsBetween = true
      } else if (
        between.type === 'punctuation' ||
        between.type === 'whitespace' ||
        between.type === 'number' ||
        between.type === 'paragraph-marker' ||
        (between as { type?: string }).type === 'text'
      ) {
        betweenTokens.push({
          content: between.text,
          semanticId: `${verseRef}:${between.type}:${i}`,
          verseRef,
          position: i,
          type: between.type === 'whitespace' ? 'whitespace' : 'punctuation',
        })
      }
    }

    if (hasWordsBetween) {
      result.push({
        content: '…',
        semanticId: `${verseRef}:gap:${position + 1}`,
        verseRef,
        position: position + 1,
        type: 'gap',
      })
    } else {
      result.push(...betweenTokens)
    }
  })

  return result
}

/**
 * Find aligned tokens in target language tokens from SCRIPTURE_TOKENS broadcast.
 * Matches `\zaln` / alignedOriginalWordIds, or the token's own semanticId when
 * the text pane is original language (UGNT/UHB).
 */
export function findAlignedTokens(
  targetTokens: OptimizedToken[],
  originalSemanticIds: string[],
  bookCode: string,
  chapter: number,
  verse: number
): AlignedToken[] {
  if (!originalSemanticIds.length) return []
  const wanted = originalSemanticIds.map((id) => semanticIdMatchKey(id))
  const matchedPositions: number[] = []

  targetTokens.forEach((token, index) => {
    if (token.type !== 'word') return
    const hasMatch = tokenMatchIds(token).some((id) => wanted.includes(semanticIdMatchKey(id)))
    if (hasMatch) matchedPositions.push(index)
  })

  return alignedTokensFromPositions(targetTokens, matchedPositions, bookCode, chapter, verse)
}
