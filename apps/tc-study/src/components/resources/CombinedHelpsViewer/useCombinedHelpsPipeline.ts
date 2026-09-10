/**
 * CombinedHelps data pipeline: TN + TWL quote/align → underline groups → display rows.
 */

import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useMemo, useRef } from 'react'
import {
  filterLinksByReferenceRange,
  filterNotesByReferenceRange,
  flattenBookNotes,
  resolveRangeEndVerse,
  settleSupportRefDisplayNotes,
  supportReferencesMatch,
  type ObsQuoteFilter,
  type SupportRefFilter,
  type VerseFilterState,
} from '../../../features/helps/helpsDisplayFilters'
import { useSupportRefQuotes } from '../../../features/helps/useSupportRefQuotes'
import {
  attachHelpsTokenCache,
  mergeHelpsTokenCache,
  preparedRowsCoverChapterSpan,
  type HelpsTokenCacheRow,
} from '../../../features/helps/helpsTokenReuse'
import {
  preparedLinkToTranslationWordsLink,
  preparedNoteToTranslationNote,
  type PreparedTranslationNote,
} from '../../../features/helps/preparedHelpsRows'
import { underlineGroupsFromHelpsNotes } from '../../../features/helps/scriptureReadyUnderlineRebind'
import { measureScripturePerfSync } from '../../../features/perf/scripturePerf'
import type { NotesFullRow } from '../../../features/notes/notesPreparer'
import type { WordsLinksFullRow } from '../../../features/wordsLinks/wordsLinksPreparer'
import { articlePathFromTwLink } from '../../../features/wordsLinks/wordsLinksPreparer'
import type { TokenFilter } from '../WordsLinksViewer/types'
import { useAlignedTokens, useQuoteTokens, useScriptureTokens } from '../WordsLinksViewer/hooks'
import { useAppStore } from '../../../contexts/AppContext'
import {
  useCombinedHelpsDisplay,
  useCombinedHelpsMergedRows,
  type LinkWithAlignments,
  type NoteWithAlignments,
} from './useCombinedHelpsMerge'
import type { HelpsKindFilter } from './types'

export interface UseCombinedHelpsPipelineParams {
  tnNotes: TranslationNote[] | null | undefined
  /** Prefer chapter map when available to avoid full-book scans. */
  notesByChapter?: Record<string, TranslationNote[]> | null
  /** Prepared TN rows (preferred over loader slice when present). */
  preparedNotes?: NotesFullRow[] | null
  twlLinksRaw: TranslationWordsLink[] | null | undefined
  linksByChapter?: Record<string, TranslationWordsLink[]> | null
  /** Prepared TWL rows (preferred over loader slice when present). */
  preparedLinks?: WordsLinksFullRow[] | null
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
  supportRefFilter?: SupportRefFilter | null
}

function collectChapterSlice<T>(
  byChapter: Record<string, T[]> | null | undefined,
  fallback: T[] | null | undefined,
  startChapter: number,
  endChapter: number
): T[] {
  if (byChapter && Object.keys(byChapter).length > 0) {
    const out: T[] = []
    for (let c = startChapter; c <= endChapter; c++) {
      const rows = byChapter[String(c)]
      if (rows?.length) out.push(...rows)
    }
    return out
  }
  return fallback ?? []
}

function withArticlePath(link: TranslationWordsLink & { articlePath?: string }): TranslationWordsLink & {
  articlePath: string
} {
  return {
    ...link,
    articlePath: link.articlePath || articlePathFromTwLink(link.twLink),
  }
}

export function useCombinedHelpsPipeline({
  tnNotes,
  notesByChapter,
  preparedNotes,
  twlLinksRaw,
  linksByChapter,
  preparedLinks,
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
  supportRefFilter = null,
}: UseCombinedHelpsPipelineParams) {
  // Chapter-scoped notes drive underlines + quote/align for the current passage.
  const relevantNotes = useMemo((): PreparedTranslationNote[] => {
    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || startChapter
    const endVerse = resolveRangeEndVerse(currentRef, navigationMode)

    const chapterScoped: PreparedTranslationNote[] =
      preparedRowsCoverChapterSpan(preparedNotes, startChapter, endChapter) && preparedNotes
        ? preparedNotes.map(preparedNoteToTranslationNote)
        : collectChapterSlice(notesByChapter, tnNotes, startChapter, endChapter)

    if (!chapterScoped.length) return []
    return filterNotesByReferenceRange(chapterScoped, {
      startChapter,
      startVerse,
      endChapter,
      endVerse,
    }) as PreparedTranslationNote[]
  }, [
    preparedNotes,
    tnNotes,
    notesByChapter,
    currentRef.chapter,
    currentRef.verse,
    currentRef.endChapter,
    currentRef.endVerse,
    currentRef.book,
    navigationMode,
  ])

  // Book-wide TN rows for support-ref filter (no quote/align — display filter only).
  const bookNotesForSupportRef = useMemo((): PreparedTranslationNote[] => {
    if (!supportRefFilter) return []
    return flattenBookNotes(notesByChapter, tnNotes) as PreparedTranslationNote[]
  }, [supportRefFilter, notesByChapter, tnNotes])

  const supportRefMatchList = useMemo(() => {
    if (!supportRefFilter) return [] as PreparedTranslationNote[]
    return bookNotesForSupportRef.filter((n) =>
      supportReferencesMatch(n.supportReference, supportRefFilter.supportReference)
    )
  }, [supportRefFilter, bookNotesForSupportRef])

  const { sourceResourceId } = useScriptureTokens({ resourceId })
  const targetScriptureKey = useAppStore((s) => {
    if (!sourceResourceId) return ''
    const r = s.loadedResources[sourceResourceId]
    return r?.key || ''
  })

  const supportRefQuoteEnrichment = useSupportRefQuotes({
    enabled: Boolean(supportRefFilter),
    notes: supportRefMatchList,
    tnKey: tnKey || resourceKey,
    bookId: currentRef.book || '',
    targetScriptureKey,
    focusChapter: currentRef.chapter,
  })

  const helpsTokenCacheRef = useRef(new Map<string, HelpsTokenCacheRow>())
  const helpsTokenBookRef = useRef(currentRef.book)
  if (helpsTokenBookRef.current !== currentRef.book) {
    helpsTokenBookRef.current = currentRef.book
    helpsTokenCacheRef.current = new Map()
  }
  if (supportRefQuoteEnrichment.size) {
    mergeHelpsTokenCache(
      helpsTokenCacheRef.current,
      [...supportRefQuoteEnrichment.entries()].map(([id, row]) => ({ id, ...row }))
    )
  }

  const relevantNotesHydrated = useMemo(
    () =>
      attachHelpsTokenCache(relevantNotes, helpsTokenCacheRef.current) as Array<
        PreparedTranslationNote & HelpsTokenCacheRow
      >,
    [relevantNotes, supportRefQuoteEnrichment]
  )

  const notesWithQuotes = useMemo(
    () =>
      relevantNotesHydrated
        .filter((note) => note.quote && note.quote.trim().length > 0)
        .map((note) => ({
          id: note.id,
          reference: note.reference,
          tags: note.tags || '',
          occurrence: note.occurrence || '1',
          origWords: note.quote!,
          articlePath: '',
          quoteTokens: note.quoteTokens,
          alignedTokens: note.alignedTokens,
          semanticIds: note.semanticIds,
          quoteStatus: note.quoteStatus,
        })),
    [relevantNotesHydrated]
  )

  // SCRIPTURE_TOKENS is received on the mounted CombinedHelps resourceId.
  // TN/TWL keys are catalog sources only — they are not linked-panels resources
  // when CombinedHelps is injected into the panel.
  const {
    linksWithQuotes: tnLinksWithQuotes,
    quoteBuildReady: tnQuoteBuildReady,
    olBlocked: tnOlBlocked,
  } = useQuoteTokens({
      resourceKey: tnKey || resourceKey,
      resourceId,
      links: notesWithQuotes,
    })

  const { linksWithAlignedTokens: tnLinksAligned } = useAlignedTokens({
    resourceKey: tnKey || resourceKey,
    resourceId,
    links: tnLinksWithQuotes,
    quoteBuildReady: tnQuoteBuildReady,
  })

  const notesWithAlignedTokens = useMemo(() => {
    const quoteMap = new Map(tnLinksWithQuotes.map((l) => [l.id, l.quoteTokens]))
    const alignedMap = new Map(tnLinksAligned.map((l) => [l.id, l.alignedTokens]))
    const semanticIdsMap = new Map(
      tnLinksAligned.map((l) => [l.id, (l as { semanticIds?: string[] }).semanticIds])
    )
    const quoteStatusMap = new Map(tnLinksAligned.map((l) => [l.id, l.quoteStatus]))
    return relevantNotesHydrated.map((note) => {
      const quoteTokens = quoteMap.get(note.id)
      const alignedTokens = alignedMap.get(note.id)
      const semanticIds = semanticIdsMap.get(note.id)
      const fromAlignUsable =
        (Array.isArray(alignedTokens) && alignedTokens.length > 0) ||
        (Array.isArray(semanticIds) && semanticIds.length > 0)
      return {
        ...note,
        quoteTokens: quoteTokens?.length ? quoteTokens : note.quoteTokens,
        alignedTokens: alignedTokens?.length ? alignedTokens : note.alignedTokens,
        semanticIds: semanticIds?.length ? semanticIds : note.semanticIds,
        // Empty-quote notes skip quote-build; settle immediately so cards paint prose.
        // Live align status wins over a cached `pending` so chips can become ULT/OL.
        quoteStatus: fromAlignUsable
          ? quoteStatusMap.get(note.id) ?? note.quoteStatus
          : quoteStatusMap.get(note.id) ??
            (note.quoteStatus === 'pending' ? undefined : note.quoteStatus) ??
            (note.quote?.trim() ? undefined : 'none'),
      }
    }) as NoteWithAlignments[]
  }, [relevantNotesHydrated, tnLinksWithQuotes, tnLinksAligned])

  // When support-ref filter is on, show matching TN notes across the whole book.
  // Passage-aligned rows win; otherwise merge IndexedDB quote cache + off-passage align.
  const notesForDisplay = useMemo((): NoteWithAlignments[] => {
    if (!supportRefFilter) return notesWithAlignedTokens
    const alignById = new Map(notesWithAlignedTokens.map((n) => [n.id, n]))
    return settleSupportRefDisplayNotes(
      bookNotesForSupportRef,
      supportRefFilter.supportReference,
      alignById,
      supportRefQuoteEnrichment
    ) as NoteWithAlignments[]
  }, [
    supportRefFilter,
    notesWithAlignedTokens,
    bookNotesForSupportRef,
    supportRefQuoteEnrichment,
  ])

  mergeHelpsTokenCache(helpsTokenCacheRef.current, notesWithAlignedTokens)
  mergeHelpsTokenCache(helpsTokenCacheRef.current, notesForDisplay)

  const links = useMemo(() => {
    const startChapter = currentRef.chapter || 1
    const endChapter = currentRef.endChapter || startChapter
    const raw =
      preparedRowsCoverChapterSpan(preparedLinks, startChapter, endChapter) && preparedLinks
        ? preparedLinks.map(preparedLinkToTranslationWordsLink)
        : (() => {
            const chapterScoped = collectChapterSlice(
              linksByChapter,
              twlLinksRaw,
              startChapter,
              endChapter
            )
            if (!chapterScoped.length) return []
            return chapterScoped.map(withArticlePath)
          })()
    return attachHelpsTokenCache(raw, helpsTokenCacheRef.current)
  }, [preparedLinks, twlLinksRaw, linksByChapter, currentRef.chapter, currentRef.endChapter])

  const {
    linksWithQuotes: twlLinksWithQuotes,
    quoteBuildReady: twlQuoteBuildReady,
    olBlocked: twlOlBlocked,
  } = useQuoteTokens({
      resourceKey: twlKey || resourceKey,
      resourceId,
      links,
    })

  const { linksWithAlignedTokens: twlLinksAligned } = useAlignedTokens({
    resourceKey: twlKey || resourceKey,
    resourceId,
    links: twlLinksWithQuotes,
    quoteBuildReady: twlQuoteBuildReady,
  })

  const processedLinks = useMemo(() => {
    if (!links.length) return []
    if (twlLinksAligned.length === links.length && links.length > 0) return twlLinksAligned
    if (twlLinksWithQuotes.length === links.length && twlLinksWithQuotes.length > 0) return twlLinksWithQuotes
    return links
  }, [links, twlLinksWithQuotes, twlLinksAligned]) as LinkWithAlignments[]
  mergeHelpsTokenCache(helpsTokenCacheRef.current, processedLinks)

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

  // Underlines come from quoteTokens (cache/worker) — do not wait on align settle.
  const underlineTnGroups = useMemo(
    () =>
      measureScripturePerfSync('underline-groups', 'tn', () => {
        const quoteMap = new Map(tnLinksWithQuotes.map((l) => [l.id, l.quoteTokens]))
        const semanticIdsMap = new Map(
          tnLinksAligned.map((l) => [l.id, (l as { semanticIds?: string[] }).semanticIds])
        )
        const notesForUnderline = relevantNotesHydrated.map((note) => ({
          id: note.id,
          reference: note.reference,
          occurrence: note.occurrence,
          quoteTokens: quoteMap.get(note.id) ?? note.quoteTokens,
          semanticIds:
            semanticIdsMap.get(note.id) ??
            (Array.isArray(note.semanticIds) ? (note.semanticIds as string[]) : undefined),
        }))
        return underlineGroupsFromHelpsNotes(notesForUnderline, bookCodeLower)
      }),
    [relevantNotesHydrated, tnLinksWithQuotes, tnLinksAligned, bookCodeLower]
  )

  const underlineTwlGroups = useMemo(
    () =>
      measureScripturePerfSync('underline-groups', 'twl', () => {
        const startChapter = currentRef.chapter || 1
        const endChapter = currentRef.endChapter || startChapter
        const startVerse = currentRef.verse || 1
        const endVerse = resolveRangeEndVerse(
          { book: currentRef.book, verse: startVerse, endVerse: currentRef.endVerse },
          navigationMode
        )
        // Prefer quote-bearing rows; fall back to aligned/processed for semanticIds.
        const quoteSource =
          twlLinksWithQuotes.length === links.length && links.length > 0
            ? twlLinksWithQuotes
            : processedLinks
        const ranged = filterLinksByReferenceRange(quoteSource, {
          startChapter,
          startVerse,
          endChapter,
          endVerse,
        })
        return underlineGroupsFromHelpsNotes(ranged, bookCodeLower)
      }),
    [
      twlLinksWithQuotes,
      processedLinks,
      links.length,
      currentRef.chapter,
      currentRef.verse,
      currentRef.endChapter,
      currentRef.endVerse,
      currentRef.book,
      navigationMode,
      bookCodeLower,
    ]
  )

  const { displayNotes, hasNoteMatches, displayLinks, hasLinkMatches } = useCombinedHelpsDisplay({
    notesWithAlignedTokens: notesForDisplay,
    filteredByReference: supportRefFilter ? [] : filteredByReference,
    helpsScope,
    obsQuoteFilter,
    verseFilter,
    tokenFilter,
    supportRefFilter,
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
    tnQuoteBuildReady,
    twlQuoteBuildReady,
    quotesBlocked: tnOlBlocked || twlOlBlocked,
  }
}
