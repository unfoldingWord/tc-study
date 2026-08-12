/**
 * STEP 3 of TSV alignment: map OL semantic IDs → target scripture tokens
 * via alignedOriginalWordIds (USJ / legacy projection).
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { semanticIdFor } from '@bt-synergy/scripture-loader'

export interface AlignedToken {
  content: string
  semanticId: string
  verseRef: string
  position: number
  type?: 'word' | 'punctuation' | 'whitespace' | 'text' | 'gap'
}

/**
 * Find aligned tokens in target language tokens from SCRIPTURE_TOKENS broadcast.
 * Includes punctuation between contiguous matches and ellipsis for gaps.
 */
export function findAlignedTokens(
  targetTokens: OptimizedToken[],
  originalSemanticIds: string[],
  bookCode: string,
  chapter: number,
  verse: number
): AlignedToken[] {
  const verseRef = `${bookCode.toLowerCase()} ${chapter}:${verse}`

  const matchedPositions: number[] = []
  targetTokens.forEach((token, index) => {
    const tk = token as OptimizedToken & { alignedOriginalWordIds?: unknown[] }
    const alignedIds: unknown[] = Array.isArray(tk.alignedOriginalWordIds)
      ? tk.alignedOriginalWordIds
      : []

    const hasMatch = originalSemanticIds.some((originalId) =>
      alignedIds.some((alignedId) => String(alignedId).toLowerCase() === originalId.toLowerCase())
    )

    if (hasMatch && token.type === 'word') {
      matchedPositions.push(index)
    }
  })

  if (matchedPositions.length === 0) return []

  const result: AlignedToken[] = []

  matchedPositions.forEach((position, matchIndex) => {
    const token = targetTokens[position]
    const tokenOccurrence = token.occurrence || 1
    const semanticId = semanticIdFor(verseRef, token.text, tokenOccurrence)

    result.push({
      content: token.text,
      semanticId,
      verseRef,
      position,
      type: 'word',
    })

    if (matchIndex < matchedPositions.length - 1) {
      const nextPosition = matchedPositions[matchIndex + 1]
      const gap = nextPosition - position

      if (gap > 1) {
        const betweenTokens: AlignedToken[] = []
        let hasWordsBetween = false

        for (let i = position + 1; i < nextPosition; i++) {
          const between = targetTokens[i]
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
      }
    }
  })

  return result
}
