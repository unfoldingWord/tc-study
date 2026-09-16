/**
 * Pure chapter-scoped quote → target-token alignment (TN / TWL).
 * Runs on warm.worker (preferred) or prepare.worker via batch-align; sync
 * only for tiny batches / worker unavailable.
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

type AlignReadyToken = OptimizedToken & { alignedOriginalWordIds?: unknown[] }

/**
 * True when target tokens can participate in zaln / semantic-id align.
 * Word tokens with empty alignedOriginalWordIds (pre-align hydrate, light extract)
 * must not settle ol-fallback — stay pending until alignments exist.
 * Original-language panes match on the token's own semanticId, so words alone suffice.
 */
export function targetTokensAreAlignReady(
  tokens: readonly OptimizedToken[],
  textLanguage?: string
): boolean {
  if (!tokens.length) return false
  if (isOriginalLanguageCode(textLanguage)) {
    return tokens.some((t) => t.type === 'word')
  }
  return tokens.some((t) => {
    if (t.type !== 'word') return false
    const ids = (t as AlignReadyToken).alignedOriginalWordIds
    return Array.isArray(ids) && ids.length > 0
  })
}

export interface AlignLinkInput {
  id: string
  reference: string
  origWords?: string
  quoteTokens?: OptimizedToken[]
  occurrence?: string
  /**
   * Per-link quote-build readiness. When false, stay pending and skip the
   * expensive align path so staged/partial quote builds do not paint ol-fallback.
   * Undefined means ready (legacy / sync-full callers).
   */
  quoteReady?: boolean
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

  // Missing tokens OR tokens without zaln/align ids: stay pending. Never paint
  // ol-fallback here — fingerprint + cache retry re-run when align-ready tokens arrive.
  // (Settling early wrote permanent helps-align m:0 and stuck TN chips on OL.)
  const alignReady = hasTokens && targetTokensAreAlignReady(targetTokens, textLanguage)
  if (!alignReady) {
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
    // Staged quote-build: unready links stay pending and skip resolveAlignedQuoteTokens.
    if (link.quoteReady === false) {
      return {
        index,
        id: link.id,
        alignedTokens: undefined,
        semanticIds: undefined,
        quoteStatus: resolveHelpsQuoteStatus({
          hasAlignedTokens: false,
          alignmentPending: true,
          olQuote: link.origWords,
        }),
      }
    }

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
    const linkQuoteReady = quoteBuildReady && (link.quoteReady ?? true)
    const alignmentPending = isHelpsQuoteAlignmentPending({
      hasTargetTokens: alignReady,
      tokensMatchPassage,
      quoteBuildReady: linkQuoteReady,
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

