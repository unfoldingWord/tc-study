/**
 * CombinedHelps compact filter chip + clear handlers (kind restore on book chips).
 */

import type { ReactNode } from 'react'
import type { TokenFilter } from '../WordsLinksViewer/types'
import { HelpsFilterBanners } from '../shared/HelpsFilterBanners'
import type { HelpsKindFilter, ObsQuoteFilter, SupportRefFilter, TwlArticleFilter, VerseFilterState } from './types'

export function combinedHelpsFilterHasMatches(args: {
  supportRefFilter: SupportRefFilter | null
  twlArticleFilter: TwlArticleFilter | null
  obsQuoteFilter: ObsQuoteFilter | null
  tokenFilter: TokenFilter | null
  verseFilter: VerseFilterState | null
  kindFilter: HelpsKindFilter
  hasNoteMatches: boolean
  hasLinkMatches: boolean
}): boolean {
  const { kindFilter, hasNoteMatches, hasLinkMatches } = args
  if (args.supportRefFilter) return hasNoteMatches
  if (args.twlArticleFilter) return hasLinkMatches
  if (args.obsQuoteFilter) return hasNoteMatches || hasLinkMatches
  if (args.tokenFilter || args.verseFilter) {
    if (kindFilter === 'notes') return hasNoteMatches
    if (kindFilter === 'twl') return hasLinkMatches
    return hasNoteMatches || hasLinkMatches
  }
  return true
}

export function combinedHelpsFilterDisplayCount(args: {
  kindFilter: HelpsKindFilter
  notesCount: number
  linksCount: number
}): number {
  if (args.kindFilter === 'all') return args.notesCount + args.linksCount
  if (args.kindFilter === 'notes') return args.notesCount
  return args.linksCount
}

export function buildHelpsFilterChrome(args: {
  obsQuoteFilter: ObsQuoteFilter | null
  tokenFilter: TokenFilter | null
  verseFilter: VerseFilterState | null
  supportRefFilter: SupportRefFilter | null
  twlArticleFilter: TwlArticleFilter | null
  displayCount: number
  hasMatches: boolean
  setObsQuoteFilter: (v: ObsQuoteFilter | null) => void
  setTokenFilter: (v: TokenFilter | null) => void
  setVerseFilter: (v: VerseFilterState | null) => void
  setSupportRefFilter: (v: SupportRefFilter | null) => void
  setTwlArticleFilter: (v: TwlArticleFilter | null) => void
  setSelectedHelpsCard: (v: null) => void
  restoreBookKind: () => void
  sendVerseFilter: (data: { lifecycle: 'event'; filter: null }) => void
}): { filterScopeBar: ReactNode; onClearActiveFilter: () => void } {
  const clearObs = () => {
    args.setObsQuoteFilter(null)
    args.setSelectedHelpsCard(null)
  }
  const clearSupportRef = () => {
    args.setSupportRefFilter(null)
    args.setSelectedHelpsCard(null)
    args.restoreBookKind()
  }
  const clearTwlArticle = () => {
    args.setTwlArticleFilter(null)
    args.setSelectedHelpsCard(null)
    args.restoreBookKind()
  }
  const clearToken = () => {
    args.setTokenFilter(null)
  }
  const clearVerse = () => {
    args.setVerseFilter(null)
    args.sendVerseFilter({ lifecycle: 'event', filter: null })
  }

  const filterScopeBar =
    args.obsQuoteFilter ||
    args.supportRefFilter ||
    args.twlArticleFilter ||
    args.tokenFilter ||
    args.verseFilter ? (
      <HelpsFilterBanners
        obsQuoteFilter={args.obsQuoteFilter}
        tokenFilter={args.tokenFilter}
        verseFilter={args.verseFilter}
        supportRefFilter={args.supportRefFilter}
        twlArticleFilter={args.twlArticleFilter}
        displayCount={args.displayCount}
        hasMatches={args.hasMatches}
        hideCount
        onClearObsQuoteFilter={clearObs}
        onClearTokenFilter={clearToken}
        onClearVerseFilter={clearVerse}
        onClearSupportRefFilter={clearSupportRef}
        onClearTwlArticleFilter={clearTwlArticle}
      />
    ) : null

  const onClearActiveFilter = () => {
    if (args.obsQuoteFilter) {
      clearObs()
      return
    }
    if (args.supportRefFilter) {
      clearSupportRef()
      return
    }
    if (args.twlArticleFilter) {
      clearTwlArticle()
      return
    }
    if (args.tokenFilter) {
      clearToken()
      return
    }
    if (args.verseFilter) clearVerse()
  }

  return { filterScopeBar, onClearActiveFilter }
}
