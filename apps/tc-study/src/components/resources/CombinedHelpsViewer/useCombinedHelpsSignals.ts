/**
 * CombinedHelps inbound filters + outbound click senders.
 * Token-groups / OBS quotes STATE live in sibling broadcast hooks.
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import { shouldClearHelpsHighlightOnTokenNull } from '../../../features/helps/helpsCardScriptureNav'
import { resolveHelpsTokenClickFilter } from '../../../features/helps/helpsDisplayFilters'
import type {
  EntryLinkClickSignal,
  ObsFrameHighlightSignal,
  TokenClickSignal,
  VerseFilterSignal,
  VerseNavigationSignal,
} from '../../../signals/studioSignals'
import type { TokenFilter } from '../WordsLinksViewer/types'
import { resourceKeyLangSegment } from './combinedHelpsUtils'
import { focusFirstMatchingHelpsCard, type HelpsCardSelection } from './helpsCardSelection'
import type { HelpsKindFilter, ObsQuoteFilter, SupportRefFilter, TwlArticleFilter, VerseFilterState } from './types'
import type { NoteWithAlignments, LinkWithAlignments } from './useCombinedHelpsMerge'
import { useCombinedHelpsObsQuotesBroadcast } from './useCombinedHelpsObsQuotesBroadcast'
import { useCombinedHelpsTokenGroupsBroadcast } from './useCombinedHelpsTokenGroupsBroadcast'

export type { ObsQuoteFilter, VerseFilterState } from './types'

export interface UseCombinedHelpsSignalsParams {
  resourceId: string
  resourceKey: string
  tnKey: string
  twlKey: string
  helpsScope: 'scripture' | 'obs'
  kindFilter: HelpsKindFilter
  wantLang: string
  currentRef: { book?: string; chapter: number; verse: number }
  navigationMode: string
  notesWithAlignedTokens: NoteWithAlignments[]
  filteredByReference: LinkWithAlignments[]
  underlineTnGroups: { sourceId: string; semanticIds: string[] }[]
  underlineTwlGroups: { sourceId: string; semanticIds: string[] }[]
  setTokenFilter: Dispatch<SetStateAction<TokenFilter | null>>
  setVerseFilter: Dispatch<SetStateAction<VerseFilterState | null>>
  setObsQuoteFilter: Dispatch<SetStateAction<ObsQuoteFilter | null>>
  setSupportRefFilter?: Dispatch<SetStateAction<SupportRefFilter | null>>
  setTwlArticleFilter?: Dispatch<SetStateAction<TwlArticleFilter | null>>
  setSelectedHelpsCard: Dispatch<SetStateAction<HelpsCardSelection>>
  /** Token/verse/OBS applying displace book chips — restore kind only if one was active. */
  restoreBookKind?: () => void
}

export function useCombinedHelpsSignals({
  resourceId,
  resourceKey,
  tnKey,
  twlKey,
  helpsScope,
  kindFilter,
  wantLang,
  currentRef,
  navigationMode,
  notesWithAlignedTokens,
  filteredByReference,
  underlineTnGroups,
  underlineTwlGroups,
  setTokenFilter,
  setVerseFilter,
  setObsQuoteFilter,
  setSupportRefFilter,
  setTwlArticleFilter,
  setSelectedHelpsCard,
  restoreBookKind,
}: UseCombinedHelpsSignalsParams) {
  const resourceMetadata = useMemo(
    () => ({
      type: 'combined-helps' as const,
      language: resourceKeyLangSegment(resourceKey) || wantLang || '',
      owner: resourceKey.split('/')[0] || '',
      tags: ['combined-helps', 'tn', 'twl'],
    }),
    [resourceKey, wantLang]
  )

  // Token/verse/OBS applying displaces book chips — restore kind only if one was active.
  const displaceBookFilters = useCallback(() => {
    setSupportRefFilter?.(null)
    setTwlArticleFilter?.(null)
    restoreBookKind?.()
  }, [setSupportRefFilter, setTwlArticleFilter, restoreBookKind])

  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>('token-click', resourceId, resourceMetadata)
  const { sendToAll: sendEntryLinkClick } = useSignal<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    resourceMetadata
  )
  const { sendToAll: sendVerseFilter } = useSignal<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    resourceMetadata
  )
  const { sendToAll: sendVerseNavigation } = useSignal<VerseNavigationSignal>(
    'verse-navigation',
    resourceId,
    resourceMetadata
  )
  const { sendToAll: broadcastObsHighlight } = useSignal<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    resourceMetadata
  )

  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        // Toggle-off: clear token filter owned by the scripture selection (keep OBS/underlines).
        // Persist still owning a click means remount/reload null — keep the card.
        const nextFilter = resolveHelpsTokenClickFilter(signal.token, signal.timestamp)
        if (nextFilter === undefined) return
        if (nextFilter === null) {
          setTokenFilter(null)
          if (shouldClearHelpsHighlightOnTokenNull()) setSelectedHelpsCard(null)
          return
        }
        setTokenFilter(nextFilter)
        setVerseFilter(null)
        displaceBookFilters()
        setSelectedHelpsCard(
          focusFirstMatchingHelpsCard({
            notes: notesWithAlignedTokens,
            links: filteredByReference,
            kindFilter,
            tokenFilter: nextFilter,
            helpsScope,
            bookCodeLower: currentRef.book?.toLowerCase() || '',
          })
        )
      },
      [
        resourceId,
        notesWithAlignedTokens,
        filteredByReference,
        kindFilter,
        helpsScope,
        currentRef.book,
        setTokenFilter,
        setVerseFilter,
        displaceBookFilters,
        setSelectedHelpsCard,
      ]
    ),
    { debug: false, resourceMetadata }
  )

  useSignalHandler<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (signal.filter === null) {
          setVerseFilter(null)
          setSelectedHelpsCard(null)
          return
        }
        setVerseFilter({
          chapter: signal.filter.chapter,
          verse: signal.filter.verse,
          timestamp: signal.timestamp,
        })
        setTokenFilter(null)
        displaceBookFilters()
        setSelectedHelpsCard(null)
      },
      [resourceId, setVerseFilter, setTokenFilter, displaceBookFilters, setSelectedHelpsCard]
    ),
    { debug: false, resourceMetadata }
  )

  useSignalHandler<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    (signal: EntryLinkClickSignal) => {
      if (tnKey && signal.resourceKey === tnKey && signal.entryId) {
        setSelectedHelpsCard({ kind: 'tn', id: signal.entryId })
      }
    }
  )

  useCombinedHelpsTokenGroupsBroadcast({
    resourceId,
    resourceKey,
    tnKey,
    twlKey,
    helpsScope,
    kindFilter,
    underlineTnGroups,
    underlineTwlGroups,
  })

  useCombinedHelpsObsQuotesBroadcast({
    resourceId,
    helpsScope,
    kindFilter,
    currentRef,
    navigationMode,
    notesWithAlignedTokens,
    filteredByReference,
    resourceMetadata,
    setObsQuoteFilter: ((action) => {
      if (typeof action !== 'function' && action) displaceBookFilters()
      setObsQuoteFilter(action)
    }) as Dispatch<SetStateAction<ObsQuoteFilter | null>>,
    setSelectedHelpsCard,
  })

  return {
    resourceMetadata,
    sendTokenClick,
    sendEntryLinkClick,
    sendVerseFilter,
    sendVerseNavigation,
    broadcastObsHighlight,
  }
}
