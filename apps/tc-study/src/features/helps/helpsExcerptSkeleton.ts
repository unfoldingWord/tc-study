/**
 * CombinedHelps / TN / TWL card body: when the excerpt is still loading,
 * show MarkdownSkeleton instead of empty or finished-looking prose.
 *
 * - TWL: first-paragraph TW article fetch has no cache entry yet (Bible and OBS)
 * - TN: TSV note body is already on the row — never gate prose on quote status.
 *   Quote chips handle pending / OL / aligned on their own.
 * OBS TN uses the literal quote immediately — no body skeleton.
 */

import type { HelpsQuoteStatus } from './resolveHelpsQuoteStatus'

export function shouldShowHelpsExcerptSkeleton(opts: {
  kind: 'tn' | 'twl'
  obsMode?: boolean
  /** @deprecated TN no longer skeletons on quote pending; kept for call-site compat. */
  quoteStatus?: HelpsQuoteStatus
  /** TWL: preview string when cached and non-empty */
  twPreview?: string | null
  /** TWL: no cache entry yet (fetch not started or in flight) */
  twPreviewPending?: boolean
}): boolean {
  if (opts.kind === 'twl') {
    return !!opts.twPreviewPending && !opts.twPreview
  }
  // TN note markdown ships with the TSV row — do not hide it while quotes build.
  return false
}
