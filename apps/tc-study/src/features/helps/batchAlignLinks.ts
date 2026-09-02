/**
 * Pure chapter-scoped quote → target-token alignment (TN / TWL).
 * Runs on the main thread or in prepare.worker via batch-align.
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import {
  helpsLanguageFromResourceKey,
  isOriginalLanguageCode,
  resolveAlignedQuoteTokens,
} from './resolveAlignedQuoteTokens'
import {
  isHelpsQuoteAlignmentPending,
  resolveHelpsQuoteStatus,
  type HelpsQuoteStatus,
} from './resolveHelpsQuoteStatus'
import { generateSemanticIdsForQuoteTokens } from './quoteTokens'
import type { AlignedToken } from './findAlignedTokens'

export interface AlignLinkInput {
  id: string
  reference: string
  origWords?: string
  quoteTokens?: OptimizedToken[]
  occurrence?: string
}

export interface AlignLinkResult {
  index: number
  id: string
  alignedTokens: AlignedToken[] | undefined
  semanticIds: string[] | undefined
  quoteStatus: HelpsQuoteStatus
}

export interface BatchAlignLinksArgs {
  links: readonly AlignLinkInput[]
  targetTokens: OptimizedToken[]
  bookCode: string
  /** Start chapter of the open helps passage. */
  currentChapter: number
  /** End chapter of the open helps passage (defaults to currentChapter). */
  endChapter?: number
  tokenBook: string
  /** Start chapter of SCRIPTURE_TOKENS reference. */
  tokenChapter: number
  /** End chapter of SCRIPTURE_TOKENS reference (defaults to tokenChapter). */
  tokenEndChapter?: number
  tokenStartVerse: number
  tokenEndVerse: number
  hasTokens: boolean
  quoteBuildReady: boolean
  resourceKey: string
  textLanguage?: string
}

export function batchAlignLinks(args: BatchAlignLinksArgs): AlignLinkResult[] {
  const {
    links,
    targetTokens,
    bookCode,
    currentChapter,
    endChapter: endChapterArg,
    tokenBook,
    tokenChapter,
    tokenEndChapter: tokenEndChapterArg,
    tokenStartVerse,
    tokenEndVerse,
    hasTokens,
    quoteBuildReady,
    resourceKey,
    textLanguage,
  } = args

  const passageEndChapter = endChapterArg ?? currentChapter
  const tokenEndChapter = tokenEndChapterArg ?? tokenChapter
  const quoteLanguage = helpsLanguageFromResourceKey(resourceKey)
  const refBookLower = tokenBook.toLowerCase()
  const bookLower = bookCode.toLowerCase()

  const settledStatus = (link: AlignLinkInput, hasAligned: boolean): HelpsQuoteStatus =>
    resolveHelpsQuoteStatus({
      hasAlignedTokens: hasAligned,
      alignmentPending: false,
      olQuote: link.origWords,
    })

  if (!links.length) return []

  if (!hasTokens) {
    return links.map((link, index) => ({
      index,
      id: link.id,
      alignedTokens: undefined,
      semanticIds: undefined,
      quoteStatus: resolveHelpsQuoteStatus({
        hasAlignedTokens: false,
        alignmentPending: true,
        olQuote: link.origWords,
      }),
    }))
  }

  return links.map((link, index) => {
    const refParts = link.reference.split(':')
    const linkChapter = parseInt(refParts[0] || '1', 10)
    const linkVerse = parseInt(refParts[1] || '1', 10)

    if (linkChapter < currentChapter || linkChapter > passageEndChapter) {
      return {
        index,
        id: link.id,
        alignedTokens: undefined,
        semanticIds: undefined,
        quoteStatus: settledStatus(link, false),
      }
    }

    const tokensMatchPassage = !!(
      refBookLower === bookLower &&
      linkChapter >= tokenChapter &&
      linkChapter <= tokenEndChapter
    )
    const alignmentPending = isHelpsQuoteAlignmentPending({
      hasTargetTokens: hasTokens,
      tokensMatchPassage,
      quoteBuildReady,
    })

    if (!tokensMatchPassage) {
      return {
        index,
        id: link.id,
        alignedTokens: undefined,
        semanticIds: undefined,
        quoteStatus: resolveHelpsQuoteStatus({
          hasAlignedTokens: false,
          alignmentPending,
          olQuote: link.origWords,
        }),
      }
    }

    const verseStart = linkChapter === tokenChapter ? tokenStartVerse : 1
    const verseEnd = linkChapter === tokenEndChapter ? tokenEndVerse : 999
    if (linkVerse < verseStart || linkVerse > verseEnd) {
      return {
        index,
        id: link.id,
        alignedTokens: undefined,
        semanticIds: undefined,
        quoteStatus: settledStatus(link, false),
      }
    }

    const linkOccurrence = parseInt(String(link.occurrence ?? '1'), 10)
    const originalSemanticIds = link.quoteTokens?.length
      ? generateSemanticIdsForQuoteTokens(
          link.quoteTokens,
          bookCode,
          linkChapter,
          linkVerse,
          linkOccurrence
        )
      : []

    const { alignedTokens, semanticIds } = resolveAlignedQuoteTokens({
      targetTokens,
      originalSemanticIds,
      quoteText: link.origWords,
      occurrence: linkOccurrence,
      bookCode,
      chapter: linkChapter,
      verse: linkVerse,
      quoteLanguage,
      textLanguage,
    })

    const hasAligned = alignedTokens.length > 0
    return {
      index,
      id: link.id,
      alignedTokens: hasAligned ? alignedTokens : undefined,
      semanticIds: semanticIds.length > 0 ? semanticIds : undefined,
      quoteStatus: resolveHelpsQuoteStatus({
        hasAlignedTokens: hasAligned,
        alignmentPending: hasAligned ? false : alignmentPending,
        olQuote: link.origWords,
      }),
    }
  })
}

