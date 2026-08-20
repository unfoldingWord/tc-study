/**
 * Word tokenization for OBS frame text and quote matching.
 *
 * Words are defined as Unicode letter/mark/number runs (with optional internal
 * hyphens and apostrophes), matching the visible word units in OBS prose.
 * All matching is case- and accent-insensitive via the same `stripForSearch`
 * normalization used in `highlightFrameText.ts`.
 */

import { stripForSearch } from './highlightFrameText'

export interface ObsWordToken {
  /** Original surface text of the token (preserves case/accents). */
  text: string
  /** Case- and accent-folded form used for matching. */
  normalized: string
  /** UTF-16 start index in the source frame text. */
  start: number
  /** UTF-16 end index (exclusive) in the source frame text. */
  end: number
  /** 0-based position among all tokens in the frame. */
  wordIndex: number
  /** 1-based occurrence of this normalized form among all tokens. */
  occurrence: number
  /** Total count of this normalized form in the frame. */
  totalOccurrences: number
}

/**
 * Regex matching a single word token: starts with a Unicode letter, may include
 * combining marks, digits, internal hyphens and straight/curly apostrophes.
 * Also matches standalone digit sequences (e.g. numbers in OBS text).
 */
const WORD_RE = /\p{L}[\p{L}\p{M}\p{N}'\u2019-]*|\p{N}+/gu

/**
 * Tokenize an OBS frame into word tokens, assigning occurrence counters.
 *
 * Two-pass:
 * 1. Collect all matches and their normalized forms.
 * 2. Assign per-form occurrence (1-based) and totalOccurrences.
 */
export function tokenizeObsFrameWords(text: string): ObsWordToken[] {
  if (!text) return []

  // Pass 1: collect raw matches
  const raw: Array<{ text: string; start: number; end: number; normalized: string }> = []
  WORD_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = WORD_RE.exec(text)) !== null) {
    raw.push({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      normalized: stripForSearch(m[0]),
    })
  }

  // Pass 2: count total occurrences per normalized form
  const totals = new Map<string, number>()
  for (const r of raw) {
    totals.set(r.normalized, (totals.get(r.normalized) ?? 0) + 1)
  }

  // Pass 3: assign occurrence (1-based) per form
  const counters = new Map<string, number>()
  const tokens: ObsWordToken[] = raw.map((r, idx) => {
    const occ = (counters.get(r.normalized) ?? 0) + 1
    counters.set(r.normalized, occ)
    return {
      text: r.text,
      normalized: r.normalized,
      start: r.start,
      end: r.end,
      wordIndex: idx,
      occurrence: occ,
      totalOccurrences: totals.get(r.normalized) ?? 1,
    }
  })

  return tokens
}

/** Separator between multi-part quote segments. */
const PART_SPLIT_RE = /\s*(?:&|…|\.{3})\s*/u

/**
 * Split a quote string on `&` and `…` / `...` delimiters.
 * Returns an array of non-empty part strings (stripped of leading/trailing space).
 */
export function splitQuoteIntoParts(quote: string): string[] {
  return quote
    .split(PART_SPLIT_RE)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Tokenize a single quote part into normalized word strings for matching.
 * Returns empty array if the part has no word tokens.
 */
export function tokenizeQuotePart(part: string): string[] {
  WORD_RE.lastIndex = 0
  const norms: string[] = []
  let m: RegExpExecArray | null
  while ((m = WORD_RE.exec(part)) !== null) {
    const n = stripForSearch(m[0])
    if (n) norms.push(n)
  }
  return norms
}
