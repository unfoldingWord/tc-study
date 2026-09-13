/**
 * Shared TN / TWL / CombinedHelps filter scope chrome (token, verse, OBS quote, TA support-ref).
 * Renders TokenFilterBanner whenever a filter is active (including 0 matches).
 * Inline chip for compact CombinedHelps chrome / other viewer header actions.
 */

import type {
  ObsQuoteFilter,
  SupportRefFilter,
  VerseFilterState,
} from '../../../features/helps/helpsDisplayFilters'
import { TokenFilterBanner } from '../WordsLinksViewer/components/TokenFilterBanner'
import type { TokenFilter } from '../WordsLinksViewer/types'

export interface HelpsFilterBannersProps {
  obsQuoteFilter: ObsQuoteFilter | null
  tokenFilter: TokenFilter | null
  verseFilter: VerseFilterState | null
  supportRefFilter?: SupportRefFilter | null
  displayCount: number
  hasMatches: boolean
  onClearObsQuoteFilter: () => void
  onClearTokenFilter: () => void
  onClearVerseFilter: () => void
  onClearSupportRefFilter?: () => void
  /** CombinedHelps compact chrome: chip only, no match count. */
  hideCount?: boolean
}

export function HelpsFilterBanners({
  obsQuoteFilter,
  tokenFilter,
  verseFilter,
  supportRefFilter = null,
  displayCount,
  hasMatches,
  onClearObsQuoteFilter,
  onClearTokenFilter,
  onClearVerseFilter,
  onClearSupportRefFilter,
  hideCount = false,
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
        hideCount={hideCount}
        onClearFilter={onClearObsQuoteFilter}
      />
    )
  }

  if (supportRefFilter) {
    return (
      <TokenFilterBanner
        tokenFilter={{
          semanticId: '',
          content: supportRefFilter.title || supportRefFilter.supportReference,
          alignedSemanticIds: [],
          timestamp: supportRefFilter.timestamp,
        }}
        displayLinksCount={displayCount}
        hasMatches={hasMatches}
        hideCount={hideCount}
        onClearFilter={onClearSupportRefFilter ?? (() => undefined)}
      />
    )
  }

  if (tokenFilter) {
    return (
      <TokenFilterBanner
        tokenFilter={tokenFilter}
        displayLinksCount={displayCount}
        hasMatches={hasMatches}
        hideCount={hideCount}
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
        hideCount={hideCount}
        onClearFilter={onClearVerseFilter}
      />
    )
  }

  return null
}
