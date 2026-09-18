/**
 * CombinedHelps data pipeline: TN + TWL quote/align → underline groups → display rows.
 */

import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useMemo, useRef } from 'react'
import {
  filterLinksByReferenceRange,
  filterNotesByReferenceRange,
  resolveRangeEndVerse,
  mergeFocusChapterBookMatches,
  reuseUnchangedSupportRefNotes,
  settleSupportRefDisplayNotes,
  settleTwlArticleDisplayLinks,
  streamRowsForChapter,
  supportRefFirstPaintNotes,
  supportRefNotesForChapter,
  twlArticleFirstPaintLinks,
  twlArticleLinksForChapter,
  type ObsQuoteFilter,
  type SupportRefFilter,
  type TwlArticleFilter,
  type VerseFilterState,
} from '../../../features/helps/helpsDisplayFilters'
import { useSupportRefBookStream } from '../../../features/helps/useSupportRefBookStream'
import { useTwlArticleBookStream } from '../../../features/helps/useTwlArticleBookStream'
import { useTwlArticleQuotes } from '../../../features/helps/useTwlArticleQuotes'
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
import { underlineGroupsFromHelpsNotes, chapterHelpsRowsForUnderlines } from '../../../features/helps/scriptureReadyUnderlineRebind'
import { measureScripturePerfSync } from '../../../features/perf/scripturePerf'
import type { NotesFullRow } from '../../../features/notes/notesPreparer'
import type { WordsLinksFullRow } from '../../../features/wordsLinks/wordsLinksPreparer'
import { articlePathFromTwLink } from '../../../features/wordsLinks/wordsLinksPreparer'
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
  twlArticleFilter?: TwlArticleFilter | null
  /** Target scripture key for align-cache hydrate + lane 2 align jobs. */
  targetKey?: string | null
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
  twlArticleFilter = null,
  targetKey = '',
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

  const supportRefQuoteEnrichment = useSupportRefQuotes({
    enabled: Boolean(supportRefFilter),
    notesByChapter,
    fallbackNotes: tnNotes,
    supportReference: supportRefFilter?.supportReference ?? '',
    tnKey: tnKey || resourceKey,
    bookId: currentRef.book || '',
    focusChapter: currentRef.chapter,
    targetKey,
  })

  const { streamedNotes: streamedSupportRefNotes, streamPending: supportRefStreamPending } =
    useSupportRefBookStream({
      enabled: Boolean(supportRefFilter),
      notesByChapter,
      fallbackNotes: tnNotes,
      supportReference: supportRefFilter?.supportReference ?? '',
      focusChapter: currentRef.chapter,
    })

  const { streamedLinks: streamedTwlArticleLinks, streamPending: twlArticleStreamPending } =
    useTwlArticleBookStream({
      enabled: Boolean(twlArticleFilter),
      linksByChapter,
      fallbackLinks: twlLinksRaw,
      articlePath: twlArticleFilter?.articlePath ?? '',
      focusChapter: currentRef.chapter,
    })

  const twlArticleQuoteEnrichment = useTwlArticleQuotes({
    enabled: Boolean(twlArticleFilter),
    linksByChapter,
    fallbackLinks: twlLinksRaw,
    articlePath: twlArticleFilter?.articlePath ?? '',
    twlKey: twlKey || resourceKey,
    bookId: currentRef.book || '',
    focusChapter: currentRef.chapter,
    targetKey,
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
  if (twlArticleQuoteEnrichment.size) {
    mergeHelpsTokenCache(
      helpsTokenCacheRef.current,
      [...twlArticleQuoteEnrichment.entries()].map(([id, row]) => ({ id, ...row }))
    )
  }

  // Chapter quote/align (useQuoteTokens) must not restart when book-filter
  // enrichment paints off-chapter rows — that cancel thrash left quotes stuck.
  // Book-filter display attaches enrichment via settle* below.
  const relevantNotesHydrated = useMemo(
    () =>
      attachHelpsTokenCache(relevantNotes, helpsTokenCacheRef.current) as Array<
        PreparedTranslationNote & HelpsTokenCacheRow
      >,
    [relevantNotes]
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
        quoteWarmPending: fromAlignUsable ? undefined : note.quoteWarmPending,
      }
    }) as NoteWithAlignments[]
  }, [relevantNotesHydrated, tnLinksWithQuotes, tnLinksAligned])

  const supportRefDisplayPrevRef = useRef<NoteWithAlignments[]>([])
  // Support-ref: current-chapter matches first (already quote/aligned), then streamed book.
  const notesForDisplay = useMemo((): NoteWithAlignments[] => {
    if (!supportRefFilter) {
      supportRefDisplayPrevRef.current = []
      return notesWithAlignedTokens
    }
    const firstPaint = mergeFocusChapterBookMatches(
      supportRefFirstPaintNotes(
        notesWithAlignedTokens,
        supportRefFilter.supportReference,
        currentRef.chapter
      ),
      supportRefNotesForChapter(
        notesByChapter?.[String(currentRef.chapter)] ?? [],
        supportRefFilter.supportReference
      )
    )
    const alignById = new Map(notesWithAlignedTokens.map((n) => [n.id, n]))
    // Stream skips only the *initial* focus chapter and does not restart on
    // chapter jumps — so after a cross-chapter card click the destination
    // chapter is in both firstPaint and streamed. Prefer firstPaint (aligned).
    const settled = settleSupportRefDisplayNotes(
      mergeFocusChapterBookMatches(firstPaint, streamedSupportRefNotes),
      supportRefFilter.supportReference,
      alignById,
      supportRefQuoteEnrichment
    ) as NoteWithAlignments[]
    const reused = reuseUnchangedSupportRefNotes(settled, supportRefDisplayPrevRef.current)
    supportRefDisplayPrevRef.current = reused
    return reused
  }, [
    supportRefFilter,
    notesWithAlignedTokens,
    streamedSupportRefNotes,
    supportRefQuoteEnrichment,
    currentRef.chapter,
    notesByChapter,
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

  const twlArticleDisplayPrevRef = useRef<LinkWithAlignments[]>([])
  // TWL article: current-chapter matches first (already quote/aligned), then streamed book.
  const linksForDisplay = useMemo((): LinkWithAlignments[] => {
    if (!twlArticleFilter) {
      twlArticleDisplayPrevRef.current = []
      return processedLinks
    }
    const firstPaint = mergeFocusChapterBookMatches(
      twlArticleFirstPaintLinks(
        processedLinks,
        twlArticleFilter.articlePath,
        currentRef.chapter
      ),
      twlArticleLinksForChapter(
        streamRowsForChapter(linksByChapter, twlLinksRaw, currentRef.chapter),
        twlArticleFilter.articlePath
      )
    )
    const alignById = new Map(processedLinks.map((link) => [link.id, link]))
    const streamed = streamedTwlArticleLinks.map(withArticlePath)
    const cacheHits = attachHelpsTokenCache(streamed, helpsTokenCacheRef.current)
    // Same as support-ref: streamed off-focus rows can overlap firstPaint after
    // navigating to a previously streamed chapter (TWL article filter click).
    const settled = settleTwlArticleDisplayLinks(
      mergeFocusChapterBookMatches(firstPaint, cacheHits),
      twlArticleFilter.articlePath,
      alignById,
      twlArticleQuoteEnrichment
    ) as LinkWithAlignments[]
    const reused = reuseUnchangedSupportRefNotes(settled, twlArticleDisplayPrevRef.current)
    twlArticleDisplayPrevRef.current = reused
    return reused
  }, [
    twlArticleFilter,
    processedLinks,
    streamedTwlArticleLinks,
    twlArticleQuoteEnrichment,
    currentRef.chapter,
    linksByChapter,
    twlLinksRaw,
  ])
  mergeHelpsTokenCache(helpsTokenCacheRef.current, linksForDisplay)

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
  // Book filters: use current-chapter display rows (enrichment tokens), not the
  // unfiltered chapter slice — otherwise only the first already-built note underlines.
  const underlineTnGroups = useMemo(
    () =>
      measureScripturePerfSync('underline-groups', 'tn', () => {
        const quoteMap = new Map(tnLinksWithQuotes.map((l) => [l.id, l.quoteTokens]))
        const semanticIdsMap = new Map(
          tnLinksAligned.map((l) => [l.id, (l as { semanticIds?: string[] }).semanticIds])
        )
        const sourceNotes = supportRefFilter
          ? chapterHelpsRowsForUnderlines(notesForDisplay, currentRef.chapter)
          : relevantNotesHydrated
        const notesForUnderline = sourceNotes.map((note) => ({
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
    [
      relevantNotesHydrated,
      notesForDisplay,
      supportRefFilter,
      tnLinksWithQuotes,
      tnLinksAligned,
      bookCodeLower,
      currentRef.chapter,
    ]
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
        if (twlArticleFilter) {
          const chapterLinks = chapterHelpsRowsForUnderlines(
            linksForDisplay,
            startChapter,
            endChapter
          )
          return underlineGroupsFromHelpsNotes(chapterLinks, bookCodeLower)
        }
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
      linksForDisplay,
      twlArticleFilter,
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
    notesWithAlignedTokens: twlArticleFilter ? [] : notesForDisplay,
    filteredByReference: supportRefFilter ? [] : twlArticleFilter ? linksForDisplay : filteredByReference,
    helpsScope,
    obsQuoteFilter,
    verseFilter,
    tokenFilter,
    supportRefFilter,
    twlArticleFilter,
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
    supportRefStreamPending,
    twlArticleStreamPending,
  }
}
