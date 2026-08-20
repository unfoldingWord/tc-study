/**
 * Token-click payload for quote chips when quoteTokens (OL) are missing
 * but alignedTokens / semanticIds exist (same-language text match or OL pane).
 */

import { resolveQuoteSemanticIds, type QuoteSemanticSource } from './resolveQuoteSemanticIds'

export function buildQuoteClickPayload(
  item: QuoteSemanticSource & {
    quote?: string
    origWords?: string
    quoteTokens?: Array<{
      text: string
      id?: string | number
      strong?: string
      lemma?: string
      morph?: string
    }> | null
  },
  bookCode: string,
  chapter: number,
  verse: number
): {
  id: string
  content: string
  semanticId: string
  verseRef: string
  position: number
  strong?: string
  lemma?: string
  morph?: string
  alignedSemanticIds: string[]
} | null {
  const semanticIds = resolveQuoteSemanticIds(item, bookCode, chapter, verse)
  if (!semanticIds.length) return null
  const firstQuote = item.quoteTokens?.[0]
  const firstAligned = item.alignedTokens?.find((t) => !t.type || t.type === 'word')
  const content = firstQuote?.text || firstAligned?.content || item.quote || item.origWords || ''
  if (!content || !semanticIds[0]) return null
  return {
    id: String(firstQuote?.id ?? firstAligned?.semanticId ?? '0'),
    content,
    semanticId: semanticIds[0],
    verseRef: `${bookCode} ${chapter}:${verse}`,
    position: 0,
    strong: firstQuote?.strong,
    lemma: firstQuote?.lemma,
    morph: firstQuote?.morph,
    alignedSemanticIds: semanticIds,
  }
}
