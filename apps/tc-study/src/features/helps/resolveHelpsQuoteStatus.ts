/**
 * CombinedHelps / TWL quote chip: pending vs aligned vs OL-only fallback.
 *
 * `alignedTokens: undefined` is used both while work is in flight and after a
 * finished miss — callers must pass an explicit pending flag so an in-progress
 * quote is not painted as a finished original-language fallback.
 */

export type HelpsQuoteStatus = 'pending' | 'aligned' | 'ol-fallback' | 'none'

export function isQuoteBuildReady(opts: {
  loadingOriginal: boolean
  /**
   * `null` = OL scripture not attempted yet (first paint).
   * `[]` = attempted but UGNT/UHB chapters are still empty — keep pending.
   * Only non-empty chapters mean quote-build can settle.
   */
  originalContent: readonly unknown[] | null
  originalError?: string | null
}): boolean {
  if (opts.loadingOriginal) return false
  return !!(opts.originalContent && opts.originalContent.length > 0)
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
