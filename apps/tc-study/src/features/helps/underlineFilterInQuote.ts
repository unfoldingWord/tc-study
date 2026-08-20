/**
 * Mark the active token-filter word inside CombinedHelps quote chip text.
 * Pure string split — cards render the underlined segments.
 */

export interface QuoteFilterSegment {
  text: string
  underline: boolean
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Split `quote` so occurrences of `filterText` can be underlined.
 * Case-insensitive, whole-word-ish: "prophet" does not mark "prophetic".
 * Punctuation and ellipsis (`…` / `...`) are boundaries, not part of the word.
 */
export function underlineFilterInQuote(
  quote: string,
  filterText: string | null | undefined
): QuoteFilterSegment[] {
  if (!quote) return []
  const needle = filterText?.trim() ?? ''
  if (!needle) return [{ text: quote, underline: false }]

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}])${escapeRegExp(needle)}(?![\\p{L}\\p{M}\\p{N}])`,
    'giu'
  )

  const segments: QuoteFilterSegment[] = []
  let lastIndex = 0
  for (const match of quote.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > lastIndex) {
      segments.push({ text: quote.slice(lastIndex, start), underline: false })
    }
    segments.push({ text: match[0], underline: true })
    lastIndex = start + match[0].length
  }
  if (lastIndex < quote.length) {
    segments.push({ text: quote.slice(lastIndex), underline: false })
  }
  return segments.length > 0 ? segments : [{ text: quote, underline: false }]
}
