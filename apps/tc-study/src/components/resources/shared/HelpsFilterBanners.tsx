/**
 * Shared TN / TWL / CombinedHelps filter scope chrome (token, verse, OBS quote).
 * Renders TokenFilterBanner whenever a filter is active (including 0 matches).
 * Intended to replace ResourceViewerHeader in-place — not a stacked extra row.
 */

import type { ObsQuoteFilter, VerseFilterState } from '../../../features/helps/helpsDisplayFilters'
import { TokenFilterBanner } from '../WordsLinksViewer/components/TokenFilterBanner'
import type { TokenFilter } from '../WordsLinksViewer/types'

export interface HelpsFilterBannersProps {
  obsQuoteFilter: ObsQuoteFilter | null
  tokenFilter: TokenFilter | null
  verseFilter: VerseFilterState | null
  displayCount: number
  hasMatches: boolean
  onClearObsQuoteFilter: () => void
  onClearTokenFilter: () => void
  onClearVerseFilter: () => void
}

export function HelpsFilterBanners({
  obsQuoteFilter,
  tokenFilter,
  verseFilter,
  displayCount,
  hasMatches,
  onClearObsQuoteFilter,
  onClearTokenFilter,
  onClearVerseFilter,
}: HelpsFilterBannersProps) {
  if (obsQuoteFilter) {
    return (
      <TokenFilterBanner
        tokenFilter={{
          semanticId: '',
          content:
            obsQuoteFilter.quote?.trim() ||
            (obsQuoteFilter.wordIndex != null ? `Word ${obsQuoteFilter.wordIndex + 1}` : 'Frame selection'),
          alignedSemanticIds: [],
          timestamp: 0,
        }}
        displayLinksCount={displayCount}
        hasMatches={hasMatches}
        onClearFilter={onClearObsQuoteFilter}
      />
    )
  }

  if (tokenFilter) {
    return (
      <TokenFilterBanner
        tokenFilter={tokenFilter}
        displayLinksCount={displayCount}
        hasMatches={hasMatches}
        onClearFilter={onClearTokenFilter}
      />
    )
  }

  if (verseFilter) {
    return (
      <TokenFilterBanner
        tokenFilter={{
          semanticId: '',
          content:
            verseFilter.verse !== undefined
              ? `${verseFilter.chapter}:${verseFilter.verse}`
              : `Ch ${verseFilter.chapter}`,
          alignedSemanticIds: [],
          timestamp: verseFilter.timestamp,
        }}
        displayLinksCount={displayCount}
        hasMatches={hasMatches}
        onClearFilter={onClearVerseFilter}
      />
    )
  }

  return null
}
