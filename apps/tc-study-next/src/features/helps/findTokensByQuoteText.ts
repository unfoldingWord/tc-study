/**
 * Conservative quote → text-pane token match (no translation memory).
 * Requires a full word-sequence hit; never matches inside a token.
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { alignedTokensFromPositions, type AlignedToken } from './findAlignedTokens'

const WORD_RE = /\p{L}[\p{L}\p{M}\p{N}'\u2019-]*|\p{N}+/gu
const PART_SPLIT_RE = /\s*(?:&|…|\.{3})\s*/u

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function quotePartWords(quote: string): string[][] {
  return quote
    .split(PART_SPLIT_RE)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((part) => {
      const words: string[] = []
      WORD_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WORD_RE.exec(part)) !== null) {
        const n = fold(m[0])
        if (n) words.push(n)
      }
      return words
    })
}

function findSequenceMatches(haystack: string[], needle: string[]): number[] {
  if (!needle.length || haystack.length < needle.length) return []
  const starts: number[] = []
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true
    for (let k = 0; k < needle.length; k++) {
      if (haystack[i + k] !== needle[k]) {
        ok = false
        break
      }
    }
    if (ok) starts.push(i)
  }
  return starts
}

/**
 * Match `quote` against consecutive word tokens (occurrence is 1-based).
 * Returns [] when the quote is missing, occurrence is out of range, or a
 * multi-part segment cannot be chained — never a partial/false highlight.
 */
export function findTokensByQuoteText(
  targetTokens: OptimizedToken[],
  quote: string,
  occurrence: number,
  bookCode: string,
  chapter: number,
  verse: number
): AlignedToken[] {
  if (!quote?.trim() || occurrence < 1) return []
  const parts = quotePartWords(quote)
  if (!parts.length || parts.some((p) => p.length === 0)) return []

  const wordPositions: number[] = []
  const wordNorms: string[] = []
  targetTokens.forEach((token, index) => {
    if (token.type !== 'word') return
    wordPositions.push(index)
    wordNorms.push(fold(token.text))
  })
  if (!wordNorms.length) return []

  const matchedWordIdx: number[] = []
  let after = -1

  for (let pi = 0; pi < parts.length; pi++) {
    const needle = parts[pi]!
    const starts = findSequenceMatches(wordNorms, needle).filter((s) => s > after)
    if (!starts.length) return []
    const chosen = pi === 0 ? starts[occurrence - 1] : starts[0]
    if (chosen == null) return []
    for (let k = 0; k < needle.length; k++) matchedWordIdx.push(chosen + k)
    after = chosen + needle.length - 1
  }

  const matchedPositions = matchedWordIdx.map((wi) => wordPositions[wi]!).filter((p) => p != null)
  return alignedTokensFromPositions(targetTokens, matchedPositions, bookCode, chapter, verse)
}
