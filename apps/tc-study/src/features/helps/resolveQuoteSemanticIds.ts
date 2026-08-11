/**
 * Shared quote → semantic-id resolution for TN / TWL / CombinedHelps.
 * Prefer typed `semanticIds` on the item over regenerating from quoteTokens.
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { generateSemanticIdsForQuoteTokens } from './quoteTokens'

export interface QuoteSemanticSource {
  semanticIds?: string[]
  quoteTokens?: OptimizedToken[] | null
  occurrence?: string | number | null
}

export function resolveQuoteSemanticIds(
  item: QuoteSemanticSource,
  bookCode: string,
  chapter: number,
  verse: number
): string[] {
  if (item.semanticIds?.length) return item.semanticIds
  if (!item.quoteTokens?.length) return []
  const occurrence =
    typeof item.occurrence === 'number'
      ? item.occurrence
      : parseInt(String(item.occurrence || '1'), 10) || 1
  return generateSemanticIdsForQuoteTokens(
    item.quoteTokens,
    bookCode,
    chapter,
    verse,
    occurrence
  )
}
