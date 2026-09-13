/**
 * Support-ref quote paint + warm-job planning — pure, no workers.
 *
 * Orig-language fallback can paint immediately. Aligned ULT tokens land later
 * from helps-align cache. Pending is an icon on that fallback chip, not a
 * settled miss.
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import type { HelpsQuoteStatus } from './resolveHelpsQuoteStatus'
import type { CachedQuoteToken } from './helpsQuoteCache'
import type { WarmJob } from '../warm/warmTypes'

export type SupportRefQuoteEnrichment = {
  quoteTokens?: OptimizedToken[]
  alignedTokens?: Array<{
    position: number
    content: string
    type?: string
    semanticId?: string
  }>
  semanticIds?: string[]
  quoteStatus: HelpsQuoteStatus
  /** Orig fallback is on screen but quote/align warm is still in flight. */
  quoteWarmPending?: boolean
}

export type SupportRefQuoteChipKind = 'aligned' | 'ol-pending' | 'ol' | 'placeholder' | 'none'

export function cachedQuoteTokensToOptimized(tokens: CachedQuoteToken[]): OptimizedToken[] {
  return tokens.map((t) => ({
    id: t.id,
    text: t.text,
    type: t.type,
    occurrence: t.occurrence,
    content: t.content,
  })) as OptimizedToken[]
}

/** Spinner on the quote chip — orig fallback is visible, ULT is not ready. */
export function isSupportRefQuoteChipPending(args: {
  hasAlignedTokens: boolean
  quoteStatus?: HelpsQuoteStatus
  quoteWarmPending?: boolean
}): boolean {
  if (args.hasAlignedTokens) return false
  if (args.quoteWarmPending) return true
  return args.quoteStatus === 'pending'
}

/**
 * Icon-first chip model for TN cards. `ol-pending` keeps the Hebrew/OL quote
 * visible and adds a spinner — no instructional text.
 */
export function supportRefQuoteChipKind(args: {
  hasAlignedTokens: boolean
  quoteStatus: HelpsQuoteStatus
  olQuote?: string | null
  quoteWarmPending?: boolean
}): SupportRefQuoteChipKind {
  if (args.hasAlignedTokens) return 'aligned'
  const hasOl = Boolean(args.olQuote?.trim())
  if (args.quoteWarmPending && hasOl) return 'ol-pending'
  if (args.quoteStatus === 'pending') return 'placeholder'
  if (args.quoteStatus === 'ol-fallback' && hasOl) return 'ol'
  return 'none'
}

export function paintSupportRefQuoteEnrichment(args: {
  notes: readonly { id: string; quote?: string }[]
  quoteHits: ReadonlyMap<string, CachedQuoteToken[]>
  reconstructedById?: ReadonlyMap<
    string,
    {
      alignedTokens?: SupportRefQuoteEnrichment['alignedTokens']
      semanticIds?: string[]
    }
  >
  /** Align cache row for this chapter was read (object, including empty). */
  alignCacheKnown: boolean
  /** Quote or align jobs are queued / running for this chapter. */
  warmInFlight: boolean
}): Map<string, SupportRefQuoteEnrichment> {
  const next = new Map<string, SupportRefQuoteEnrichment>()
  const reconstructed = args.reconstructedById
  for (const note of args.notes) {
    const rebuilt = reconstructed?.get(note.id)
    const qt = args.quoteHits.get(note.id)
    const quoteTokens = qt?.length ? cachedQuoteTokensToOptimized(qt) : undefined
    const alignedTokens = rebuilt?.alignedTokens?.length ? rebuilt.alignedTokens : undefined
    const semanticIds = rebuilt?.semanticIds?.length ? rebuilt.semanticIds : undefined

    if (alignedTokens?.length) {
      next.set(note.id, {
        quoteTokens,
        alignedTokens,
        semanticIds,
        quoteStatus: 'aligned',
      })
      continue
    }
    if (!note.quote?.trim()) {
      next.set(note.id, { quoteTokens, quoteStatus: 'none' })
      continue
    }

    const hasReconstructPass = reconstructed !== undefined
    const noteAlignSettled = hasReconstructPass && args.alignCacheKnown && reconstructed.has(note.id)
    const pending = hasReconstructPass
      ? args.warmInFlight || !args.alignCacheKnown || !noteAlignSettled
      : args.warmInFlight || !args.alignCacheKnown
    next.set(note.id, {
      quoteTokens,
      semanticIds,
      quoteStatus: 'ol-fallback',
      quoteWarmPending: pending || undefined,
    })
  }
  return next
}

/** Quote-only first paint (no align ctx) — used by existing cache-hit tests. */
export function enrichmentFromCachedQuotes(
  notes: readonly { id: string; quote?: string }[],
  tokensById: ReadonlyMap<string, CachedQuoteToken[]>
): Map<string, SupportRefQuoteEnrichment> {
  return paintSupportRefQuoteEnrichment({
    notes,
    quoteHits: tokensById,
    alignCacheKnown: true,
    warmInFlight: false,
  })
}

export function planSupportRefQuoteWarmJobs(args: {
  helpsKey: string
  bookId: string
  languageCode: string
  quoteMissChapters: readonly number[]
  alignMissChapters: readonly number[]
  helpsStamp: string
  olKey: string
  olStamp: string
  targetKey?: string
  targetStamp?: string
  textLanguage?: string
}): WarmJob[] {
  const bookId = args.bookId.toLowerCase()
  const jobs: WarmJob[] = []
  const seen = new Set<string>()

  const push = (job: WarmJob) => {
    if (seen.has(job.jobKey)) return
    seen.add(job.jobKey)
    jobs.push(job)
  }

  for (const chapter of args.quoteMissChapters) {
    if (!Number.isFinite(chapter) || chapter < 1) continue
    push({
      jobKey: `quote:${args.helpsKey}:${bookId}:${chapter}`,
      lane: 2,
      kind: 'quote-chapter',
      languageCode: args.languageCode,
      resourceKey: args.helpsKey,
      bookId,
      chapter,
      helpsStamp: args.helpsStamp,
      olKey: args.olKey,
      olStamp: args.olStamp,
      helpsType: 'notes',
    })
  }

  if (args.targetKey && args.targetStamp) {
    for (const chapter of args.alignMissChapters) {
      if (!Number.isFinite(chapter) || chapter < 1) continue
      push({
        jobKey: `align:${args.helpsKey}:${args.targetKey}:${bookId}:${chapter}`,
        lane: 2,
        kind: 'align-chapter',
        languageCode: args.languageCode,
        resourceKey: args.helpsKey,
        bookId,
        chapter,
        helpsStamp: args.helpsStamp,
        olKey: args.olKey,
        olStamp: args.olStamp,
        targetKey: args.targetKey,
        targetStamp: args.targetStamp,
        helpsType: 'notes',
        textLanguage: args.textLanguage,
      })
    }
  }

  return jobs
}

export function supportRefWarmJobChapter(jobKey: string): number | null {
  const n = parseInt(jobKey.split(':').pop() ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function isSupportRefWarmJobFor(
  jobKey: string,
  helpsKey: string,
  bookId: string
): boolean {
  const book = bookId.toLowerCase()
  if (jobKey.startsWith(`quote:${helpsKey}:${book}:`)) return true
  if (jobKey.startsWith(`align:${helpsKey}:`) && jobKey.includes(`:${book}:`)) return true
  return false
}

export function isSupportRefPrepareJobFor(
  jobKey: string,
  targetKey: string,
  bookId: string
): boolean {
  if (!targetKey) return false
  return jobKey.startsWith(`prep:scripture:${targetKey}:${bookId.toLowerCase()}:`)
}
