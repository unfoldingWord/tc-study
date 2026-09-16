/**
 * CombinedHelps display-filter state + book-wide kind restore.
 * Passage-scoped reset (token/verse/OBS) stays in the viewer shell.
 */

import { useCallback, useEffect, useState } from 'react'
import type { TokenFilter } from '../WordsLinksViewer/types'
import type { HelpsCardSelection } from './helpsCardSelection'
import { useHelpsKindFilterRestore } from './kindFilterRestore'
import type { HelpsKindFilter, ObsQuoteFilter, SupportRefFilter, TwlArticleFilter, VerseFilterState } from './types'

export function useCombinedHelpsFilterState(book: string | undefined) {
  const [kindFilter, setKindFilter] = useState<HelpsKindFilter>('all')
  const { enterBookKind, restoreBookKind } = useHelpsKindFilterRestore(kindFilter, setKindFilter)
  const [selectedHelpsCard, setSelectedHelpsCard] = useState<HelpsCardSelection>(null)
  const [tokenFilter, setTokenFilter] = useState<TokenFilter | null>(null)
  const [verseFilter, setVerseFilter] = useState<VerseFilterState | null>(null)
  const [obsQuoteFilter, setObsQuoteFilter] = useState<ObsQuoteFilter | null>(null)
  const [supportRefFilter, setSupportRefFilter] = useState<SupportRefFilter | null>(null)
  const [twlArticleFilter, setTwlArticleFilter] = useState<TwlArticleFilter | null>(null)

  useEffect(() => {
    setSupportRefFilter(null)
    setTwlArticleFilter(null)
    restoreBookKind()
  }, [book, restoreBookKind])

  const clearCompetingFilters = useCallback(() => {
    setTokenFilter(null)
    setVerseFilter(null)
    setObsQuoteFilter(null)
  }, [])

  return {
    kindFilter,
    setKindFilter,
    enterBookKind,
    restoreBookKind,
    selectedHelpsCard,
    setSelectedHelpsCard,
    tokenFilter,
    setTokenFilter,
    verseFilter,
    setVerseFilter,
    obsQuoteFilter,
    setObsQuoteFilter,
    supportRefFilter,
    setSupportRefFilter,
    twlArticleFilter,
    setTwlArticleFilter,
    clearCompetingFilters,
  }
}
