/**
 * Debug logging when a helps quote cannot be fully built (ULT chips / quote tokens).
 *
 * Settled misses always warn once per key. In-flight / gated reasons only log when
 * `localStorage.helpsQuoteDebug = '1'` (or `window.__HELPS_QUOTE_DEBUG__ = true`).
 */

export type HelpsQuoteMissReason =
  | 'no_target_tokens'
  | 'quote_build_not_ready'
  | 'link_quote_not_ready'
  | 'outside_passage_chapter'
  | 'tokens_book_or_chapter_mismatch'
  | 'outside_token_verse_span'
  | 'no_orig_words'
  | 'align_matcher_empty'
  | 'ol_content_blocked'
  | 'ol_content_missing'
  | 'quote_tokens_empty'
  | 'align_cache_settled_miss'
  | 'warm_lane_blocked'
  | 'missing_cache_context'

export type HelpsQuoteMissStage =
  | 'quote-tokens'
  | 'align'
  | 'book-filter-enrichment'
  | 'ol-load'
  | 'warm-admit'

export type HelpsQuoteMissEvent = {
  stage: HelpsQuoteMissStage
  reason: HelpsQuoteMissReason
  linkId: string
  reference?: string
  resourceKey?: string
  bookId?: string
  chapter?: number
  detail?: Record<string, unknown>
}

/** Reasons that mean work is still in flight / gated — verbose-only. */
const VERBOSE_ONLY: ReadonlySet<HelpsQuoteMissReason> = new Set([
  'no_target_tokens',
  'quote_build_not_ready',
  'link_quote_not_ready',
  'warm_lane_blocked',
])

const loggedKeys = new Set<string>()

export function resetHelpsQuoteBuildDebugLog(): void {
  loggedKeys.clear()
}

export function isHelpsQuoteDebugVerbose(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const w = window as Window & { __HELPS_QUOTE_DEBUG__?: boolean }
      if (w.__HELPS_QUOTE_DEBUG__ === true) return true
      if (typeof localStorage !== 'undefined' && localStorage.getItem('helpsQuoteDebug') === '1') {
        return true
      }
    }
  } catch {
    /* ignore */
  }
  return false
}

export function helpsQuoteMissLogKey(event: HelpsQuoteMissEvent): string {
  return [
    event.stage,
    event.reason,
    event.resourceKey ?? '',
    event.bookId ?? '',
    event.chapter ?? '',
    event.linkId,
    event.reference ?? '',
  ].join('|')
}

/**
 * Diagnose why batch-align settled without ULT chips for one link.
 * Mirrors gates in batchAlignLinks (keep in sync).
 */
export function diagnoseHelpsAlignMiss(args: {
  hasOrigWords: boolean
  hasAlignedTokens: boolean
  hasTargetTokens: boolean
  quoteBuildReady: boolean
  linkQuoteReady?: boolean
  bookCode: string
  tokenBook: string
  linkChapter: number
  linkVerse: number
  passageStartChapter: number
  passageEndChapter: number
  tokenChapter: number
  tokenEndChapter: number
  tokenStartVerse: number
  tokenEndVerse: number
  quoteTokenCount: number
}): { reason: HelpsQuoteMissReason; detail: Record<string, unknown> } | null {
  if (args.hasAlignedTokens) return null
  if (!args.hasOrigWords) {
    return { reason: 'no_orig_words', detail: {} }
  }
  if (!args.hasTargetTokens) {
    return { reason: 'no_target_tokens', detail: { hasTargetTokens: false } }
  }
  if (args.linkQuoteReady === false) {
    return { reason: 'link_quote_not_ready', detail: { linkQuoteReady: false } }
  }
  if (!args.quoteBuildReady) {
    return {
      reason: 'quote_build_not_ready',
      detail: { quoteBuildReady: false, quoteTokenCount: args.quoteTokenCount },
    }
  }
  if (
    args.linkChapter < args.passageStartChapter ||
    args.linkChapter > args.passageEndChapter
  ) {
    return {
      reason: 'outside_passage_chapter',
      detail: {
        linkChapter: args.linkChapter,
        passageStartChapter: args.passageStartChapter,
        passageEndChapter: args.passageEndChapter,
      },
    }
  }
  const bookOk = args.tokenBook.toLowerCase() === args.bookCode.toLowerCase()
  const chapterOk =
    args.linkChapter >= args.tokenChapter && args.linkChapter <= args.tokenEndChapter
  if (!bookOk || !chapterOk) {
    return {
      reason: 'tokens_book_or_chapter_mismatch',
      detail: {
        bookCode: args.bookCode,
        tokenBook: args.tokenBook,
        linkChapter: args.linkChapter,
        tokenChapter: args.tokenChapter,
        tokenEndChapter: args.tokenEndChapter,
      },
    }
  }
  const verseStart = args.linkChapter === args.tokenChapter ? args.tokenStartVerse : 1
  const verseEnd = args.linkChapter === args.tokenEndChapter ? args.tokenEndVerse : 999
  if (args.linkVerse < verseStart || args.linkVerse > verseEnd) {
    return {
      reason: 'outside_token_verse_span',
      detail: {
        linkVerse: args.linkVerse,
        verseStart,
        verseEnd,
        tokenChapter: args.tokenChapter,
        tokenEndChapter: args.tokenEndChapter,
      },
    }
  }
  if (args.quoteTokenCount <= 0) {
    return {
      reason: 'quote_tokens_empty',
      detail: { quoteTokenCount: 0 },
    }
  }
  return {
    reason: 'align_matcher_empty',
    detail: {
      quoteTokenCount: args.quoteTokenCount,
      linkChapter: args.linkChapter,
      linkVerse: args.linkVerse,
    },
  }
}

export function shouldLogHelpsQuoteMiss(reason: HelpsQuoteMissReason): boolean {
  if (VERBOSE_ONLY.has(reason)) return isHelpsQuoteDebugVerbose()
  return true
}

/**
 * Log a quote-build miss once per key. Returns true when a line was emitted.
 */
export function logHelpsQuoteBuildMiss(event: HelpsQuoteMissEvent): boolean {
  if (!shouldLogHelpsQuoteMiss(event.reason)) return false
  const key = helpsQuoteMissLogKey(event)
  if (loggedKeys.has(key)) return false
  loggedKeys.add(key)

  const payload = {
    stage: event.stage,
    reason: event.reason,
    linkId: event.linkId,
    reference: event.reference,
    resourceKey: event.resourceKey,
    bookId: event.bookId,
    chapter: event.chapter,
    ...event.detail,
  }

  // Settled / actionable misses — warn so DevTools default level shows them.
  console.warn('[helps-quote] build incomplete', payload)
  return true
}

/** Log many align results after a batch (deduped per link). */
export function logHelpsAlignMisses(args: {
  stage?: HelpsQuoteMissStage
  resourceKey: string
  bookCode: string
  results: ReadonlyArray<{
    id: string
    reference?: string
    origWords?: string
    quoteTokens?: { length: number } | null
    quoteStatus?: string
    alignedTokens?: { length: number } | null
    semanticIds?: { length: number } | null
    quoteReady?: boolean
  }>
  hasTargetTokens: boolean
  quoteBuildReady: boolean
  passageStartChapter: number
  passageEndChapter: number
  tokenBook: string
  tokenChapter: number
  tokenEndChapter: number
  tokenStartVerse: number
  tokenEndVerse: number
}): number {
  let logged = 0
  for (const row of args.results) {
    const hasAligned =
      (Array.isArray(row.alignedTokens) && row.alignedTokens.length > 0) ||
      (Array.isArray(row.semanticIds) && row.semanticIds.length > 0)
    if (hasAligned || row.quoteStatus === 'pending' || row.quoteStatus === 'aligned') continue
    if (!row.origWords?.trim() && row.quoteStatus === 'none') continue

    const refParts = String(row.reference || '1:1').split(':')
    const linkChapter = parseInt(refParts[0] || '1', 10)
    const linkVerse = parseInt(refParts[1] || '1', 10)
    const diagnosed = diagnoseHelpsAlignMiss({
      hasOrigWords: Boolean(row.origWords?.trim()),
      hasAlignedTokens: hasAligned,
      hasTargetTokens: args.hasTargetTokens,
      quoteBuildReady: args.quoteBuildReady,
      linkQuoteReady: row.quoteReady,
      bookCode: args.bookCode,
      tokenBook: args.tokenBook,
      linkChapter,
      linkVerse,
      passageStartChapter: args.passageStartChapter,
      passageEndChapter: args.passageEndChapter,
      tokenChapter: args.tokenChapter,
      tokenEndChapter: args.tokenEndChapter,
      tokenStartVerse: args.tokenStartVerse,
      tokenEndVerse: args.tokenEndVerse,
      quoteTokenCount: row.quoteTokens?.length ?? 0,
    })
    if (!diagnosed) continue
    if (
      logHelpsQuoteBuildMiss({
        stage: args.stage ?? 'align',
        reason: diagnosed.reason,
        linkId: row.id,
        reference: row.reference,
        resourceKey: args.resourceKey,
        bookId: args.bookCode,
        chapter: linkChapter,
        detail: diagnosed.detail,
      })
    ) {
      logged += 1
    }
  }
  return logged
}
