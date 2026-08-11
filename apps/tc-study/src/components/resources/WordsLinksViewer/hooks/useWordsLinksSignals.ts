/**
 * TWL messaging: token/verse/OBS filters in, token-groups + OBS quotes out.
 */

import { RESOURCE_STATE_KEYS, useResourceStateSender, useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import type {
  EntryLinkClickSignal,
  NotesTokenGroupsSignal,
  ObsFrameHighlightSignal,
  ObsFrameQuoteEntry,
  ObsFrameQuotesSignal,
  TokenClickSignal,
  VerseFilterSignal,
} from '../../../../signals/studioSignals'
import type { ObsQuoteFilter, VerseFilterState } from '../../../../features/helps/helpsDisplayFilters'
import type { TokenFilter } from '../types'
import type { LinkWithAlignments } from './useWordsLinksPipeline'

export interface UseWordsLinksSignalsParams {
  resourceId: string
  resourceKey: string
  loaderTypeId: string
  isObs: boolean
  currentRef: { book?: string; chapter: number; verse: number }
  navigationMode: string
  filteredByReference: LinkWithAlignments[]
  underlineTokenGroups: { sourceId: string; semanticIds: string[] }[]
  setTokenFilter: Dispatch<SetStateAction<TokenFilter | null>>
  setVerseFilter: Dispatch<SetStateAction<VerseFilterState | null>>
  setObsQuoteFilter: Dispatch<SetStateAction<ObsQuoteFilter | null>>
  setSelectedLink: Dispatch<SetStateAction<string | null>>
}

export function useWordsLinksSignals({
  resourceId,
  resourceKey,
  loaderTypeId,
  isObs,
  currentRef,
  navigationMode,
  filteredByReference,
  underlineTokenGroups,
  setTokenFilter,
  setVerseFilter,
  setObsQuoteFilter,
  setSelectedLink,
}: UseWordsLinksSignalsParams) {
  const resourceMetadata = useMemo(() => {
    const parts = resourceKey.split('/')
    const owner = parts[0] || ''
    const language = parts[1]?.split('_')[0] || ''
    return {
      type: loaderTypeId as 'words-links' | 'obs-words-links',
      language,
      owner,
      tags: [loaderTypeId],
    }
  }, [resourceKey, loaderTypeId])

  const { sendToAll: sendEntryLinkClick } = useSignal<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    resourceMetadata
  )

  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>(
    'token-click',
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
        if (signal.token.hasHelpsCoverage === false) return
        setTokenFilter({
          semanticId: signal.token.semanticId,
          content: signal.token.content,
          alignedSemanticIds: signal.token.alignedSemanticIds || [],
          timestamp: signal.timestamp,
        })
        setVerseFilter(null)
        setSelectedLink(null)
      },
      [resourceId, setTokenFilter, setVerseFilter, setSelectedLink]
    ),
    { debug: false, resourceMetadata }
  )

  useSignalHandler<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        setVerseFilter({
          chapter: signal.filter.chapter,
          verse: signal.filter.verse,
          timestamp: signal.timestamp,
        })
        setTokenFilter(null)
        setSelectedLink(null)
      },
      [resourceId, setVerseFilter, setTokenFilter, setSelectedLink]
    ),
    { debug: false, resourceMetadata }
  )

  // Leave/unmount: clearResourceState via useResourceStateSender clearOnUnmount (no empty sendToAll).
  const { sendState: sendTwlTokenGroups } = useResourceStateSender<NotesTokenGroupsSignal>(
    'notes-token-groups',
    resourceId,
    RESOURCE_STATE_KEYS.NOTES_TOKEN_GROUPS_TWL,
    'words-links'
  )

  const lastTwlBroadcastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const key = underlineTokenGroups.map((g) => `${g.sourceId}:${g.semanticIds.length}`).join('|')
    if (key === lastTwlBroadcastKeyRef.current) return
    lastTwlBroadcastKeyRef.current = key
    const parts = resourceKey.split('/')
    const language = parts[1]?.split('_')[0] || ''
    sendTwlTokenGroups({
      tokenGroups: underlineTokenGroups,
      resourceMetadata: { id: resourceKey, language, type: 'words-links' },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, resourceKey, underlineTokenGroups])

  useSignalHandler<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (!isObs) return
        if (signal.highlight === null) {
          setObsQuoteFilter(null)
          setSelectedLink(null)
          return
        }
        const h = signal.highlight
        if (currentRef.book !== 'obs' || h.storyNumber !== currentRef.chapter) return
        const isObsStoryMode = navigationMode === 'chapter'
        if (!isObsStoryMode && h.frameNumber !== currentRef.verse) return
        if (h.overlappingSourceIds?.length) {
          setObsQuoteFilter({
            sourceIds: h.overlappingSourceIds,
            wordIndex: h.wordIndex,
            quote: h.quote,
            occurrence: h.occurrence,
            rowId: h.rowId,
          })
          const first = filteredByReference.find((l) => h.overlappingSourceIds!.includes(l.id))
          setSelectedLink(first?.id ?? null)
          return
        }
        if (h.kind === 'tn') {
          setObsQuoteFilter(null)
          setSelectedLink(null)
          return
        }
        if (h.quote === undefined || h.occurrence === undefined) return
        setObsQuoteFilter({ quote: h.quote, occurrence: h.occurrence, rowId: h.rowId })
        if (h.rowId && filteredByReference.some((l) => l.id === h.rowId)) {
          setSelectedLink(h.rowId)
          return
        }
        const nq = h.quote.trim().toLowerCase()
        for (const link of filteredByReference) {
          if ((link.origWords || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(link.occurrence ?? '1'), 10)
          if (occ === h.occurrence) {
            setSelectedLink(link.id)
            return
          }
        }
      },
      [
        resourceId,
        isObs,
        currentRef.book,
        currentRef.chapter,
        currentRef.verse,
        navigationMode,
        filteredByReference,
        setObsQuoteFilter,
        setSelectedLink,
      ]
    ),
    { debug: false, resourceMetadata }
  )

  const { sendState: sendObsFrameQuotes } = useResourceStateSender<ObsFrameQuotesSignal>(
    'obs-frame-quotes',
    resourceId,
    RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TWL,
    'obs-words-links'
  )
  const lastObsQuotesKeyRef = useRef<string | null>(null)

  useEffect(() => {
    lastObsQuotesKeyRef.current = null
  }, [currentRef.book, currentRef.chapter, currentRef.verse])

  useEffect(() => {
    if (!isObs) return
    const storyNumber = currentRef.book === 'obs' ? currentRef.chapter : 0
    const frameNumber = currentRef.book === 'obs' ? currentRef.verse : 0
    const refStr = `${storyNumber}:${frameNumber}`

    const frameQuoteMap: Record<number, ObsFrameQuoteEntry[]> = {}
    const quotes: ObsFrameQuoteEntry[] = []
    if (currentRef.book === 'obs') {
      for (const l of filteredByReference) {
        if (!l.origWords?.trim()) continue
        const [chStr, frStr] = l.reference.split(':')
        if (parseInt(chStr) !== storyNumber) continue
        const fr = parseInt(frStr)
        const entry: ObsFrameQuoteEntry = {
          sourceId: l.id,
          kind: 'twl',
          quote: l.origWords!.trim(),
          occurrence: Number.isFinite(Number.parseInt(String(l.occurrence ?? '1'), 10))
            ? Number.parseInt(String(l.occurrence ?? '1'), 10)
            : 1,
        }
        if (!frameQuoteMap[fr]) frameQuoteMap[fr] = []
        frameQuoteMap[fr].push(entry)
        if (fr === frameNumber) quotes.push(entry)
      }
    }

    const key = `${refStr}:${quotes.map((q) => `${q.sourceId}:${q.quote}:${q.occurrence}`).join('|')}`
    if (key === lastObsQuotesKeyRef.current) return
    lastObsQuotesKeyRef.current = key
    sendObsFrameQuotes({
      storyNumber,
      frameNumber,
      quotes,
      frameQuoteMap,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isObs, resourceId, currentRef.book, currentRef.chapter, currentRef.verse, filteredByReference])

  return { sendEntryLinkClick, sendTokenClick, broadcastObsHighlight, resourceMetadata }
}
