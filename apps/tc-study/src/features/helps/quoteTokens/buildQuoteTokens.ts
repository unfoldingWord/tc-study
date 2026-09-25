/**
 * buildQuoteTokens Utility - Core Quote Matching Logic
 *
 * Matches origWords/quote from TSV resources to original language tokens.
 * Uses QuoteMatcher which implements the complete algorithm from bt-studio.
 *
 * See packages/resource-parsers/src/utils/quote-matcher.ts for implementation.
 * See apps/tc-study/TWL_ALIGNMENT_SYSTEM.md for documentation.
 *
 * Multi-verse TN quotes (`5:1,3,8,12` + `A & B & C & D`) are an occurrence
 * walk on a merged verse stream — not a 1:1 part→verse map. Each `&` part
 * is the next hit left-to-right across the joined listed verses. Partial
 * hits are kept so chips are not locked on OL.
 */

import type { OptimizedChapter, OptimizedToken, OptimizedVerse, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { QuoteMatcher } from '@bt-synergy/resource-parsers'
import {
  parseHelpsReference,
  splitHelpsQuote,
  type HelpsVerseRef,
} from './parseHelpsReference'

export type QuoteTokenWithRef = OptimizedToken & {
  chapter?: number
  verse?: number
}

/** Original verse-wide occurrence, preserved across QuoteMatcher overwrite. */
type MergedStreamToken = QuoteTokenWithRef & { verseOccurrence: number }

interface BuildQuoteTokensOptions {
  link: TranslationWordsLink
  originalChapters: OptimizedChapter[]
  bookCode: string
}

const quoteMatcher = new QuoteMatcher()

function findListedVerse(
  chapters: OptimizedChapter[],
  ref: HelpsVerseRef
): OptimizedVerse | undefined {
  const chapter = chapters.find((c) => c.number === ref.chapter)
  return chapter?.verses.find((v) => v.number === ref.verse)
}

function stampVerseTokens(
  tokens: OptimizedToken[],
  chapter: number,
  verse: number
): MergedStreamToken[] {
  const counts = new Map<string, number>()
  return tokens.map((token) => {
    let occurrence = token.occurrence
    if (token.type === 'word') {
      const key = token.text.toLowerCase()
      const computed = (counts.get(key) ?? 0) + 1
      counts.set(key, computed)
      if (occurrence == null || occurrence < 1) occurrence = computed
    }
    return {
      ...token,
      occurrence: occurrence ?? 1,
      verseOccurrence: occurrence ?? 1,
      chapter,
      verse,
    }
  })
}

/** Join listed verses’ OL tokens in order into one virtual stream. */
function mergeListedVerseTokens(
  chapters: OptimizedChapter[],
  verses: HelpsVerseRef[]
): MergedStreamToken[] {
  const merged: MergedStreamToken[] = []
  for (const ref of verses) {
    const verse = findListedVerse(chapters, ref)
    if (!verse?.tokens?.length) continue
    merged.push(...stampVerseTokens(verse.tokens, ref.chapter, ref.verse))
  }
  return merged
}

function virtualChapterFor(tokens: OptimizedToken[], chapter: number): OptimizedChapter {
  return {
    number: chapter,
    verseCount: 1,
    paragraphCount: 1,
    verses: [
      {
        number: 1,
        text: tokens
          .filter((t) => t.type === 'word')
          .map((t) => t.text)
          .join(' '),
        tokens,
      },
    ],
  }
}

function tokenIdentity(token: {
  id?: number
  chapter?: number
  verse?: number
  text?: string
}): string {
  return `${token.chapter ?? ''}:${token.verse ?? ''}:${token.id ?? ''}:${token.text ?? ''}`
}

function restoreStampedToken(matched: OptimizedToken): QuoteTokenWithRef {
  const stamped = matched as MergedStreamToken
  return {
    ...matched,
    occurrence: stamped.verseOccurrence ?? matched.occurrence ?? 1,
    chapter: stamped.chapter,
    verse: stamped.verse,
  }
}

function lastMatchedIndex(
  remaining: MergedStreamToken[],
  matched: OptimizedToken[]
): number {
  const wanted = new Set(matched.map(tokenIdentity))
  let max = -1
  for (let i = 0; i < remaining.length; i++) {
    if (wanted.has(tokenIdentity(remaining[i]!))) max = i
  }
  return max
}

/**
 * Build quoteTokens for a TWL/TN link by matching origWords to original language tokens
 */
export function buildQuoteTokens({
  link,
  originalChapters,
  bookCode,
}: BuildQuoteTokensOptions): OptimizedToken[] {
  try {
    const occurrence = parseInt(link.occurrence || '1', 10) || 1
    if (originalChapters.length === 0) {
      return []
    }

    const parsed = parseHelpsReference(link.reference)
    const listedVerses =
      parsed.verses.length > 0
        ? parsed.verses
        : parsed.isIntro
          ? []
          : [{ chapter: parsed.chapter, verse: 1 }]
    const merged = mergeListedVerseTokens(originalChapters, listedVerses)
    if (merged.length === 0) {
      return []
    }

    const parts = splitHelpsQuote(link.origWords || '')
    if (parts.length === 0) {
      return []
    }

    const tokens: QuoteTokenWithRef[] = []
    let cursor = 0
    for (let i = 0; i < parts.length; i++) {
      const remaining = merged.slice(cursor)
      if (remaining.length === 0) break

      const matchResult = quoteMatcher.findOriginalTokens(
        [virtualChapterFor(remaining, parsed.chapter)],
        parts[i]!,
        i === 0 ? occurrence : 1,
        {
          book: bookCode,
          startChapter: parsed.chapter,
          startVerse: 1,
          endChapter: parsed.chapter,
          endVerse: 1,
        }
      )
      if (!matchResult.success || matchResult.totalTokens.length === 0) {
        continue
      }

      tokens.push(...matchResult.totalTokens.map(restoreStampedToken))
      const advanced = lastMatchedIndex(remaining, matchResult.totalTokens)
      if (advanced >= 0) cursor += advanced + 1
    }

    return tokens
  } catch (error) {
    console.error(`❌ [buildQuoteTokens] Error building quote tokens:`, error)
    return []
  }
}
