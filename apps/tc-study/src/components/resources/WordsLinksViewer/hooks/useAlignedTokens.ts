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
 *
 * Semantic ID Matching:
 * - Original token has: id = "TIT 1:1:Παῦλος:1"
 * - Target token has: alignedOriginalWordIds = ["TIT 1:1:Παῦλος:1"]
 * - When they match → target token is part of the aligned quote
 *
 * This same algorithm works for:
 * - Translation Words Links (TWL) - uses origWords field
 * - Translation Notes (TN) - uses quote field
 * - Any TSV resource with quote/origWords + occurrence + reference
 */

import { useMemo } from 'react'
import { useCurrentReference } from '../../../../contexts'
import { findAlignedTokens } from '../../../../features/helps/findAlignedTokens'
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
  resourceKey: _resourceKey,
  resourceId,
  links,
}: UseAlignedTokensOptions<TLink>) {
  const currentRef = useCurrentReference()

  // Listen for scripture token broadcasts (simple state listener!)
  const { tokens: targetTokens, reference: tokenReference, hasTokens } = useScriptureTokens({ resourceId })

  // Build aligned tokens for each link
  const linksWithAlignedTokens = useMemo((): Array<
    TLink & {
      alignedTokens: ReturnType<typeof findAlignedTokens> | undefined
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

    return links.map((link) => {
      if (!link.quoteTokens || link.quoteTokens.length === 0) {
        return { ...link, alignedTokens: undefined }
      }

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
      const originalSemanticIds = generateSemanticIdsForQuoteTokens(
        link.quoteTokens,
        bookCode,
        linkChapter,
        linkVerse,
        linkOccurrence
      )

      const alignedTokens = findAlignedTokens(
        targetTokens,
        originalSemanticIds,
        bookCode,
        linkChapter,
        linkVerse
      )

      return {
        ...link,
        alignedTokens: alignedTokens.length > 0 ? alignedTokens : undefined,
        semanticIds: originalSemanticIds,
      }
    })
  }, [links, targetTokens, tokenReference, hasTokens, currentRef.book, currentRef.chapter])

  return {
    linksWithAlignedTokens,
    loading: false,
    loadingAligned: false,
    alignedError: null as string | null,
    error: null,
    hasTargetContent: hasTokens,
  }
}
