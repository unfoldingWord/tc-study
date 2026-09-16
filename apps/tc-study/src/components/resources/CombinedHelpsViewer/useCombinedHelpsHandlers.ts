/**
 * CombinedHelps click handlers (note/link quote, TA support, TW title).
 */

import type { TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useCallback } from 'react'
import { useNavigationStore } from '../../../contexts'
import type {
  ObsFrameHighlightSignal,
  TokenClickSignal,
  VerseFilterSignal,
  VerseNavigationSignal,
} from '../../../signals/studioSignals'
import type { SupportRefFilter, TwlArticleFilter } from '../../../features/helps/helpsDisplayFilters'
import { twlArticleChipTitle, twlArticleKey } from '../../../features/helps/helpsDisplayFilters'
import {
  persistHelpsHighlight,
  planHelpsCardScriptureAction,
  type HelpsQuoteClickItem,
} from '../../../features/helps/helpsCardScriptureNav'
import { markReadNavigationInternal } from '../../../features/read/replaceReadUrlFromUi'
import { parseTWLink } from '../../../features/helps/quoteTokens'
import type { NoteWithTokens } from '../TranslationNotesViewer/components/TranslationNoteCard'
import { helpsCardVerseFilter, obsFrameHighlightFromHelpsRow } from './combinedHelpsUtils'
import { helpsFilterAnchorFromRow } from './helpsFilterAnchorPin'
import type { HelpsCardSelection } from './helpsCardSelection'

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

type SendVerseFilter = (data: {
  lifecycle: 'event'
  filter: VerseFilterSignal['filter']
}) => void

type SendVerseNavigation = (data: {
  lifecycle: 'event'
  verse: VerseNavigationSignal['verse']
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
  sendVerseFilter: SendVerseFilter
  sendVerseNavigation: SendVerseNavigation
  broadcastObsHighlight: BroadcastObsHighlight
  setSelectedHelpsCard: (selection: HelpsCardSelection) => void
  setSupportRefFilter?: (filter: SupportRefFilter | null) => void
  setTwlArticleFilter?: (filter: TwlArticleFilter | null) => void
  clearCompetingFilters?: () => void
  /** Snapshot current kind, then force notes/twl for a book-wide chip. */
  enterBookKindFilter?: (kind: 'notes' | 'twl') => void
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
  sendVerseFilter,
  sendVerseNavigation,
  broadcastObsHighlight,
  setSelectedHelpsCard,
  setSupportRefFilter,
  setTwlArticleFilter,
  clearCompetingFilters,
  enterBookKindFilter,
}: UseCombinedHelpsHandlersParams) {
  const sendObsCardFrameFilter = useCallback(
    (reference: string) => {
      if (helpsScope !== 'obs') return
      sendVerseFilter({ lifecycle: 'event', filter: helpsCardVerseFilter(reference) })
    },
    [helpsScope, sendVerseFilter]
  )

  const navigateToHelpsRow = useCallback(
    (reference?: string) => {
      if (helpsScope !== 'scripture') return
      const live = useNavigationStore.getState().currentReference
      const { navigate } = planHelpsCardScriptureAction({
        bookCode: bookCode || live.book,
        reference,
        current: live,
      })
      if (!navigate) return
      // Store first — verse-navigation alone loses the jump to chapter-scroll settle.
      markReadNavigationInternal()
      useNavigationStore.getState().navigateToReference({
        book: navigate.book,
        chapter: navigate.chapter,
        verse: navigate.verse,
      })
      sendVerseNavigation({
        lifecycle: 'event',
        verse: { book: navigate.book, chapter: navigate.chapter, verse: navigate.verse },
      })
    },
    [bookCode, helpsScope, sendVerseNavigation]
  )

  /** Persist + token-click before navigate so dest-chapter remount can replay IDs.
   *  Navigate even when the quote is still building (no token payload yet). */
  const applyHelpsQuoteToScripture = useCallback(
    (reference: string | undefined, item?: HelpsQuoteClickItem | null) => {
      if (helpsScope !== 'scripture') return
      const live = useNavigationStore.getState().currentReference
      const { token } = planHelpsCardScriptureAction({
        bookCode: bookCode || live.book,
        reference,
        current: live,
        item: item ?? undefined,
      })
      if (token) persistHelpsHighlight(token)
      if (token) sendTokenClick({ lifecycle: 'event', token })
      // Verse/chapter jump uses the note reference — independent of quote chips.
      navigateToHelpsRow(reference)
    },
    [bookCode, helpsScope, navigateToHelpsRow, sendTokenClick]
  )

  const handleNoteSelect = useCallback(
    (note: NoteWithTokens) => {
      setSelectedHelpsCard({ kind: 'tn', id: note.id })
      if (helpsScope === 'obs') {
        navigateToHelpsRow(note.reference)
        if (note.reference) sendObsCardFrameFilter(note.reference)
        return
      }
      applyHelpsQuoteToScripture(note.reference, note)
    },
    [
      applyHelpsQuoteToScripture,
      helpsScope,
      navigateToHelpsRow,
      sendObsCardFrameFilter,
      setSelectedHelpsCard,
    ]
  )

  const handleNoteQuoteClick = useCallback(
    (note: NoteWithTokens) => {
      setSelectedHelpsCard({ kind: 'tn', id: note.id })
      if (helpsScope === 'obs') {
        navigateToHelpsRow(note.reference)
        sendObsCardFrameFilter(note.reference)
        const highlight = obsFrameHighlightFromHelpsRow({
          id: note.id,
          reference: note.reference,
          quote: note.quote,
          occurrence: note.occurrence,
          kind: 'tn',
        })
        if (!highlight) return
        broadcastObsHighlight({ lifecycle: 'event', highlight })
        return
      }
      applyHelpsQuoteToScripture(note.reference, note)
    },
    [
      applyHelpsQuoteToScripture,
      broadcastObsHighlight,
      helpsScope,
      navigateToHelpsRow,
      sendObsCardFrameFilter,
      setSelectedHelpsCard,
    ]
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

  const handleFilterBySupportReference = useCallback(
    (supportRef: string, title?: string, source?: { id: string; reference: string }) => {
      if (!supportRef?.startsWith('rc://') || !setSupportRefFilter) return
      clearCompetingFilters?.()
      const fallback =
        supportRef.match(/rc:\/\/\*\/ta\/man\/(.+)/)?.[1]?.split('/').pop() || supportRef
      setSupportRefFilter({
        supportReference: supportRef,
        title: (title && title !== 'Learn more' ? title : fallback) || fallback,
        timestamp: Date.now(),
        anchor: source
          ? helpsFilterAnchorFromRow('tn', source.id, source.reference)
          : undefined,
      })
      enterBookKindFilter?.('notes')
      setSelectedHelpsCard(null)
      setTwlArticleFilter?.(null)
    },
    [setSupportRefFilter, setTwlArticleFilter, clearCompetingFilters, enterBookKindFilter, setSelectedHelpsCard]
  )

  const handleFilterByTwlArticle = useCallback(
    (link: TranslationWordsLink, title?: string) => {
      const articlePath = twlArticleKey(
        (link as TranslationWordsLink & { articlePath?: string }).articlePath,
        link.twLink
      )
      if (!articlePath || !setTwlArticleFilter) return
      clearCompetingFilters?.()
      setSupportRefFilter?.(null)
      setTwlArticleFilter({
        articlePath,
        title: twlArticleChipTitle(title, articlePath),
        timestamp: Date.now(),
        anchor: helpsFilterAnchorFromRow('twl', link.id, link.reference),
      })
      enterBookKindFilter?.('twl')
      setSelectedHelpsCard(null)
    },
    [setTwlArticleFilter, setSupportRefFilter, clearCompetingFilters, enterBookKindFilter, setSelectedHelpsCard]
  )

  const handleTitleClick = useCallback(
    (link: TranslationWordsLink) => {
      setSelectedHelpsCard({ kind: 'twl', id: link.id })
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
    [twlKey, resourceKey, onEntryLinkClick, sendEntryLinkClick, setSelectedHelpsCard]
  )

  const handleLinkQuoteClick = useCallback(
    (link: TranslationWordsLink) => {
      setSelectedHelpsCard({ kind: 'twl', id: link.id })
      if (helpsScope === 'obs') {
        navigateToHelpsRow(link.reference)
        sendObsCardFrameFilter(link.reference)
        const highlight = obsFrameHighlightFromHelpsRow({
          id: link.id,
          reference: link.reference,
          quote: link.origWords,
          occurrence: link.occurrence,
          kind: 'twl',
        })
        if (!highlight) return
        broadcastObsHighlight({ lifecycle: 'event', highlight })
        return
      }
      applyHelpsQuoteToScripture(link.reference, link)
    },
    [
      applyHelpsQuoteToScripture,
      broadcastObsHighlight,
      helpsScope,
      navigateToHelpsRow,
      sendObsCardFrameFilter,
      setSelectedHelpsCard,
    ]
  )

  return {
    handleNoteSelect,
    handleNoteQuoteClick,
    handleSupportReferenceClick,
    handleFilterBySupportReference,
    handleFilterByTwlArticle,
    handleTitleClick,
    handleLinkQuoteClick,
  }
}
