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
}

export function useAlignedTokens<TLink extends LinkQuotesInput>({
  resourceKey,
  resourceId,
  links,
}: UseAlignedTokensOptions<TLink>) {
  const currentRef = useCurrentReference()

  const { tokens: targetTokens, reference: tokenReference, hasTokens, resourceMetadata } =
    useScriptureTokens({ resourceId })

  const linksWithAlignedTokens = useMemo((): Array<
    TLink & {
      alignedTokens: ReturnType<typeof resolveAlignedQuoteTokens>['alignedTokens'] | undefined
      semanticIds?: string[]
    }
  > => {
    if (!hasTokens || !links || links.length === 0) {
      return links.map((link) => ({ ...link, alignedTokens: undefined })) as Array<
        TLink & { alignedTokens: undefined }
      >
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
        return { ...link, alignedTokens: undefined }
      }

      if (
        !tokenReference ||
        refBookLower !== bookCode ||
        tokenReference.chapter !== linkChapter
      ) {
        return { ...link, alignedTokens: undefined }
      }

      const broadcastStartVerse = tokenReference.verse || 1
      const broadcastEndVerse = tokenReference.endVerse || broadcastStartVerse

      if (linkVerse < broadcastStartVerse || linkVerse > broadcastEndVerse) {
        return { ...link, alignedTokens: undefined }
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

      return {
        ...link,
        alignedTokens: alignedTokens.length > 0 ? alignedTokens : undefined,
        semanticIds: semanticIds.length > 0 ? semanticIds : undefined,
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
