/**
 * Quote → text-pane highlight strategy.
 *
 * 1. `\zaln` / own semanticId (UGNT/UHB in the text pane)
 * 2. Quote-text match only when helps language = text language, or the text
 *    pane itself is original language
 * 3. Otherwise no highlight (no TM aligner, no false positives)
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { findAlignedTokens, type AlignedToken } from './findAlignedTokens'
import { findTokensByQuoteText } from './findTokensByQuoteText'

export function helpsLanguageFromResourceKey(resourceKey: string): string {
  return resourceKey.split('/')[1]?.split('_')[0]?.toLowerCase() ?? ''
}

export function quoteLanguageMatchesText(
  quoteLang: string | undefined,
  textLang: string | undefined
): boolean {
  const q = (quoteLang || '').toLowerCase().split('_')[0] ?? ''
  const t = (textLang || '').toLowerCase().split('_')[0] ?? ''
  return q.length > 0 && q === t
}

export function isOriginalLanguageCode(language: string | undefined): boolean {
  const l = (language || '').toLowerCase()
  return l === 'el-x-koine' || l === 'hbo'
}

export function canFallbackToQuoteText(
  quoteLang: string | undefined,
  textLang: string | undefined
): boolean {
  return quoteLanguageMatchesText(quoteLang, textLang) || isOriginalLanguageCode(textLang)
}

export function resolveAlignedQuoteTokens(opts: {
  targetTokens: OptimizedToken[]
  originalSemanticIds: string[]
  quoteText?: string
  occurrence: number
  bookCode: string
  chapter: number
  verse: number
  quoteLanguage?: string
  textLanguage?: string
}): { alignedTokens: AlignedToken[]; semanticIds: string[] } {
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
      return { alignedTokens: viaIds, semanticIds: originalSemanticIds }
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
      }
    }
  }

  return { alignedTokens: [], semanticIds: originalSemanticIds }
}
