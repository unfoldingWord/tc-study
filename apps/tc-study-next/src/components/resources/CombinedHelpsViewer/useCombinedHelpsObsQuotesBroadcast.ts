/**
 * OBS frame-quotes STATE broadcast + inbound obs-frame-highlight filter for CombinedHelps.
 */

import {
  RESOURCE_STATE_KEYS,
  useResourceStateSender,
  useSignalHandler,
} from '@bt-synergy/resource-panels'
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react'
import type { ObsFrameHighlightSignal, ObsFrameQuoteEntry, ObsFrameQuotesSignal } from '../../../signals/studioSignals'
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
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
  setSelectedLinkId: Dispatch<SetStateAction<string | null>>
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
  setSelectedNoteId,
  setSelectedLinkId,
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
    if (helpsScope !== 'obs' || currentRef.book !== 'obs') {
      return {
        tnQuotes: [] as ObsFrameQuoteEntry[],
        twlQuotes: [] as ObsFrameQuoteEntry[],
        tnMap: {} as Record<number, ObsFrameQuoteEntry[]>,
        twlMap: {} as Record<number, ObsFrameQuoteEntry[]>,
      }
    }
    const story = currentRef.chapter
    const frame = currentRef.verse
    const refStr = `${story}:${frame}`
    const tnQuotes: ObsFrameQuoteEntry[] = []
    const twlQuotes: ObsFrameQuoteEntry[] = []
    const tnMap: Record<number, ObsFrameQuoteEntry[]> = {}
    const twlMap: Record<number, ObsFrameQuoteEntry[]> = {}

    for (const note of notesWithAlignedTokens) {
      const q = note.quote?.trim()
      if (!q) continue
      const occRaw = Number.parseInt(String(note.occurrence ?? '1'), 10)
      const entry: ObsFrameQuoteEntry = {
        sourceId: note.id,
        kind: 'tn',
        quote: q,
        occurrence: Number.isFinite(occRaw) ? occRaw : 1,
      }
      const [chStr, frStr] = note.reference.split(':')
      if (parseInt(chStr) !== story) continue
      const fr = parseInt(frStr)
      if (!tnMap[fr]) tnMap[fr] = []
      tnMap[fr].push(entry)
      if (note.reference === refStr) tnQuotes.push(entry)
    }
    for (const link of filteredByReference) {
      const q = link.origWords?.trim()
      if (!q) continue
      const occRaw = Number.parseInt(String(link.occurrence ?? '1'), 10)
      const entry: ObsFrameQuoteEntry = {
        sourceId: link.id,
        kind: 'twl',
        quote: q,
        occurrence: Number.isFinite(occRaw) ? occRaw : 1,
      }
      const [chStr, frStr] = link.reference.split(':')
      if (parseInt(chStr) !== story) continue
      const fr = parseInt(frStr)
      if (!twlMap[fr]) twlMap[fr] = []
      twlMap[fr].push(entry)
      if (link.reference === refStr) twlQuotes.push(entry)
    }
    return { tnQuotes, twlQuotes, tnMap, twlMap }
  }, [helpsScope, currentRef.book, currentRef.chapter, currentRef.verse, notesWithAlignedTokens, filteredByReference])

  useEffect(() => {
    lastObsQuotesKeyRef.current = null
  }, [currentRef.book, currentRef.chapter, currentRef.verse, helpsScope])

  useEffect(() => {
    if (helpsScope !== 'obs') return
    const { tnQuotes, twlQuotes, tnMap, twlMap } = splitObsQuotes
    const key = `${currentRef.book}:${currentRef.chapter}:${currentRef.verse}:${kindFilter}:${[
      ...tnQuotes,
      ...twlQuotes,
    ]
      .map((q) => `${q.sourceId}:${q.quote}:${q.occurrence}`)
      .join('|')}`
    if (key === lastObsQuotesKeyRef.current) return
    lastObsQuotesKeyRef.current = key
    const storyNumber = currentRef.book === 'obs' ? currentRef.chapter : 0
    const frameNumber = currentRef.book === 'obs' ? currentRef.verse : 0
    const onObs = currentRef.book === 'obs'
    sendObsFrameQuotesTn({
      storyNumber,
      frameNumber,
      quotes: onObs ? tnQuotes : [],
      frameQuoteMap: onObs ? tnMap : undefined,
    })
    sendObsFrameQuotesTwl({
      storyNumber,
      frameNumber,
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
          setSelectedNoteId(null)
          setSelectedLinkId(null)
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
          const firstTn = notesWithAlignedTokens.find((n) => h.overlappingSourceIds!.includes(n.id))
          const firstTwl = filteredByReference.find((l) => h.overlappingSourceIds!.includes(l.id))
          setSelectedNoteId(firstTn?.id ?? null)
          setSelectedLinkId(firstTwl?.id ?? null)
          return
        }
        if (h.quote === undefined || h.occurrence === undefined) return
        setObsQuoteFilter({ quote: h.quote, occurrence: h.occurrence, rowId: h.rowId, kind: h.kind })
        if (h.rowId) {
          if (notesWithAlignedTokens.some((n) => n.id === h.rowId)) {
            setSelectedNoteId(h.rowId)
            setSelectedLinkId(null)
            return
          }
          if (filteredByReference.some((l) => l.id === h.rowId)) {
            setSelectedLinkId(h.rowId)
            setSelectedNoteId(null)
            return
          }
        }
        const nq = h.quote.trim().toLowerCase()
        for (const note of notesWithAlignedTokens) {
          if ((note.quote || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(note.occurrence ?? '1'), 10)
          if (occ === h.occurrence) {
            setSelectedNoteId(note.id)
            setSelectedLinkId(null)
            return
          }
        }
        for (const link of filteredByReference) {
          if ((link.origWords || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(link.occurrence ?? '1'), 10)
          if (occ === h.occurrence) {
            setSelectedLinkId(link.id)
            setSelectedNoteId(null)
            return
          }
        }
      },
      [
        resourceId,
        helpsScope,
        currentRef.book,
        currentRef.chapter,
        currentRef.verse,
        navigationMode,
        notesWithAlignedTokens,
        filteredByReference,
        setObsQuoteFilter,
        setSelectedNoteId,
        setSelectedLinkId,
      ]
    ),
    { debug: false, resourceMetadata }
  )
}
