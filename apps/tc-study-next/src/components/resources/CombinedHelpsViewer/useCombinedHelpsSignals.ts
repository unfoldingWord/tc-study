/**
 * CombinedHelps inbound filters + outbound click senders.
 * Token-groups / OBS quotes STATE live in sibling broadcast hooks.
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type {
  EntryLinkClickSignal,
  ObsFrameHighlightSignal,
  TokenClickSignal,
  VerseFilterSignal,
} from '../../../signals/studioSignals'
import type { TokenFilter } from '../WordsLinksViewer/types'
import type { HelpsKindFilter, ObsQuoteFilter, VerseFilterState } from './types'
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
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setSelectedLinkId: Dispatch<SetStateAction<string | null>>
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
  setSelectedNoteId,
  setSelectedLinkId,
}: UseCombinedHelpsSignalsParams) {
  const resourceMetadata = useMemo(
    () => {
      const parts = resourceKey.split('/')
      const owner = parts[0] || ''
      const language = parts[1]?.split('_')[0] || wantLang || ''
      return {
        type: 'combined-helps' as const,
        language,
        owner,
        tags: ['combined-helps', 'tn', 'twl'],
      }
    },
    [resourceKey, wantLang]
  )

  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>('token-click', resourceId, resourceMetadata)
  const { sendToAll: sendEntryLinkClick } = useSignal<EntryLinkClickSignal>(
    'entry-link-click',
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
        if (signal.token === null) {
          setTokenFilter(null)
          setSelectedNoteId(null)
          setSelectedLinkId(null)
          return
        }
        // Uncovered scripture clicks broadcast token-click for scripture highlighting
        // but also send verse-filter for helps — ignore the token filter here.
        if (signal.token.hasHelpsCoverage === false) return
        setTokenFilter({
          semanticId: signal.token.semanticId,
          content: signal.token.content,
          alignedSemanticIds: signal.token.alignedSemanticIds || [],
          timestamp: signal.timestamp,
        })
        setVerseFilter(null)
        setSelectedNoteId(null)
        setSelectedLinkId(null)
      },
      [resourceId, setTokenFilter, setVerseFilter, setSelectedNoteId, setSelectedLinkId]
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
          setSelectedNoteId(null)
          setSelectedLinkId(null)
          return
        }
        setVerseFilter({
          chapter: signal.filter.chapter,
          verse: signal.filter.verse,
          timestamp: signal.timestamp,
        })
        setTokenFilter(null)
        setSelectedNoteId(null)
        setSelectedLinkId(null)
      },
      [resourceId, setVerseFilter, setTokenFilter, setSelectedNoteId, setSelectedLinkId]
    ),
    { debug: false, resourceMetadata }
  )

  useSignalHandler<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    (signal: EntryLinkClickSignal) => {
      if (tnKey && signal.resourceKey === tnKey && signal.entryId) {
        setSelectedNoteId(signal.entryId)
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
    setObsQuoteFilter,
    setSelectedNoteId,
    setSelectedLinkId,
  })

  return {
    resourceMetadata,
    sendTokenClick,
    sendEntryLinkClick,
    broadcastObsHighlight,
  }
}
