/**
 * CombinedHelps data pipeline: TN + TWL quote/align → underline groups → display rows.
 */

import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useMemo } from 'react'
import { resolveQuoteSemanticIds } from '../../../features/helps/resolveQuoteSemanticIds'
import {
  filterLinksByReferenceRange,
  filterNotesByReferenceRange,
  resolveRangeEndVerse,
  type ObsQuoteFilter,
  type VerseFilterState,
} from '../../../features/helps/helpsDisplayFilters'
import { parseLinkChapterVerse } from '../../../features/helps/quoteTokens'
import type { TokenFilter } from '../WordsLinksViewer/types'
import { useAlignedTokens, useQuoteTokens } from '../WordsLinksViewer/hooks'
import {
  useCombinedHelpsDisplay,
  useCombinedHelpsMergedRows,
  type LinkWithAlignments,
  type NoteWithAlignments,
} from './useCombinedHelpsMerge'
import type { HelpsKindFilter } from './types'

export interface UseCombinedHelpsPipelineParams {
  tnNotes: TranslationNote[] | null | undefined
  twlLinksRaw: TranslationWordsLink[] | null | undefined
  tnKey: string
  twlKey: string
  resourceKey: string
  resourceId: string
  helpsScope: 'scripture' | 'obs'
  kindFilter: HelpsKindFilter
  currentRef: {
    book?: string
    chapter: number
    verse: number
    endChapter?: number
    endVerse?: number
  }
  navigationMode: string
  tokenFilter: TokenFilter | null
  verseFilter: VerseFilterState | null
  obsQuoteFilter: ObsQuoteFilter | null
}

export function useCombinedHelpsPipeline({
  tnNotes,
  twlLinksRaw,
  tnKey,
  twlKey,
  resourceKey,
  resourceId,
  helpsScope,
  kindFilter,
  currentRef,
  navigationMode,
  tokenFilter,
  verseFilter,
  obsQuoteFilter,
}: UseCombinedHelpsPipelineParams) {
  const relevantNotes = useMemo(() => {
    if (!tnNotes?.length) return []
    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || startChapter
    const endVerse = resolveRangeEndVerse(currentRef, navigationMode)
    return filterNotesByReferenceRange(tnNotes, { startChapter, startVerse, endChapter, endVerse })
  }, [
    tnNotes,
    currentRef.chapter,
    currentRef.verse,
    currentRef.endChapter,
    currentRef.endVerse,
    currentRef.book,
    navigationMode,
  ])

  const notesWithQuotes = useMemo(
    () =>
      relevantNotes
        .filter((note) => note.quote && note.quote.trim().length > 0)
        .map((note) => ({
          id: note.id,
          reference: note.reference,
          tags: note.tags || '',
          occurrence: note.occurrence || '1',
          origWords: note.quote!,
          articlePath: '',
        })),
    [relevantNotes]
  )

  // SCRIPTURE_TOKENS is received on the mounted CombinedHelps resourceId.
  // TN/TWL keys are catalog sources only — they are not linked-panels resources
  // when CombinedHelps is injected into the panel.
  const { linksWithQuotes: tnLinksWithQuotes } = useQuoteTokens({
    resourceKey: tnKey || resourceKey,
    resourceId,
    links: notesWithQuotes,
  })

  const { linksWithAlignedTokens: tnLinksAligned } = useAlignedTokens({
    resourceKey: tnKey || resourceKey,
    resourceId,
    links: tnLinksWithQuotes,
  })

  const notesWithAlignedTokens = useMemo(() => {
    const quoteMap = new Map(tnLinksWithQuotes.map((l) => [l.id, l.quoteTokens]))
    const alignedMap = new Map(tnLinksAligned.map((l) => [l.id, l.alignedTokens]))
    const semanticIdsMap = new Map(
      tnLinksAligned.map((l) => [l.id, (l as { semanticIds?: string[] }).semanticIds])
    )
    return relevantNotes.map((note) => ({
      ...note,
      quoteTokens: quoteMap.get(note.id),
      alignedTokens: alignedMap.get(note.id),
      semanticIds: semanticIdsMap.get(note.id),
    })) as NoteWithAlignments[]
  }, [relevantNotes, tnLinksWithQuotes, tnLinksAligned])

  const links = useMemo(() => {
    if (!twlLinksRaw?.length) return []
    return twlLinksRaw.map((link) => ({
      ...link,
      articlePath:
        link.articlePath ||
        (() => {
          if (!link.twLink) return ''
          const m = link.twLink.match(/rc:\/\/\*\/tw\/dict\/(.+)$/)
          return m ? m[1] : ''
        })(),
    }))
  }, [twlLinksRaw])

  const { linksWithQuotes: twlLinksWithQuotes } = useQuoteTokens({
    resourceKey: twlKey || resourceKey,
    resourceId,
    links,
  })

  const { linksWithAlignedTokens: twlLinksAligned } = useAlignedTokens({
    resourceKey: twlKey || resourceKey,
    resourceId,
    links: twlLinksWithQuotes,
  })

  const processedLinks = useMemo(() => {
    if (!links.length) return []
    if (twlLinksAligned.length === links.length && links.length > 0) return twlLinksAligned
    if (twlLinksWithQuotes.length === links.length && twlLinksWithQuotes.length > 0) return twlLinksWithQuotes
    return links
  }, [links, twlLinksWithQuotes, twlLinksAligned]) as LinkWithAlignments[]

  const filteredByReference = useMemo(() => {
    if (!processedLinks.length) return []
    const startChapter = currentRef.chapter || 1
    const endChapter = currentRef.endChapter || startChapter
    const startVerse = currentRef.verse || 1
    const endVerse = resolveRangeEndVerse(
      { book: currentRef.book, verse: startVerse, endVerse: currentRef.endVerse },
      navigationMode
    )
    return filterLinksByReferenceRange(processedLinks, {
      startChapter,
      startVerse,
      endChapter,
      endVerse,
    })
  }, [
    processedLinks,
    currentRef.chapter,
    currentRef.verse,
    currentRef.endChapter,
    currentRef.endVerse,
    currentRef.book,
    navigationMode,
  ])

  const bookCodeLower = currentRef.book?.toLowerCase() || ''

  const underlineTnGroups = useMemo(() => {
    const groups: { sourceId: string; semanticIds: string[] }[] = []
    for (const note of notesWithAlignedTokens) {
      if (!note.quoteTokens?.length) continue
      const { chapter, verse } = parseLinkChapterVerse(note.reference)
      const semanticIds = resolveQuoteSemanticIds(note as never, bookCodeLower, chapter, verse)
      if (semanticIds.length > 0) groups.push({ sourceId: note.id, semanticIds })
    }
    return groups
  }, [notesWithAlignedTokens, bookCodeLower])

  const underlineTwlGroups = useMemo(() => {
    const groups: { sourceId: string; semanticIds: string[] }[] = []
    for (const link of filteredByReference) {
      if (!link.quoteTokens?.length) continue
      const { chapter, verse } = parseLinkChapterVerse(link.reference)
      const semanticIds = resolveQuoteSemanticIds(link as never, bookCodeLower, chapter, verse)
      if (semanticIds.length > 0) groups.push({ sourceId: link.id, semanticIds })
    }
    return groups
  }, [filteredByReference, bookCodeLower])

  const { displayNotes, hasNoteMatches, displayLinks, hasLinkMatches } = useCombinedHelpsDisplay({
    notesWithAlignedTokens,
    filteredByReference,
    helpsScope,
    obsQuoteFilter,
    verseFilter,
    tokenFilter,
    bookCodeLower,
  })

  const { mergedGroups } = useCombinedHelpsMergedRows({
    displayNotes,
    displayLinks,
    kindFilter,
  })

  return {
    notesWithAlignedTokens,
    filteredByReference,
    underlineTnGroups,
    underlineTwlGroups,
    displayNotes,
    hasNoteMatches,
    displayLinks,
    hasLinkMatches,
    mergedGroups,
    bookCodeLower,
  }
}
