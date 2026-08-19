/**
 * useAlignedTokens Hook - STEP 3 of TSV Alignment Algorithm
 *
 * Gets aligned tokens from target language scripture for displaying quotes.
 * This is the universal algorithm documented in apps/tc-study/TWL_ALIGNMENT_SYSTEM.md
 *
 * Algorithm Flow (Complete):
 * STEP 1: TWL origWords → Original Language tokens (via QuoteMatcher in useQuoteTokens)
 * STEP 2: Extract semantic IDs from original tokens (e.g., "TIT 1:1:Παῦλος:1")
 * STEP 3: Find target tokens where alignedOriginalWordIds contains our semantic IDs
 *         (or the token's own semanticId when UGNT/UHB is the text pane).
 * STEP 4: If still empty and quote language matches text language (or text is OL),
 *         match quote text against text-pane word tokens.
 */

import { useMemo } from 'react'
import { useCurrentReference } from '../../../../contexts'
import {
  helpsLanguageFromResourceKey,
  isOriginalLanguageCode,
  resolveAlignedQuoteTokens,
} from '../../../../features/helps/resolveAlignedQuoteTokens'
import {
  isHelpsQuoteAlignmentPending,
  resolveHelpsQuoteStatus,
  type HelpsQuoteStatus,
} from '../../../../features/helps/resolveHelpsQuoteStatus'
import { generateSemanticIdsForQuoteTokens } from '../../../../features/helps/quoteTokens'
import { useScriptureTokens } from './useScriptureTokens'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'

/** Minimal link shape needed to attach aligned tokens (TN pseudo-links + full TWL rows). */
type LinkQuotesInput = {
  id: string
  reference: string
  origWords?: string
  quoteTokens?: OptimizedToken[]
  occurrence?: string
}

interface UseAlignedTokensOptions<TLink extends LinkQuotesInput> {
  resourceKey: string // TWL resource key (e.g., "unfoldingWord/en/twl")
  resourceId: string // TWL viewer resource ID
  links: TLink[]
  /**
   * OL quote-build settled (`useQuoteTokens.quoteBuildReady`).
   * Default true only for callers that omit it; CombinedHelps TN/TWL and
   * standalone TN/TWL pipelines pass the live flag so in-flight quotes stay pending.
   */
  quoteBuildReady?: boolean
}

export function useAlignedTokens<TLink extends LinkQuotesInput>({
  resourceKey,
  resourceId,
  links,
  quoteBuildReady = true,
}: UseAlignedTokensOptions<TLink>) {
  const currentRef = useCurrentReference()

  const { tokens: targetTokens, reference: tokenReference, hasTokens, resourceMetadata } =
    useScriptureTokens({ resourceId })

  const linksWithAlignedTokens = useMemo((): Array<
    TLink & {
      alignedTokens: ReturnType<typeof resolveAlignedQuoteTokens>['alignedTokens'] | undefined
      semanticIds?: string[]
      quoteStatus: HelpsQuoteStatus
    }
  > => {
    const settledStatus = (link: TLink, hasAligned: boolean): HelpsQuoteStatus =>
      resolveHelpsQuoteStatus({
        hasAlignedTokens: hasAligned,
        alignmentPending: false,
        olQuote: link.origWords,
      })

    if (!links || links.length === 0) {
      return []
    }

    if (!hasTokens) {
      return links.map((link) => ({
        ...link,
        alignedTokens: undefined,
        quoteStatus: resolveHelpsQuoteStatus({
          hasAlignedTokens: false,
          alignmentPending: true,
          olQuote: link.origWords,
        }),
      }))
    }

    const bookCode = currentRef.book?.toLowerCase() || ''
    const currentChapter = currentRef.chapter || 1
    const refBookLower = tokenReference?.book?.toLowerCase() ?? ''
    const quoteLanguage = helpsLanguageFromResourceKey(resourceKey)
    // Prefer an OL language/key when either field says UHB/UGNT. A defaulted
    // `language` of `es`/`en` must not hide `unfoldingWord/hbo/uhb`.
    const textLanguage =
      [resourceMetadata?.language, resourceMetadata?.id].find((v) => isOriginalLanguageCode(v)) ||
      resourceMetadata?.language

    return links.map((link) => {
      const refParts = link.reference.split(':')
      const linkChapter = parseInt(refParts[0] || '1', 10)
      const linkVerse = parseInt(refParts[1] || '1', 10)

      if (linkChapter !== currentChapter) {
        return { ...link, alignedTokens: undefined, quoteStatus: settledStatus(link, false) }
      }

      const tokensMatchPassage = !!(
        tokenReference &&
        refBookLower === bookCode &&
        tokenReference.chapter === linkChapter
      )
      const alignmentPending = isHelpsQuoteAlignmentPending({
        hasTargetTokens: hasTokens,
        tokensMatchPassage,
        quoteBuildReady,
      })

      if (!tokensMatchPassage) {
        return {
          ...link,
          alignedTokens: undefined,
          quoteStatus: resolveHelpsQuoteStatus({
            hasAlignedTokens: false,
            alignmentPending,
            olQuote: link.origWords,
          }),
        }
      }

      const broadcastStartVerse = tokenReference.verse || 1
      const broadcastEndVerse = tokenReference.endVerse || broadcastStartVerse

      if (linkVerse < broadcastStartVerse || linkVerse > broadcastEndVerse) {
        return { ...link, alignedTokens: undefined, quoteStatus: settledStatus(link, false) }
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
        ...link,
        alignedTokens: hasAligned ? alignedTokens : undefined,
        semanticIds: semanticIds.length > 0 ? semanticIds : undefined,
        quoteStatus: resolveHelpsQuoteStatus({
          hasAlignedTokens: hasAligned,
          alignmentPending: hasAligned ? false : alignmentPending,
          olQuote: link.origWords,
        }),
      }
    })
  }, [
    links,
    targetTokens,
    tokenReference,
    hasTokens,
    currentRef.book,
    currentRef.chapter,
    resourceKey,
    resourceMetadata?.language,
    resourceMetadata?.id,
    quoteBuildReady,
  ])

  return {
    linksWithAlignedTokens,
    loading: false,
    loadingAligned: false,
    alignedError: null as string | null,
    error: null,
    hasTargetContent: hasTokens,
  }
}
