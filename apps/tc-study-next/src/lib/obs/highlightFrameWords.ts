/**
 * Word-token–based highlight spans for OBS frame text.
 *
 * Mirrors the painter's algorithm from `highlightFrameText.ts` but operates
 * on the word-token plane produced by `tokenizeObsFrameWords`.
 *
 * Each `ObsFrameQuoteEntry` must have been enriched by `enrichObsFrameQuoteEntries`
 * so that `wordRanges` (and back-compat `startWord`/`endWord`) are present.
 */

import type { ObsFrameQuoteEntry } from '../../signals/studioSignals'
import type { FrameSpan } from './highlightFrameText'
import { mergeAdjacentPlain } from './highlightFrameText'
import { tokenizeObsFrameWords } from './obsWordTokens'

interface WordClaim {
  entryIndex: number
  startWord: number
  endWord: number
  /** Number of words covered (endWord - startWord + 1). Used for painter priority. */
  length: number
  /** Position in the flat allClaims array for coverage painting. */
  idx: number
}

/**
 * Compute render spans for OBS frame text using word-token–level highlighting.
 *
 * Painter's algorithm:
 * - Longer (less specific) claims are painted first.
 * - Shorter (more specific) claims overwrite them.
 * - Tie-break on equal length: lower `entryIndex` wins (same as `computeFrameSpans`).
 *
 * Emits `FrameSpan`s that include `startWord`/`endWord` so the click handler can
 * call `overlappingEntriesForWordRange`.
 */
export function computeFrameWordSpans(text: string, entries: ObsFrameQuoteEntry[]): FrameSpan[] {
  if (!text) return []
  const tokens = tokenizeObsFrameWords(text)
  if (!tokens.length) return [{ text }]

  // Build the flat claims list from all wordRanges in all entries.
  const allClaims: WordClaim[] = []

  for (let ei = 0; ei < entries.length; ei++) {
    const entry = entries[ei]!
    const ranges = entry.wordRanges
      ? entry.wordRanges
      : entry.startWord != null && entry.endWord != null
        ? [{ startWord: entry.startWord, endWord: entry.endWord }]
        : []

    for (const r of ranges) {
      allClaims.push({
        entryIndex: ei,
        startWord: r.startWord,
        endWord: r.endWord,
        length: r.endWord - r.startWord + 1,
        idx: allClaims.length,
      })
    }
  }

  if (!allClaims.length) return [{ text }]

  // Paint coverage per word token index.
  // Longer claims first (lower priority), shorter ones overwrite (higher priority).
  // Equal length: higher entryIndex paints first → lower entryIndex wins.
  const sorted = [...allClaims].sort(
    (a, b) => b.length - a.length || b.entryIndex - a.entryIndex
  )
  const coverage = new Array<number>(tokens.length).fill(-1)
  for (const claim of sorted) {
    for (let wi = claim.startWord; wi <= claim.endWord; wi++) {
      coverage[wi] = claim.idx
    }
  }

  // Walk source text character by character, emitting spans.
  // We track when we enter / exit token boundaries.
  const spans: FrameSpan[] = []
  let charIdx = 0

  let tokenIdx = 0
  while (tokenIdx < tokens.length || charIdx < text.length) {
    const token = tokens[tokenIdx]
    if (!token) {
      // Trailing non-token characters
      if (charIdx < text.length) {
        spans.push({ text: text.slice(charIdx) })
      }
      break
    }

    // Plain (non-token) characters before this token
    if (charIdx < token.start) {
      spans.push({ text: text.slice(charIdx, token.start) })
      charIdx = token.start
    }

    // Collect consecutive tokens that share the same primary claim
    const ci = coverage[tokenIdx]!
    let runEnd = tokenIdx
    while (
      runEnd + 1 < tokens.length &&
      coverage[runEnd + 1] === ci
    ) {
      runEnd++
    }

    const lastTokenInRun = tokens[runEnd]!
    const spanText = text.slice(token.start, lastTokenInRun.end)

    if (ci === -1) {
      // Uncovered tokens
      spans.push({ text: spanText })
    } else {
      const primaryEntryIndex = allClaims[ci]!.entryIndex
      const startWord = tokenIdx
      const endWord = runEnd

      // Collect parent quote indices: claims that fully contain [startWord, endWord]
      // but belong to a different entry
      const parentSet = new Set<number>()
      for (const claim of allClaims) {
        if (
          claim.entryIndex !== primaryEntryIndex &&
          claim.startWord <= startWord &&
          claim.endWord >= endWord
        ) {
          parentSet.add(claim.entryIndex)
        }
      }

      const span: FrameSpan = {
        text: spanText,
        quoteIndex: primaryEntryIndex,
        startWord,
        endWord,
      }
      if (parentSet.size > 0) span.parentQuoteIndices = [...parentSet]
      spans.push(span)
    }

    charIdx = lastTokenInRun.end
    tokenIdx = runEnd + 1
  }

  return mergeAdjacentPlain(spans)
}

/**
 * Return all entries whose word range(s) intersect `[startWord, endWord]`.
 *
 * Uses `wordRanges` when present, falls back to `startWord`/`endWord` on the entry.
 */
export function overlappingEntriesForWordRange(
  entries: ObsFrameQuoteEntry[],
  startWord: number,
  endWord: number
): ObsFrameQuoteEntry[] {
  return entries.filter((e) => {
    const ranges = e.wordRanges
      ? e.wordRanges
      : e.startWord != null && e.endWord != null
        ? [{ startWord: e.startWord, endWord: e.endWord }]
        : []
    return ranges.some((r) => r.startWord <= endWord && r.endWord >= startWord)
  })
}
