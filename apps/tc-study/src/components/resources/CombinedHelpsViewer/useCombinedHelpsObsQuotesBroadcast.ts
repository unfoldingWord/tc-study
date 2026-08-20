/**
 * OBS frame-quotes STATE broadcast + inbound obs-frame-highlight filter for CombinedHelps.
 */

import {
  RESOURCE_STATE_KEYS,
  useResourceStateSender,
  useSignalHandler,
} from '@bt-synergy/resource-panels'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  buildObsFrameQuotes,
  obsQuotesOfKind,
} from '../../../lib/obs/buildObsFrameQuotes'
import { publishObsFrameQuotes } from '../../../lib/obs/obsFrameQuotesStore'
import type { ObsFrameHighlightSignal, ObsFrameQuotesSignal } from '../../../signals/studioSignals'
import { focusFirstOverlappingHelpsCard, type HelpsCardSelection } from './helpsCardSelection'
import type { HelpsKindFilter, ObsQuoteFilter } from './types'
import type { NoteWithAlignments, LinkWithAlignments } from './useCombinedHelpsMerge'

export interface UseCombinedHelpsObsQuotesBroadcastParams {
  resourceId: string
  helpsScope: 'scripture' | 'obs'
  kindFilter: HelpsKindFilter
  currentRef: { book?: string; chapter: number; verse: number }
  navigationMode: string
  notesWithAlignedTokens: NoteWithAlignments[]
  filteredByReference: LinkWithAlignments[]
  resourceMetadata: Record<string, unknown>
  setObsQuoteFilter: Dispatch<SetStateAction<ObsQuoteFilter | null>>
  setSelectedHelpsCard: Dispatch<SetStateAction<HelpsCardSelection>>
}

export function useCombinedHelpsObsQuotesBroadcast({
  resourceId,
  helpsScope,
  kindFilter,
  currentRef,
  navigationMode,
  notesWithAlignedTokens,
  filteredByReference,
  resourceMetadata,
  setObsQuoteFilter,
  setSelectedHelpsCard,
}: UseCombinedHelpsObsQuotesBroadcastParams) {
  // Per-publisher keys (same pattern as NOTES_TOKEN_GROUPS_TN/TWL) — ObsViewer merges.
  const { sendState: sendObsFrameQuotesTn } = useResourceStateSender<ObsFrameQuotesSignal>(
    'obs-frame-quotes',
    resourceId,
    RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TN,
    'combined-helps'
  )
  const { sendState: sendObsFrameQuotesTwl } = useResourceStateSender<ObsFrameQuotesSignal>(
    'obs-frame-quotes',
    resourceId,
    RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TWL,
    'combined-helps'
  )
  const lastObsQuotesKeyRef = useRef<string | null>(null)

  const splitObsQuotes = useMemo(() => {
    const rows = [
      ...notesWithAlignedTokens.map((note) => ({
        id: note.id,
        reference: note.reference,
        quote: note.quote,
        occurrence: note.occurrence,
        kind: 'tn' as const,
      })),
      ...filteredByReference.map((link) => ({
        id: link.id,
        reference: link.reference,
        quote: link.origWords,
        occurrence: link.occurrence,
        kind: 'twl' as const,
      })),
    ]
    const built = buildObsFrameQuotes({
      book: helpsScope === 'obs' ? currentRef.book : undefined,
      storyNumber: currentRef.chapter,
      frameNumber: currentRef.verse,
      rows,
    })
    const tn = obsQuotesOfKind(built, 'tn')
    const twl = obsQuotesOfKind(built, 'twl')
    return {
      built,
      tnQuotes: tn.quotes,
      twlQuotes: twl.quotes,
      tnMap: tn.frameQuoteMap,
      twlMap: twl.frameQuoteMap,
    }
  }, [helpsScope, currentRef.book, currentRef.chapter, currentRef.verse, notesWithAlignedTokens, filteredByReference])

  useEffect(() => {
    lastObsQuotesKeyRef.current = null
  }, [currentRef.book, currentRef.chapter, currentRef.verse, helpsScope])

  useLayoutEffect(() => {
    if (helpsScope !== 'obs') return
    publishObsFrameQuotes(splitObsQuotes.built)
  }, [helpsScope, splitObsQuotes.built])

  useLayoutEffect(() => {
    if (helpsScope !== 'obs') return
    return () => {
      publishObsFrameQuotes(null)
    }
  }, [helpsScope])

  useEffect(() => {
    if (helpsScope !== 'obs') return
    const { tnQuotes, twlQuotes, tnMap, twlMap, built } = splitObsQuotes
    const key = `${currentRef.book}:${currentRef.chapter}:${currentRef.verse}:${kindFilter}:${[
      ...tnQuotes,
      ...twlQuotes,
    ]
      .map((q) => `${q.sourceId}:${q.quote}:${q.occurrence}`)
      .join('|')}`
    if (key === lastObsQuotesKeyRef.current) return
    lastObsQuotesKeyRef.current = key
    const onObs = currentRef.book === 'obs'
    sendObsFrameQuotesTn({
      storyNumber: built.storyNumber,
      frameNumber: built.frameNumber,
      quotes: onObs ? tnQuotes : [],
      frameQuoteMap: onObs ? tnMap : undefined,
    })
    sendObsFrameQuotesTwl({
      storyNumber: built.storyNumber,
      frameNumber: built.frameNumber,
      quotes: onObs ? twlQuotes : [],
      frameQuoteMap: onObs ? twlMap : undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    helpsScope,
    resourceId,
    currentRef.book,
    currentRef.chapter,
    currentRef.verse,
    kindFilter,
    splitObsQuotes,
  ])

  useSignalHandler<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (helpsScope !== 'obs') return
        if (signal.highlight === null) {
          setObsQuoteFilter(null)
          setSelectedHelpsCard(null)
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
            kind: h.kind,
          })
          setSelectedHelpsCard(
            focusFirstOverlappingHelpsCard(
              h.overlappingSourceIds,
              notesWithAlignedTokens,
              filteredByReference,
              kindFilter
            )
          )
          return
        }
        if (h.quote === undefined || h.occurrence === undefined) return
        setObsQuoteFilter({ quote: h.quote, occurrence: h.occurrence, rowId: h.rowId, kind: h.kind })
        if (h.rowId) {
          if (notesWithAlignedTokens.some((n) => n.id === h.rowId)) {
            setSelectedHelpsCard({ kind: 'tn', id: h.rowId })
            return
          }
          if (filteredByReference.some((l) => l.id === h.rowId)) {
            setSelectedHelpsCard({ kind: 'twl', id: h.rowId })
            return
          }
        }
        const nq = h.quote.trim().toLowerCase()
        for (const note of notesWithAlignedTokens) {
          if ((note.quote || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(note.occurrence ?? '1'), 10)
          if (occ === h.occurrence) {
            setSelectedHelpsCard({ kind: 'tn', id: note.id })
            return
          }
        }
        for (const link of filteredByReference) {
          if ((link.origWords || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(link.occurrence ?? '1'), 10)
          if (occ === h.occurrence) {
            setSelectedHelpsCard({ kind: 'twl', id: link.id })
            return
          }
        }
      },
      [
        resourceId,
        helpsScope,
        kindFilter,
        currentRef.book,
        currentRef.chapter,
        currentRef.verse,
        navigationMode,
        notesWithAlignedTokens,
        filteredByReference,
        setObsQuoteFilter,
        setSelectedHelpsCard,
      ]
    ),
    { debug: false, resourceMetadata }
  )
}
