/**
 * CombinedHelps well pending vs empty. Membership (the HELPS tab) can exist
 * before TN/TWL content starts — do not treat that as a settled empty list.
 */

export function isHelpsContentPending(options: {
  tnKey: string
  twlKey: string
  tnLoading: boolean
  twlLoading: boolean
  catalogLoading?: boolean
  /** Prepared TN/TWL rows are in flight and the list has nothing to paint. */
  preparePending?: boolean
  hasVisibleRows?: boolean
}): boolean {
  if (options.catalogLoading) return true
  if (options.preparePending && options.hasVisibleRows === false) return true
  const hasTn = Boolean(options.tnKey)
  const hasTwl = Boolean(options.twlKey)
  if (!hasTn && !hasTwl) return false
  return (hasTn && options.tnLoading) || (hasTwl && options.twlLoading)
}

/** Keep last quote/align rows when OL or incoming links drop for one frame. */
export function shouldKeepStaleHelpsRows(args: {
  staleCount: number
  incomingCount: number
  originalContentMissing?: boolean
}): boolean {
  if (args.staleCount <= 0) return false
  if (args.incomingCount === 0) return true
  return Boolean(args.originalContentMissing)
}

/**
 * Stale quote rows can paint scripture underlines (quoteTokens → semanticIds)
 * without waiting on OL reload or a fresh quote-build pass.
 */
export function staleQuotesAreUnderlineReady(
  rows: ReadonlyArray<{ quoteTokens?: readonly unknown[] | null }> | null | undefined
): boolean {
  if (!rows?.length) return false
  return rows.some((row) => (row.quoteTokens?.length ?? 0) > 0)
}
