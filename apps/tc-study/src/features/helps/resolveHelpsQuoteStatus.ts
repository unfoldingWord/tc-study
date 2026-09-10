/**
 * CombinedHelps / TWL quote chip: pending vs aligned vs OL-only fallback.
 *
 * `alignedTokens: undefined` is used both while work is in flight and after a
 * finished miss — callers must pass an explicit pending flag so an in-progress
 * quote is not painted as a finished original-language fallback.
 */

export type HelpsQuoteStatus = 'pending' | 'aligned' | 'ol-fallback' | 'none'

/** True when OptimizedChapter shells actually carry word tokens for QuoteMatcher. */
export function originalChaptersHaveWordTokens(
  chapters: readonly { verses?: readonly { tokens?: readonly unknown[] | null }[] | null }[] | null
): boolean {
  if (!chapters?.length) return false
  for (const chapter of chapters) {
    for (const verse of chapter.verses ?? []) {
      if ((verse.tokens?.length ?? 0) > 0) return true
    }
  }
  return false
}

export function isQuoteBuildReady(opts: {
  loadingOriginal: boolean
  /**
   * `null` = OL scripture not attempted yet (first paint).
   * `[]` = attempted but UGNT/UHB chapters are still empty — keep pending.
   * Only chapters with word tokens mean quote-build can settle.
   */
  originalContent: readonly unknown[] | null
  originalError?: string | null
  /**
   * When provided, also require the quote-build pass for the current links to
   * have finished (async worker or sync). OL-loaded alone must not settle align
   * as a finished miss while quoteTokens are still empty in-flight.
   */
  quotesSettled?: boolean
}): boolean {
  if (opts.loadingOriginal) return false
  if (opts.quotesSettled === false) return false
  if (!opts.originalContent || opts.originalContent.length === 0) return false
  return originalChaptersHaveWordTokens(
    opts.originalContent as Parameters<typeof originalChaptersHaveWordTokens>[0]
  )
}

/**
 * UGNT/UHB load was attempted and produced no usable chapters (missing zip /
 * empty USFM). Notes should paint (ol-fallback) and lane 1 must drain so a
 * later download can retry — do not wait forever on quote-build.
 */
export function isOriginalLanguageQuoteBlocked(opts: {
  loadingOriginal: boolean
  originalContent: readonly unknown[] | null
  originalError?: string | null
}): boolean {
  if (opts.loadingOriginal) return false
  if (opts.originalError) return true
  if (opts.originalContent === null) return false
  return opts.originalContent.length === 0
}

/** True when scripture tokens / passage bind / OL quote-build are not settled. */
export function isHelpsQuoteAlignmentPending(opts: {
  hasTargetTokens: boolean
  tokensMatchPassage: boolean
  quoteBuildReady: boolean
}): boolean {
  return !opts.hasTargetTokens || !opts.tokensMatchPassage || !opts.quoteBuildReady
}

export function resolveHelpsQuoteStatus(opts: {
  hasAlignedTokens: boolean
  alignmentPending: boolean
  olQuote?: string | null
}): HelpsQuoteStatus {
  if (opts.hasAlignedTokens) return 'aligned'
  if (opts.alignmentPending) return 'pending'
  if (opts.olQuote?.trim()) return 'ol-fallback'
  return 'none'
}

/**
 * Notes with an empty Quote never enter quote-build/align. Without an explicit
 * status they used to fall back to perpetual `pending` and hide note prose.
 */
export function resolveHelpsQuoteStatusForNote(opts: {
  quoteStatus?: HelpsQuoteStatus
  hasAlignedTokens: boolean
  quote?: string | null
}): HelpsQuoteStatus {
  if (opts.quoteStatus) return opts.quoteStatus
  const hasQuote = Boolean(opts.quote?.trim())
  return resolveHelpsQuoteStatus({
    hasAlignedTokens: opts.hasAlignedTokens,
    // Only wait on alignment when there is a quote to align.
    alignmentPending: !opts.hasAlignedTokens && hasQuote,
    olQuote: opts.quote,
  })
}
