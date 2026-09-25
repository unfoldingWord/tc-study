/**
 * Compact / reconstruct helps-align cache rows.
 *
 * Persist only word positions (+ match method). Gaps and punctuation are
 * rebuilt via alignedTokensFromPositions against the canonical full-chapter
 * target token array.
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import {
  alignedTokensFromPositions,
  findAlignedTokens,
  type AlignedToken,
} from './findAlignedTokens'
import type { AlignMatchMethod, CachedAlignRow } from './helpsAlignCache'
import { generateSemanticIdsForQuoteTokens } from './quoteTokens'
import {
  canFallbackToQuoteText,
} from './resolveAlignedQuoteTokens'
import { findTokensByQuoteText } from './findTokensByQuoteText'
import {
  resolveHelpsQuoteStatus,
  type HelpsQuoteStatus,
} from './resolveHelpsQuoteStatus'

export function compactAlignRow(args: {
  alignedTokens: AlignedToken[] | undefined
  method: AlignMatchMethod
}): CachedAlignRow {
  const { alignedTokens, method } = args
  if (!alignedTokens?.length || method === 0) {
    return { p: [], m: 0 }
  }
  const words = alignedTokens.filter((t) => t.type === 'word' || t.type == null)
  const positions = words
    .map((t) => t.position)
    .filter((p) => Number.isFinite(p))
  const texts = words.map((t) => t.content).filter((c) => typeof c === 'string' && c.length > 0)
  const row: CachedAlignRow = { p: positions, m: method }
  if (texts.length > 0) row.t = texts
  return row
}

/**
 * Resolve align + method without changing AlignLinkResult.
 * Branch order matches resolveAlignedQuoteTokens.
 */
export function resolveAlignedQuoteTokensWithMethod(opts: {
  targetTokens: OptimizedToken[]
  originalSemanticIds: string[]
  quoteText?: string
  occurrence: number
  bookCode: string
  chapter: number
  verse: number
  quoteLanguage?: string
  textLanguage?: string
}): {
  alignedTokens: AlignedToken[]
  semanticIds: string[]
  method: AlignMatchMethod
} {
  const {
    targetTokens,
    originalSemanticIds,
    quoteText,
    occurrence,
    bookCode,
    chapter,
    verse,
    quoteLanguage,
    textLanguage,
  } = opts

  if (originalSemanticIds.length > 0) {
    const viaIds = findAlignedTokens(
      targetTokens,
      originalSemanticIds,
      bookCode,
      chapter,
      verse
    )
    if (viaIds.length > 0) {
      return {
        alignedTokens: viaIds,
        semanticIds: originalSemanticIds,
        method: 1,
      }
    }
  }

  if (quoteText?.trim() && canFallbackToQuoteText(quoteLanguage, textLanguage)) {
    const viaText = findTokensByQuoteText(
      targetTokens,
      quoteText,
      occurrence,
      bookCode,
      chapter,
      verse
    )
    if (viaText.length > 0) {
      return {
        alignedTokens: viaText,
        semanticIds: viaText.filter((t) => t.type === 'word').map((t) => t.semanticId),
        method: 2,
      }
    }
  }

  return { alignedTokens: [], semanticIds: originalSemanticIds, method: 0 }
}

/** Infer method from a live AlignLinkResult + its quote tokens. */
export function inferAlignMatchMethod(args: {
  alignedTokens: AlignedToken[] | undefined
  quoteTokens: OptimizedToken[] | undefined
  bookCode: string
  chapter: number
  verse: number
  occurrence?: string
}): AlignMatchMethod {
  if (!args.alignedTokens?.length) return 0
  const occurrence = parseInt(String(args.occurrence ?? '1'), 10)
  const originalSemanticIds = args.quoteTokens?.length
    ? generateSemanticIdsForQuoteTokens(
        args.quoteTokens,
        args.bookCode,
        args.chapter,
        args.verse,
        occurrence
      )
    : []
  if (originalSemanticIds.length === 0) return 2
  // Prefer semantic-id when quote tokens produced ids (common zaln path).
  return 1
}

export function reconstructAlignFromPositions(args: {
  targetTokens: OptimizedToken[]
  quoteTokens: OptimizedToken[] | undefined
  origWords: string | undefined
  occurrence: string | undefined
  bookCode: string
  chapter: number
  verse: number
  row: CachedAlignRow
}): {
  alignedTokens: AlignedToken[] | undefined
  semanticIds: string[] | undefined
  quoteStatus: HelpsQuoteStatus
} {
  const {
    targetTokens,
    quoteTokens,
    origWords,
    occurrence,
    bookCode,
    chapter,
    verse,
    row,
  } = args
  const occ = parseInt(String(occurrence ?? '1'), 10)
  const originalSemanticIds = quoteTokens?.length
    ? generateSemanticIdsForQuoteTokens(quoteTokens, bookCode, chapter, verse, occ)
    : []

  if (row.m === 0 || (row.p.length === 0 && !(row.t && row.t.length > 0))) {
    return {
      alignedTokens: undefined,
      semanticIds: originalSemanticIds.length > 0 ? originalSemanticIds : undefined,
      quoteStatus: resolveHelpsQuoteStatus({
        hasAlignedTokens: false,
        alignmentPending: false,
        olQuote: origWords,
      }),
    }
  }

  // Prefer position→token reconstruct when prepared/broadcast tokens exist.
  if (targetTokens.length > 0 && row.p.length > 0) {
    const alignedTokens = alignedTokensFromPositions(
      targetTokens,
      row.p,
      bookCode,
      chapter,
      verse
    )
    if (alignedTokens.length) {
      let semanticIds: string[] | undefined
      if (row.m === 1) {
        semanticIds = originalSemanticIds.length > 0 ? originalSemanticIds : undefined
      } else {
        semanticIds = alignedTokens
          .filter((t) => t.type === 'word' || t.type == null)
          .map((t) => t.semanticId)
      }

      return {
        alignedTokens,
        semanticIds,
        quoteStatus: resolveHelpsQuoteStatus({
          hasAlignedTokens: true,
          alignmentPending: false,
          olQuote: origWords,
        }),
      }
    }
  }

  // Refresh / early hydrate: paint ULT chip text from stored display words
  // without waiting for SCRIPTURE_TOKENS or prepared:full.
  if (row.t && row.t.length > 0) {
    const verseRef = `${bookCode.toLowerCase()} ${chapter}:${verse}`
    const alignedTokens: AlignedToken[] = row.t.map((content, i) => ({
      content,
      semanticId: originalSemanticIds[i] ?? '',
      verseRef,
      position: row.p[i] ?? i,
      type: 'word' as const,
    }))
    return {
      alignedTokens,
      semanticIds: originalSemanticIds.length > 0 ? originalSemanticIds : undefined,
      quoteStatus: resolveHelpsQuoteStatus({
        hasAlignedTokens: true,
        alignmentPending: false,
        olQuote: origWords,
      }),
    }
  }

  return {
    alignedTokens: undefined,
    semanticIds: originalSemanticIds.length > 0 ? originalSemanticIds : undefined,
    quoteStatus: resolveHelpsQuoteStatus({
      hasAlignedTokens: false,
      alignmentPending: false,
      olQuote: origWords,
    }),
  }
}

/**
 * Compact a live align result for cache write.
 */
export function compactFromAlignResult(args: {
  alignedTokens: AlignedToken[] | undefined
  quoteTokens: OptimizedToken[] | undefined
  bookCode: string
  chapter: number
  verse: number
  occurrence?: string
  method?: AlignMatchMethod
}): CachedAlignRow {
  const method =
    args.method ??
    inferAlignMatchMethod({
      alignedTokens: args.alignedTokens,
      quoteTokens: args.quoteTokens,
      bookCode: args.bookCode,
      chapter: args.chapter,
      verse: args.verse,
      occurrence: args.occurrence,
    })
  return compactAlignRow({ alignedTokens: args.alignedTokens, method })
}
