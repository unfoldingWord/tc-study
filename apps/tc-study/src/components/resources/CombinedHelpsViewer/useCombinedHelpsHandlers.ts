/**
 * CombinedHelps click handlers (note/link quote, TA support, TW title).
 */

import type { TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useCallback } from 'react'
import type { ObsFrameHighlightSignal, TokenClickSignal } from '../../../signals/studioSignals'
import { generateSemanticIdsForQuoteTokens, parseTWLink } from '../../../features/helps/quoteTokens'
import { buildQuoteClickPayload } from '../../../features/helps/buildQuoteClickPayload'
import type { NoteWithTokens } from '../TranslationNotesViewer/components/TranslationNoteCard'

type SendTokenClick = (data: {
  lifecycle: 'event'
  token: TokenClickSignal['token']
}) => void

type SendEntryLinkClick = (data: {
  lifecycle: 'event'
  link: { resourceType: string; resourceId: string; entryId: string; text: string }
}) => void

type BroadcastObsHighlight = (data: {
  lifecycle: 'event'
  highlight: ObsFrameHighlightSignal['highlight']
}) => void

export interface UseCombinedHelpsHandlersParams {
  helpsScope: 'scripture' | 'obs'
  bookCode?: string
  tnKey: string
  twlKey: string
  resourceKey: string
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
  sendTokenClick: SendTokenClick
  sendEntryLinkClick: SendEntryLinkClick
  broadcastObsHighlight: BroadcastObsHighlight
  setSelectedNoteId: (id: string | null) => void
  setSelectedLinkId: (id: string | null) => void
}

export function useCombinedHelpsHandlers({
  helpsScope,
  bookCode,
  tnKey,
  twlKey,
  resourceKey,
  onEntryLinkClick,
  sendTokenClick,
  sendEntryLinkClick,
  broadcastObsHighlight,
  setSelectedNoteId,
  setSelectedLinkId,
}: UseCombinedHelpsHandlersParams) {
  const handleNoteSelect = useCallback(
    (note: { id: string }) => {
      setSelectedNoteId(note.id)
    },
    [setSelectedNoteId]
  )

  const handleNoteQuoteClick = useCallback(
    (note: NoteWithTokens) => {
      if (helpsScope === 'obs') {
        const quote = note.quote?.trim()
        if (!quote) return
        const refParts = note.reference.split(':')
        const chapter = parseInt(refParts[0] || '1', 10)
        const verse = parseInt(refParts[1] || '1', 10)
        const occRaw = Number.parseInt(String(note.occurrence ?? '1'), 10)
        const occurrence = Number.isFinite(occRaw) ? occRaw : 1
        setSelectedNoteId(note.id)
        broadcastObsHighlight({
          lifecycle: 'event',
          highlight: {
            storyNumber: chapter,
            frameNumber: verse,
            quote,
            occurrence,
            rowId: note.id,
            kind: 'tn',
          },
        })
        return
      }
      if (note.quoteTokens?.length) {
        const refParts = note.reference.split(':')
        const chapter = parseInt(refParts[0] || '1', 10)
        const verse = parseInt(refParts[1] || '1', 10)
        const book = bookCode?.toLowerCase() || ''
        const baseOccurrence = parseInt(note.occurrence || '1', 10)
        const semanticIds = generateSemanticIdsForQuoteTokens(
          note.quoteTokens,
          book,
          chapter,
          verse,
          baseOccurrence
        )
        const firstToken = note.quoteTokens[0]
        if (!firstToken) return
        sendTokenClick({
          lifecycle: 'event',
          token: {
            id: String(firstToken.id),
            content: firstToken.text,
            semanticId: semanticIds[0],
            verseRef: `${book} ${chapter}:${verse}`,
            position: 0,
            strong: firstToken.strong,
            lemma: firstToken.lemma,
            morph: firstToken.morph,
            alignedSemanticIds: semanticIds,
          },
        })
        return
      }
      const refParts = note.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const payload = buildQuoteClickPayload(note, bookCode?.toLowerCase() || '', chapter, verse)
      if (!payload) return
      sendTokenClick({ lifecycle: 'event', token: payload })
    },
    [bookCode, helpsScope, broadcastObsHighlight, sendTokenClick, setSelectedNoteId]
  )

  const handleSupportReferenceClick = useCallback(
    (supportRef: string) => {
      const match = supportRef.match(/rc:\/\/\*\/ta\/man\/(.+)/)
      if (match && onEntryLinkClick) {
        const entryId = match[1]
        const parts = (tnKey || resourceKey).split('/')
        const language = parts.length >= 2 ? parts[1] : 'en'
        const owner = parts[0] || 'unfoldingWord'
        onEntryLinkClick(`${owner}/${language}/ta`, entryId)
      }
    },
    [tnKey, resourceKey, onEntryLinkClick]
  )

  const handleTitleClick = useCallback(
    (link: TranslationWordsLink) => {
      setSelectedLinkId(link.id)
      const twInfo = parseTWLink(link.twLink)
      const parts = (twlKey || resourceKey).split('/')
      if (parts.length < 2) return
      const [owner, langResource] = parts
      const language = langResource.split('_')[0]
      const twResourceKey = `${owner}/${language}/tw`
      const entryId = `bible/${twInfo.category}/${twInfo.term}`
      onEntryLinkClick?.(twResourceKey, entryId)
      sendEntryLinkClick({
        lifecycle: 'event',
        link: {
          resourceType: 'words',
          resourceId: twResourceKey,
          entryId,
          text: twInfo.term,
        },
      })
    },
    [twlKey, resourceKey, onEntryLinkClick, sendEntryLinkClick, setSelectedLinkId]
  )

  const handleLinkQuoteClick = useCallback(
    (link: TranslationWordsLink) => {
      setSelectedLinkId(link.id)
      if (helpsScope === 'obs') {
        const quote = link.origWords?.trim()
        if (!quote) return
        const refParts = link.reference.split(':')
        const chapter = parseInt(refParts[0] || '1', 10)
        const verse = parseInt(refParts[1] || '1', 10)
        const occRaw = Number.parseInt(String(link.occurrence ?? '1'), 10)
        const occurrence = Number.isFinite(occRaw) ? occRaw : 1
        broadcastObsHighlight({
          lifecycle: 'event',
          highlight: {
            storyNumber: chapter,
            frameNumber: verse,
            quote,
            occurrence,
            rowId: link.id,
            kind: 'twl',
          },
        })
        return
      }
      if (link.quoteTokens?.length) {
        const refParts = link.reference.split(':')
        const chapter = parseInt(refParts[0] || '1', 10)
        const verse = parseInt(refParts[1] || '1', 10)
        const book = bookCode?.toLowerCase() || ''
        const baseOccurrence = parseInt(link.occurrence || '1', 10)
        const semanticIds = generateSemanticIdsForQuoteTokens(
          link.quoteTokens,
          book,
          chapter,
          verse,
          baseOccurrence
        )
        link.quoteTokens.forEach((token, index) => {
          const semanticId = semanticIds[index]
          if (!semanticId) return
          sendTokenClick({
            lifecycle: 'event',
            token: {
              id: String(token.id),
              content: token.text,
              semanticId,
              verseRef: `${book} ${chapter}:${verse}`,
              position: index,
              strong: token.strong,
              lemma: token.lemma,
              morph: token.morph,
              alignedSemanticIds: [semanticId],
            },
          })
        })
        return
      }
      const refParts = link.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const payload = buildQuoteClickPayload(link, bookCode?.toLowerCase() || '', chapter, verse)
      if (!payload) return
      sendTokenClick({ lifecycle: 'event', token: payload })
    },
    [bookCode, helpsScope, broadcastObsHighlight, sendTokenClick, setSelectedLinkId]
  )

  return {
    handleNoteSelect,
    handleNoteQuoteClick,
    handleSupportReferenceClick,
    handleTitleClick,
    handleLinkQuoteClick,
  }
}
