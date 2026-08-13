/**
 * Build display spans for OBS frame text with optional quote highlights.
 * Matching is case- and accent-insensitive; emitted slices use the original string.
 */

export type FrameSpan = {
  text: string
  /** Primary quote index — the shortest (most-specific) quote covering this span.
   *  Determines click behaviour. */
  quoteIndex?: number
  /** Indices of longer quotes whose range fully contains this span.
   *  A span renders as active if its own entry OR any parent entry is active,
   *  so clicking a TN card highlights the full phrase even when a shorter TWL
   *  quote bisects it. */
  parentQuoteIndices?: number[]
  /** Inclusive word-token indices when this span was built from {@link computeFrameWordSpans}. */
  startWord?: number
  endWord?: number
}

export type FrameQuoteSpec = {
  quote: string
  occurrence: number
}

export function stripForSearch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function codePointWidthAt(text: string, i: number): number {
  const cp = text.codePointAt(i)
  if (cp === undefined) return 1
  return cp > 0xffff ? 2 : 1
}

/**
 * Map each UTF-16 index in `text` to a normalized search string and position map.
 */
export function buildNormWithMap(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; ) {
    const w = codePointWidthAt(text, i)
    const ch = text.slice(i, i + w)
    const folded = stripForSearch(ch)
    for (let j = 0; j < folded.length; j++) {
      norm += folded[j]!
      map.push(i)
    }
    i += w
  }
  return { norm, map }
}

export function origEndForMatch(text: string, map: number[], normStart: number, normLen: number): number {
  const lastNormIdx = normStart + normLen - 1
  const lastOrigStart = map[lastNormIdx]!
  const w = codePointWidthAt(text, lastOrigStart)
  return lastOrigStart + w
}

/**
 * Non-overlapping occurrences of `quote` in `text` (search plane is normalized).
 */
export function findNonOverlappingMatches(
  text: string,
  norm: string,
  map: number[],
  quote: string
): Array<{ start: number; end: number }> {
  const nq = stripForSearch(quote.trim())
  if (!nq.length) return []
  const matches: Array<{ start: number; end: number }> = []
  let from = 0
  while (from <= norm.length - nq.length) {
    const idx = norm.indexOf(nq, from)
    if (idx === -1) break
    const origStart = map[idx]!
    const origEnd = origEndForMatch(text, map, idx, nq.length)
    matches.push({ start: origStart, end: origEnd })
    from = idx + Math.max(1, nq.length)
  }
  return matches
}

/**
 * First UTF-16 range for `quote` in `text` using the same normalized matching as {@link computeFrameSpans}.
 * `occurrence` is 1-based; `-1` selects the first match. Returns null if none.
 */
export function findQuoteCharRange(
  text: string,
  quote: string,
  occurrence: number
): { start: number; end: number } | null {
  if (!text || !quote?.trim()) return null
  const { norm, map } = buildNormWithMap(text)
  const matches = findNonOverlappingMatches(text, norm, map, quote)
  if (!matches.length) return null
  if (occurrence === -1) return matches[0] ?? null
  if (occurrence < 1 || occurrence > matches.length) return null
  return matches[occurrence - 1] ?? null
}

/**
 * Compute render spans: plain text interleaved with highlighted quote slices.
 *
 * Uses a painter's algorithm so that SHORTER quotes always win over longer
 * containing quotes. This means a phrase like "You are cursed!" is split into
 * ["You are "] + ["cursed"] + ["!"] when "cursed" is also a separate quote,
 * making each part independently clickable.
 *
 * Paint order: claims are painted longest-first (lower priority), then shorter
 * ones overwrite them (higher priority). Tie-break on equal length: lower
 * quoteIndex (earlier in the list) wins.
 *
 * occurrence: 1-based index into the non-overlapping matches of that quote, or
 * -1 to claim every non-overlapping occurrence.
 */
export function computeFrameSpans(text: string, quotes: FrameQuoteSpec[]): FrameSpan[] {
  if (!text) return []
  const { norm, map } = buildNormWithMap(text)

  interface Claim { start: number; end: number; quoteIndex: number; length: number; idx: number }
  const allClaims: Claim[] = []

  for (let qi = 0; qi < quotes.length; qi++) {
    const spec = quotes[qi]!
    const q = spec.quote
    if (!q?.trim()) continue

    const matches = findNonOverlappingMatches(text, norm, map, q)
    if (!matches.length) continue

    if (spec.occurrence === -1) {
      for (const m of matches) {
        allClaims.push({ start: m.start, end: m.end, quoteIndex: qi, length: m.end - m.start, idx: allClaims.length })
      }
    } else {
      const n = spec.occurrence
      if (n < 1 || n > matches.length) continue
      const m = matches[n - 1]!
      allClaims.push({ start: m.start, end: m.end, quoteIndex: qi, length: m.end - m.start, idx: allClaims.length })
    }
  }

  if (!allClaims.length) return [{ text }]

  // Paint coverage array: longer claims paint first; shorter ones overwrite them.
  // For equal length, higher quoteIndex paints first so lower quoteIndex wins.
  const sorted = [...allClaims].sort(
    (a, b) => (b.length - a.length) || (b.quoteIndex - a.quoteIndex)
  )
  const coverage = new Array<number>(text.length).fill(-1)
  for (const claim of sorted) {
    for (let i = claim.start; i < claim.end; i++) {
      coverage[i] = claim.idx
    }
  }

  // Build spans from runs of the same coverage value, and attach parent quotes.
  // A parent quote is any claim that fully contains this span but has a different
  // (longer) quote — needed so clicking a card highlights the whole phrase even
  // when a shorter quote bisects it.
  const spans: FrameSpan[] = []
  let i = 0
  while (i < text.length) {
    const ci = coverage[i]!
    let j = i + 1
    while (j < text.length && coverage[j] === ci) j++

    if (ci === -1) {
      spans.push({ text: text.slice(i, j) })
    } else {
      const primaryQuoteIndex = allClaims[ci]!.quoteIndex
      // Collect quote indices of claims that fully contain [i, j) but are not the primary
      const parentSet = new Set<number>()
      for (const claim of allClaims) {
        if (claim.quoteIndex !== primaryQuoteIndex && claim.start <= i && claim.end >= j) {
          parentSet.add(claim.quoteIndex)
        }
      }
      const span: FrameSpan = { text: text.slice(i, j), quoteIndex: primaryQuoteIndex }
      if (parentSet.size > 0) span.parentQuoteIndices = [...parentSet]
      spans.push(span)
    }
    i = j
  }

  return mergeAdjacentPlain(spans)
}

export function mergeAdjacentPlain(spans: FrameSpan[]): FrameSpan[] {
  const out: FrameSpan[] = []
  for (const s of spans) {
    const last = out[out.length - 1]
    if (last && last.quoteIndex === undefined && s.quoteIndex === undefined) {
      last.text += s.text
    } else {
      out.push({ ...s })
    }
  }
  return out
}
