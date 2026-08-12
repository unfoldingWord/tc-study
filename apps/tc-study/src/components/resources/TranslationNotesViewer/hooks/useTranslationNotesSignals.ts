/**
 * TN messaging: token/verse/OBS filters in, token-groups + OBS quotes out.
 * Keeps useResourceState / useSignal / useSignalHandler (no linked-panels STATE).
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
import type { TokenFilter } from '../../WordsLinksViewer/types'
import type { NoteWithTokens } from '../components/TranslationNoteCard'

export interface UseTranslationNotesSignalsParams {
  resourceId: string
  resourceKey: string
  isObs: boolean
  currentRef: { book?: string; chapter: number; verse: number }
  navigationMode: string
  notesWithAlignedTokens: NoteWithTokens[]
  underlineTokenGroups: { sourceId: string; semanticIds: string[] }[]
  setTokenFilter: Dispatch<SetStateAction<TokenFilter | null>>
  setVerseFilter: Dispatch<SetStateAction<VerseFilterState | null>>
  setObsQuoteFilter: Dispatch<SetStateAction<ObsQuoteFilter | null>>
  setSelectedNoteId: Dispatch<SetStateAction<string | null>>
}

export function useTranslationNotesSignals({
  resourceId,
  resourceKey,
  isObs,
  currentRef,
  navigationMode,
  notesWithAlignedTokens,
  underlineTokenGroups,
  setTokenFilter,
  setVerseFilter,
  setObsQuoteFilter,
  setSelectedNoteId,
}: UseTranslationNotesSignalsParams) {
  const resourceMetadata = useMemo(() => {
    const parts = resourceKey.split('/')
    const owner = parts[0] || ''
    const language = parts[1]?.split('_')[0] || ''
    return {
      type: 'tn' as const,
      language,
      owner,
      tags: ['tn', 'notes'],
    }
  }, [resourceKey])

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
        if (signal.token === null) {
          setTokenFilter(null)
          setSelectedNoteId(null)
          return
        }
        if (signal.token.hasHelpsCoverage === false) return
        setTokenFilter({
          semanticId: signal.token.semanticId,
          content: signal.token.content,
          alignedSemanticIds: signal.token.alignedSemanticIds || [],
          timestamp: signal.timestamp,
        })
        setVerseFilter(null)
        setSelectedNoteId(null)
      },
      [resourceId, setTokenFilter, setVerseFilter, setSelectedNoteId]
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
          return
        }
        setVerseFilter({
          chapter: signal.filter.chapter,
          verse: signal.filter.verse,
          timestamp: signal.timestamp,
        })
        setTokenFilter(null)
        setSelectedNoteId(null)
      },
      [resourceId, setVerseFilter, setTokenFilter, setSelectedNoteId]
    ),
    { debug: false, resourceMetadata }
  )

  // Leave/unmount: clearResourceState via useResourceStateSender clearOnUnmount (no empty sendToAll).
  const { sendState: sendNotesTokenGroups } = useResourceStateSender<NotesTokenGroupsSignal>(
    'notes-token-groups',
    resourceId,
    RESOURCE_STATE_KEYS.NOTES_TOKEN_GROUPS_TN,
    'notes'
  )

  const lastBroadcastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const key = underlineTokenGroups.map((g) => `${g.sourceId}:${g.semanticIds.length}`).join('|')
    if (key === lastBroadcastKeyRef.current) return
    lastBroadcastKeyRef.current = key
    const parts = resourceKey.split('/')
    const language = parts[1]?.split('_')[0] || ''
    sendNotesTokenGroups({
      tokenGroups: underlineTokenGroups,
      resourceMetadata: { id: resourceKey, language, type: 'tn' },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sendState ref is stable; key guards content changes
  }, [resourceId, resourceKey, underlineTokenGroups])

  useSignalHandler<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    (signal: EntryLinkClickSignal) => {
      if (signal.resourceKey === resourceKey && signal.entryId) {
        setSelectedNoteId(signal.entryId)
      }
    }
  )

  useSignalHandler<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (!isObs) return
        if (signal.highlight === null) {
          setObsQuoteFilter(null)
          setSelectedNoteId(null)
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
          const first = notesWithAlignedTokens.find((n) => h.overlappingSourceIds!.includes(n.id))
          setSelectedNoteId(first?.id ?? null)
          return
        }
        if (h.kind === 'twl') {
          setObsQuoteFilter(null)
          setSelectedNoteId(null)
          return
        }
        if (h.quote === undefined || h.occurrence === undefined) return
        setObsQuoteFilter({ quote: h.quote, occurrence: h.occurrence, rowId: h.rowId })
        if (h.rowId && notesWithAlignedTokens.some((n) => n.id === h.rowId)) {
          setSelectedNoteId(h.rowId)
          return
        }
        const nq = h.quote.trim().toLowerCase()
        for (const note of notesWithAlignedTokens) {
          if ((note.quote || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(note.occurrence ?? '1'), 10)
          if (occ === h.occurrence) {
            setSelectedNoteId(note.id)
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
        notesWithAlignedTokens,
        setObsQuoteFilter,
        setSelectedNoteId,
      ]
    ),
    { debug: false, resourceMetadata }
  )

  const { sendState: sendObsFrameQuotes } = useResourceStateSender<ObsFrameQuotesSignal>(
    'obs-frame-quotes',
    resourceId,
    RESOURCE_STATE_KEYS.OBS_FRAME_QUOTES_TN,
    'obs-notes'
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
      for (const n of notesWithAlignedTokens) {
        if (!n.quote?.trim()) continue
        const [chStr, frStr] = n.reference.split(':')
        if (parseInt(chStr) !== storyNumber) continue
        const fr = parseInt(frStr)
        const entry: ObsFrameQuoteEntry = {
          sourceId: n.id,
          kind: 'tn',
          quote: n.quote!.trim(),
          occurrence: Number.isFinite(Number.parseInt(String(n.occurrence ?? '1'), 10))
            ? Number.parseInt(String(n.occurrence ?? '1'), 10)
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
  }, [isObs, resourceId, currentRef.book, currentRef.chapter, currentRef.verse, notesWithAlignedTokens])

  return { sendTokenClick, broadcastObsHighlight, resourceMetadata }
}
