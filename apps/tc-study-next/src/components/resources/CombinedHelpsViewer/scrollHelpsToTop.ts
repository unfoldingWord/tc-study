/**
 * CombinedHelps list-panel scroll. Reset only when filter identity changes
 * (token / verse / OBS quote) — not on underline rebroadcast or catalog hydrate.
 */

import type {
  ObsQuoteFilter,
  TokenFilterLike,
  VerseFilterState,
} from '../../../features/helps/helpsDisplayFilters'

export interface HelpsFilterIdentityInput {
  tokenFilter: TokenFilterLike | null
  verseFilter: VerseFilterState | null
  obsQuoteFilter: ObsQuoteFilter | null
}

/** Stable key for the active filter scope. Omits timestamps. */
export function helpsFilterIdentity({
  tokenFilter,
  verseFilter,
  obsQuoteFilter,
}: HelpsFilterIdentityInput): string {
  return JSON.stringify({
    t: tokenFilter
      ? {
          id: tokenFilter.semanticId,
          c: tokenFilter.content,
          a: [...(tokenFilter.alignedSemanticIds ?? [])].sort(),
        }
      : null,
    v: verseFilter ? { c: verseFilter.chapter, v: verseFilter.verse ?? null } : null,
    o: obsQuoteFilter
      ? {
          q: obsQuoteFilter.quote ?? null,
          oc: obsQuoteFilter.occurrence ?? null,
          r: obsQuoteFilter.rowId ?? null,
          k: obsQuoteFilter.kind ?? null,
          s: [...(obsQuoteFilter.sourceIds ?? [])].sort(),
          w: obsQuoteFilter.wordIndex ?? null,
        }
      : null,
  })
}

export function scrollHelpsToTop(el: { scrollTop: number } | null | undefined): void {
  if (!el) return
  el.scrollTop = 0
}
