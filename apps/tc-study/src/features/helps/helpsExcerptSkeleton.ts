/**
 * CombinedHelps / TN / TWL card body: when the excerpt is still loading,
 * show MarkdownSkeleton instead of empty or finished-looking prose.
 *
 * - TWL: first-paragraph TW article fetch has no cache entry yet (Bible and OBS)
 * - TN: Bible quote chip is still building (TSV note body would look finished)
 * OBS TN uses the literal quote immediately — no body skeleton.
 */

import type { HelpsQuoteStatus } from './resolveHelpsQuoteStatus'

export function shouldShowHelpsExcerptSkeleton(opts: {
  kind: 'tn' | 'twl'
  obsMode?: boolean
  quoteStatus?: HelpsQuoteStatus
  /** TWL: preview string when cached and non-empty */
  twPreview?: string | null
  /** TWL: no cache entry yet (fetch not started or in flight) */
  twPreviewPending?: boolean
}): boolean {
  if (opts.kind === 'twl') {
    return !!opts.twPreviewPending && !opts.twPreview
  }
  if (opts.obsMode) return false
  return opts.quoteStatus === 'pending'
}
