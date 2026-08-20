/**
 * OBS frame highlight policy: word-token matches only.
 * Unmatched quotes (e.g. English tN vs minority OBS) stay unhighlighted —
 * substring fallback produces false positives across languages.
 */

import type { ObsFrameQuoteEntry } from '../../signals/studioSignals'
import { enrichObsFrameQuoteEntries } from './enrichObsFrameQuotes'
import type { FrameSpan } from './highlightFrameText'
import { computeFrameWordSpans } from './highlightFrameWords'

export function entryHasWordRanges(entry: ObsFrameQuoteEntry): boolean {
  return (
    (entry.wordRanges != null && entry.wordRanges.length > 0) ||
    (entry.startWord != null && entry.endWord != null)
  )
}

export function resolveObsHighlightSpans(
  text: string,
  entries: ObsFrameQuoteEntry[]
): { spans: FrameSpan[]; enriched: ObsFrameQuoteEntry[]; useWordMode: boolean } {
  if (!text) return { spans: [], enriched: entries, useWordMode: false }
  if (!entries.length) {
    return { spans: [{ text }], enriched: entries, useWordMode: false }
  }

  const enriched = enrichObsFrameQuoteEntries(text, entries)
  const useWordMode = enriched.some(entryHasWordRanges)
  if (useWordMode) {
    return { spans: computeFrameWordSpans(text, enriched), enriched, useWordMode: true }
  }
  return { spans: [{ text }], enriched, useWordMode: false }
}
