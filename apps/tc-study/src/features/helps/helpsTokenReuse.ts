/**
 * Cache-first reuse of CombinedHelps quote/align rows across chapter navigation.
 * Off-chapter clicks must not rebuild tokens that are already in memory.
 */

export type HelpsTokenCacheRow = {
  quoteTokens?: unknown
  alignedTokens?: unknown
  semanticIds?: unknown
  quoteStatus?: string
  quoteWarmPending?: boolean
}

export function hasUsableHelpsQuoteTokens(
  row?: { quoteTokens?: unknown } | null
): boolean {
  return Array.isArray(row?.quoteTokens) && row.quoteTokens.length > 0
}

export function hasUsableHelpsAlign(row?: HelpsTokenCacheRow | null): boolean {
  if (!row) return false
  if (Array.isArray(row.semanticIds) && row.semanticIds.length > 0) return true
  if (Array.isArray(row.alignedTokens) && row.alignedTokens.length > 0) return true
  return false
}

export function hasUsableHelpsTokens(row?: HelpsTokenCacheRow | null): boolean {
  return hasUsableHelpsAlign(row) || hasUsableHelpsQuoteTokens(row)
}

export function preparedRowsCoverChapterSpan(
  rows: ReadonlyArray<{ reference: string }> | null | undefined,
  startChapter: number,
  endChapter: number
): boolean {
  if (!rows?.length) return false
  return rows.some((row) => {
    const ch = parseInt(String(row.reference).split(':')[0], 10)
    return Number.isFinite(ch) && ch >= startChapter && ch <= endChapter
  })
}

export function mergeHelpsTokenCache(
  cache: Map<string, HelpsTokenCacheRow>,
  rows: Iterable<{ id: string } & HelpsTokenCacheRow>
): Map<string, HelpsTokenCacheRow> {
  for (const row of rows) {
    if (!hasUsableHelpsTokens(row)) continue
    const prev = cache.get(row.id)
    cache.set(row.id, {
      quoteTokens: hasUsableHelpsQuoteTokens(row) ? row.quoteTokens : prev?.quoteTokens,
      alignedTokens: Array.isArray(row.alignedTokens) && row.alignedTokens.length
        ? row.alignedTokens
        : prev?.alignedTokens,
      semanticIds: Array.isArray(row.semanticIds) && row.semanticIds.length
        ? row.semanticIds
        : prev?.semanticIds,
      quoteStatus:
        row.quoteStatus && row.quoteStatus !== 'pending'
          ? row.quoteStatus
          : prev?.quoteStatus === 'pending'
            ? undefined
            : prev?.quoteStatus,
      quoteWarmPending: row.quoteWarmPending ?? prev?.quoteWarmPending,
    })
  }
  return cache
}

export function attachHelpsTokenCache<T extends { id: string }>(
  rows: T[],
  cache: Map<string, HelpsTokenCacheRow>
): T[] {
  if (!rows.length || cache.size === 0) return rows
  let changed = false
  const next = rows.map((row) => {
    const hit = cache.get(row.id)
    if (!hit || hasUsableHelpsTokens(row as HelpsTokenCacheRow)) return row
    changed = true
    return { ...row, ...hit }
  })
  return changed ? next : rows
}

export function linkNeedsQuoteTokens(link: {
  quoteTokens?: unknown
  origWords?: string
}): boolean {
  if (hasUsableHelpsQuoteTokens(link)) return false
  return Boolean(link.origWords?.trim())
}

/** Chapter change is a no-op when every in-view link already has quote tokens. */
export function shouldSkipHelpsQuoteRebuild(args: {
  links: ReadonlyArray<{ id: string; quoteTokens?: unknown; origWords?: string }>
  lastById: Map<string, { quoteTokens?: unknown }>
}): boolean {
  if (args.links.length === 0) return false
  return args.links.every((link) => {
    if (!linkNeedsQuoteTokens(link)) return true
    return hasUsableHelpsQuoteTokens(args.lastById.get(link.id))
  })
}

/** Chapter change is a no-op when every quoted link already has align chips. */
export function shouldSkipHelpsAlignRebuild(args: {
  links: ReadonlyArray<{ id: string; origWords?: string } & HelpsTokenCacheRow>
  lastById: Map<string, HelpsTokenCacheRow>
}): boolean {
  if (args.links.length === 0) return false
  return args.links.every((link) => {
    if (!link.origWords?.trim()) return true
    if (hasUsableHelpsAlign(link)) return true
    return hasUsableHelpsAlign(args.lastById.get(link.id))
  })
}

export function reuseHelpsQuoteRows<T extends { id: string; quoteTokens?: unknown }>(
  links: T[],
  lastById: Map<string, HelpsTokenCacheRow>
): Array<T & { quoteReady: boolean }> {
  return links.map((link) => {
    if (hasUsableHelpsQuoteTokens(link)) {
      return { ...link, quoteReady: true }
    }
    const prev = lastById.get(link.id)
    if (hasUsableHelpsQuoteTokens(prev)) {
      return { ...link, quoteTokens: prev!.quoteTokens, quoteReady: true }
    }
    return { ...link, quoteReady: !linkNeedsQuoteTokens(link) }
  })
}

export function reuseHelpsAlignRows<T extends { id: string }>(
  links: T[],
  lastById: Map<string, HelpsTokenCacheRow>
): T[] {
  return links.map((link) => {
    if (hasUsableHelpsAlign(link as HelpsTokenCacheRow)) return link
    const prev = lastById.get(link.id)
    if (!prev || !hasUsableHelpsAlign(prev)) return link
    return { ...link, ...prev }
  })
}

/**
 * Contract for off-chapter navigation when dest notes are already painted.
 * Must not pending-spin or drop in-memory tokens.
 */
export function resolveHelpsChapterChangeWork(args: {
  hasBookPayload: boolean
  destNotesHaveTokens: boolean
  hadPreviousSpan: boolean
}): {
  clearPreparedRows: boolean
  preparePending: boolean
  skipPreparedFetch: boolean
  skipQuoteRebuild: boolean
  skipAlignRebuild: boolean
  quoteLoading: boolean
} {
  const skipPrepared = args.hasBookPayload && args.hadPreviousSpan
  return {
    clearPreparedRows: false,
    preparePending: !args.hasBookPayload && !args.hadPreviousSpan,
    skipPreparedFetch: skipPrepared,
    skipQuoteRebuild: args.destNotesHaveTokens,
    skipAlignRebuild: args.destNotesHaveTokens,
    quoteLoading: !args.destNotesHaveTokens,
  }
}
