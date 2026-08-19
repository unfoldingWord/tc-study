/**
 * TWL data pipeline: articlePath → quote/align → reference filter → display filters → group.
 */

import type { TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useMemo } from 'react'
import type { AlignedToken } from '../../../../features/helps/findAlignedTokens'
import type { HelpsQuoteStatus } from '../../../../features/helps/resolveHelpsQuoteStatus'
import {
  filterDisplayLinks,
  filterLinksByReferenceRange,
  resolveRangeEndVerse,
  type ObsQuoteFilter,
  type VerseFilterState,
} from '../../../../features/helps/helpsDisplayFilters'
import {
  generateSemanticIdsForQuoteTokens,
  parseLinkChapterVerse,
} from '../../../../features/helps/quoteTokens'
import type { TokenFilter } from '../types'
import { useAlignedTokens } from './useAlignedTokens'
import { useQuoteTokens } from './useQuoteTokens'

export type LinkWithAlignments = TranslationWordsLink & {
  quoteTokens?: Array<{ text: string; id?: string | number; strong?: string; lemma?: string; morph?: string }>
  alignedTokens?: AlignedToken[]
  semanticIds?: string[]
  quoteStatus?: HelpsQuoteStatus
}

export interface UseWordsLinksPipelineParams {
  links: TranslationWordsLink[]
  resourceKey: string
  resourceId: string
  helpsScope: 'scripture' | 'obs'
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

export function useWordsLinksPipeline({
  links,
  resourceKey,
  resourceId,
  helpsScope,
  currentRef,
  navigationMode,
  tokenFilter,
  verseFilter,
  obsQuoteFilter,
}: UseWordsLinksPipelineParams) {
  const { linksWithQuotes, quoteBuildReady } = useQuoteTokens({
    resourceKey,
    resourceId,
    links,
  })

  const { linksWithAlignedTokens } = useAlignedTokens({
    resourceKey,
    resourceId,
    links: linksWithQuotes,
    quoteBuildReady,
  })

  const processedLinks = useMemo(() => {
    if (!links?.length) return links || []
    if (linksWithAlignedTokens.length === links.length && links.length > 0) return linksWithAlignedTokens
    if (linksWithQuotes.length === links.length && linksWithQuotes.length > 0) return linksWithQuotes
    return links
  }, [links, linksWithQuotes, linksWithAlignedTokens]) as LinkWithAlignments[]

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

  const underlineTokenGroups = useMemo(() => {
    const bookCode = currentRef.book?.toLowerCase() || ''
    const groups: { sourceId: string; semanticIds: string[] }[] = []
    for (const link of filteredByReference) {
      if (!link.quoteTokens?.length && !link.semanticIds?.length) continue
      const cached = link.semanticIds
      const semanticIds =
        cached ??
        (() => {
          const { chapter, verse } = parseLinkChapterVerse(link.reference)
          return generateSemanticIdsForQuoteTokens(
            link.quoteTokens!,
            bookCode,
            chapter,
            verse,
            parseInt(link.occurrence || '1', 10)
          )
        })()
      if (semanticIds.length > 0) groups.push({ sourceId: link.id, semanticIds })
    }
    return groups
  }, [filteredByReference, currentRef.book])

  const { displayLinks, hasMatches } = useMemo(() => {
    const { displayLinks: filtered, hasLinkMatches } = filterDisplayLinks(filteredByReference, {
      helpsScope,
      obsQuoteFilter,
      verseFilter,
      tokenFilter,
      bookCodeLower: currentRef.book?.toLowerCase() || '',
      fallbackWhenEmpty: true,
    })
    return { displayLinks: filtered, hasMatches: hasLinkMatches }
  }, [filteredByReference, tokenFilter, verseFilter, obsQuoteFilter, helpsScope, currentRef.book])

  const linksByVerse = useMemo(() => {
    const grouped: Record<string, LinkWithAlignments[]> = {}
    displayLinks.forEach((link) => {
      const refParts = link.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const key = `${chapter}:${verse}`
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(link)
    })
    return grouped
  }, [displayLinks])

  return {
    filteredByReference,
    underlineTokenGroups,
    displayLinks,
    hasMatches,
    linksByVerse,
  }
}
