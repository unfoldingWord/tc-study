/**
 * TN data pipeline: reference filter → quote/align tokens → display filters → group by verse.
 */

import type { TranslationNote } from '@bt-synergy/resource-parsers'
import { useMemo } from 'react'
import {
  filterDisplayNotes,
  filterNotesByReferenceRange,
  resolveRangeEndVerse,
  type ObsQuoteFilter,
  type VerseFilterState,
} from '../../../../features/helps/helpsDisplayFilters'
import {
  generateSemanticIdsForQuoteTokens,
  parseLinkChapterVerse,
} from '../../../../features/helps/quoteTokens'
import type { TokenFilter } from '../../WordsLinksViewer/types'
import { useAlignedTokens, useQuoteTokens } from '../../WordsLinksViewer/hooks'
import type { NoteWithTokens } from '../components/TranslationNoteCard'

export interface UseTranslationNotesPipelineParams {
  notes: TranslationNote[] | null | undefined
  resourceKey: string
  resourceId: string
  currentRef: {
    book?: string
    chapter: number
    verse: number
    endChapter?: number
    endVerse?: number
  }
  navigationMode: string
  isObs: boolean
  tokenFilter: TokenFilter | null
  verseFilter: VerseFilterState | null
  obsQuoteFilter: ObsQuoteFilter | null
}

export function useTranslationNotesPipeline({
  notes,
  resourceKey,
  resourceId,
  currentRef,
  navigationMode,
  isObs,
  tokenFilter,
  verseFilter,
  obsQuoteFilter,
}: UseTranslationNotesPipelineParams) {
  const relevantNotes = useMemo(() => {
    if (!notes?.length) return []
    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || startChapter
    const endVerse = resolveRangeEndVerse(currentRef, navigationMode)
    return filterNotesByReferenceRange(notes, { startChapter, startVerse, endChapter, endVerse })
  }, [notes, currentRef.chapter, currentRef.verse, currentRef.endChapter, currentRef.endVerse, currentRef.book, navigationMode])

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

  const { linksWithQuotes, quoteBuildReady } = useQuoteTokens({
    resourceKey,
    resourceId,
    links: notesWithQuotes,
  })

  const { linksWithAlignedTokens } = useAlignedTokens({
    resourceKey,
    resourceId,
    links: linksWithQuotes,
    quoteBuildReady,
  })

  const notesWithAlignedTokens = useMemo(() => {
    const quoteTokensMap = new Map(linksWithQuotes.map((link) => [link.id, link.quoteTokens]))
    const alignedTokensMap = new Map(linksWithAlignedTokens.map((link) => [link.id, link.alignedTokens]))
    const semanticIdsMap = new Map(
      linksWithAlignedTokens.map((link) => [link.id, (link as { semanticIds?: string[] }).semanticIds])
    )
    const quoteStatusMap = new Map(linksWithAlignedTokens.map((link) => [link.id, link.quoteStatus]))
    return relevantNotes.map((note) => ({
      ...note,
      quoteTokens: quoteTokensMap.get(note.id),
      alignedTokens: alignedTokensMap.get(note.id),
      semanticIds: semanticIdsMap.get(note.id),
      quoteStatus: quoteStatusMap.get(note.id),
    })) as NoteWithTokens[]
  }, [relevantNotes, linksWithQuotes, linksWithAlignedTokens])

  const underlineTokenGroups = useMemo(() => {
    const bookCode = currentRef.book?.toLowerCase() || ''
    const groups: { sourceId: string; semanticIds: string[] }[] = []
    for (const note of notesWithAlignedTokens) {
      if (!note.quoteTokens?.length && !note.semanticIds?.length) continue
      const cached = note.semanticIds
      const semanticIds =
        cached ??
        (() => {
          const { chapter, verse } = parseLinkChapterVerse(note.reference)
          return generateSemanticIdsForQuoteTokens(
            note.quoteTokens!,
            bookCode,
            chapter,
            verse,
            parseInt(note.occurrence || '1', 10)
          )
        })()
      if (semanticIds.length > 0) groups.push({ sourceId: note.id, semanticIds })
    }
    return groups
  }, [notesWithAlignedTokens, currentRef.book])

  const { displayNotes, hasMatches } = useMemo(() => {
    const { displayNotes: filtered, hasNoteMatches } = filterDisplayNotes(notesWithAlignedTokens, {
      helpsScope: isObs ? 'obs' : 'scripture',
      obsQuoteFilter,
      verseFilter,
      tokenFilter,
      bookCodeLower: currentRef.book?.toLowerCase() || '',
      fallbackWhenEmpty: true,
    })
    return { displayNotes: filtered, hasMatches: hasNoteMatches }
  }, [notesWithAlignedTokens, tokenFilter, verseFilter, obsQuoteFilter, isObs, currentRef.book])

  const notesByVerse = useMemo(() => {
    const grouped: Record<string, NoteWithTokens[]> = {}
    for (const note of displayNotes) {
      const ref = note.reference
      if (!grouped[ref]) grouped[ref] = []
      grouped[ref].push(note)
    }
    return grouped
  }, [displayNotes])

  return {
    notesWithAlignedTokens,
    underlineTokenGroups,
    displayNotes,
    hasMatches,
    notesByVerse,
  }
}
