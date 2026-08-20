/**
 * Enrich `ObsFrameQuoteEntry` objects with word-level range information.
 *
 * After enrichment each entry carries `wordRanges` (one range per `&`/`…` part)
 * and the backward-compat `startWord`/`endWord` mirroring `wordRanges[0]`.
 * Entries that cannot be matched (no tokens, unresolvable occurrence) are
 * returned unchanged so the caller can fall back to substring highlighting.
 */

import type { ObsFrameQuoteEntry } from '../../signals/studioSignals'
import { splitQuoteIntoParts, tokenizeObsFrameWords, tokenizeQuotePart } from './obsWordTokens'
import type { ObsWordToken } from './obsWordTokens'

/**
 * Find all non-overlapping left-to-right runs in `tokens` whose normalized
 * sequence matches `partNorms` (array of normalized words).
 *
 * Returns an array of `{ startWord, endWord }` ranges (inclusive word indices).
 */
function findPartMatches(
  tokens: ObsWordToken[],
  partNorms: string[]
): Array<{ startWord: number; endWord: number }> {
  if (!partNorms.length || !tokens.length) return []
  const len = partNorms.length
  const matches: Array<{ startWord: number; endWord: number }> = []
  let from = 0
  while (from <= tokens.length - len) {
    let matched = true
    for (let k = 0; k < len; k++) {
      if (tokens[from + k]!.normalized !== partNorms[k]) {
        matched = false
        break
      }
    }
    if (matched) {
      matches.push({ startWord: from, endWord: from + len - 1 })
      from += len
    } else {
      from++
    }
  }
  return matches
}

/**
 * Enrich each entry in `entries` with `wordRanges` (and back-compat
 * `startWord`/`endWord`) by tokenizing the frame text once.
 *
 * Rules:
 * - Quote is split into parts on `&` / `…` / `...`.
 * - Any part that produces zero word tokens causes the whole entry to be
 *   returned unchanged (no word ranges → caller uses substring fallback).
 * - `occurrence === -1`: collect ALL non-overlapping matches for every part
 *   and build one `wordRanges` entry per match (parts are independent).
 * - `occurrence > 0` (N-th match): resolve the N-th match for the first part;
 *   for each subsequent part, pick the next non-overlapping match whose
 *   `startWord` is strictly after the previous part's `endWord`.
 *   If any part cannot be resolved the entry is returned unchanged.
 */
export function enrichObsFrameQuoteEntries(
  frameText: string,
  entries: ObsFrameQuoteEntry[]
): ObsFrameQuoteEntry[] {
  if (!frameText || !entries.length) return entries

  const tokens = tokenizeObsFrameWords(frameText)
  if (!tokens.length) return entries

  return entries.map((entry) => {
    if (!entry.quote?.trim()) return entry

    const parts = splitQuoteIntoParts(entry.quote)
    if (!parts.length) return entry

    // Tokenize each part; bail if any yields no word tokens
    const partNormsList = parts.map(tokenizeQuotePart)
    if (partNormsList.some((p) => p.length === 0)) return entry

    if (entry.occurrence === -1) {
      // Collect all matches for ALL parts independently
      const wordRanges: Array<{ startWord: number; endWord: number }> = []
      for (const partNorms of partNormsList) {
        const matches = findPartMatches(tokens, partNorms)
        for (const m of matches) wordRanges.push(m)
      }
      if (!wordRanges.length) return entry
      // Sort by startWord for determinism
      wordRanges.sort((a, b) => a.startWord - b.startWord)
      return {
        ...entry,
        wordRanges,
        startWord: wordRanges[0]!.startWord,
        endWord: wordRanges[0]!.endWord,
      }
    }

    // Occurrence-based: resolve N-th match for first part, then chain subsequent parts
    const occ = entry.occurrence
    if (occ < 1) return entry

    const wordRanges: Array<{ startWord: number; endWord: number }> = []
    let afterEnd = -1

    for (let pi = 0; pi < partNormsList.length; pi++) {
      const partNorms = partNormsList[pi]!
      const allMatches = findPartMatches(tokens, partNorms)

      if (!allMatches.length) return entry // part not found → fall back

      if (pi === 0) {
        // Pick the N-th match
        if (occ > allMatches.length) return entry
        const chosen = allMatches[occ - 1]!
        wordRanges.push(chosen)
        afterEnd = chosen.endWord
      } else {
        // Pick the first match whose startWord > afterEnd
        const next = allMatches.find((m) => m.startWord > afterEnd)
        if (!next) return entry
        wordRanges.push(next)
        afterEnd = next.endWord
      }
    }

    if (!wordRanges.length) return entry

    return {
      ...entry,
      wordRanges,
      startWord: wordRanges[0]!.startWord,
      endWord: wordRanges[0]!.endWord,
    }
  })
}
