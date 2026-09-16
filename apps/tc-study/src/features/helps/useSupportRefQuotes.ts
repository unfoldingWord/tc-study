/**
 * Support-ref book filter: hydrate quote + align from IndexedDB, chapter-first.
 * First paint is cache-only for the focus chapter. Misses enqueue quote-chapter
 * and align-chapter on prepare/warm lane 2 — no main-thread batchAlign.
 */

import type { TranslationNote } from '@bt-synergy/resource-parsers'
import { useEffect, useRef, useState } from 'react'
import {
  useCacheAdapter,
  useCatalogManager,
} from '../../contexts'
import { scheduleIdle } from '../../utils/scheduleIdle'
import { subscribePrepareWarmDone } from '../../workers/prepareClient'
import { subscribeWarmDone } from '../../workers/warmClient'
import {
  readCachedAlignments,
  subtractCachedAlignHits,
  alignRowHasDisplayText,
  type CachedAlignments,
  type HelpsAlignCacheAdapter,
} from './helpsAlignCache'
import {
  readCachedQuoteTokens,
  subtractCachedQuoteHits,
  type HelpsQuoteCacheAdapter,
} from './helpsQuoteCache'
import {
  planSupportRefStreamChapters,
  streamRowsForChapter,
  supportRefNotesForChapter,
} from './helpsDisplayFilters'
import { readPreparedUnit } from '../prepare/prepareCache'
import { extractPreparedBroadcastTokens } from '../scripture/extractPreparedBroadcastTokens'
import {
  SCRIPTURE_PREPARE_VERSION,
  type ScriptureFullChapter,
} from '../scripture/scripturePreparer'
import { reconstructAlignFromPositions } from './reconstructAlignFromPositions'
import { languageFromKey } from '../warm/warmResourceClass'
import { warmScheduler } from '../warm/warmScheduler'
import type { WarmJob } from '../warm/warmTypes'
import {
  bookFilterContentReady,
  flushBookFilterWarmJobs,
  prioritizeBookFilterWarmJobs,
  reconcileStaleBookFilterWarmJobs,
  shouldFlushBookFilterEnrichmentPaint,
} from './bookFilterQuoteWarm'
import { logHelpsQuoteBuildMiss } from './helpsQuoteBuildDebug'
import {
  cachedQuoteTokensToOptimized,
  enrichmentFromCachedQuotes,
  isSupportRefPrepareJobFor,
  isSupportRefWarmJobFor,
  paintSupportRefQuoteEnrichment,
  planSupportRefQuoteWarmJobs,
  supportRefWarmJobChapter,
  type SupportRefQuoteEnrichment,
} from './supportRefQuotePaint'
import {
  resolveHelpsAlignCacheCtx,
  resolveHelpsQuoteCacheCtx,
} from './useWarmAdjacentHelpsQuotes'

export type { SupportRefQuoteEnrichment } from './supportRefQuotePaint'
export { enrichmentFromCachedQuotes }

export function supportRefQuoteSessionKey(args: {
  enabled: boolean
  tnKey: string
  bookId: string
  supportReference: string
}): string {
  if (!args.enabled) return ''
  // Focus chapter only reorders hydrate priority — do not reset enrichment
  // when the user jumps chapters inside the same Metaphor filter.
  return [args.tnKey, args.bookId, args.supportReference].join('|')
}

type QuoteAlignCache = HelpsQuoteCacheAdapter & HelpsAlignCacheAdapter

function chapterNotes(
  notesByChapter: Record<string, TranslationNote[]> | null | undefined,
  fallbackNotes: readonly TranslationNote[] | null | undefined,
  chapter: number,
  supportReference: string
): TranslationNote[] {
  return supportRefNotesForChapter(
    streamRowsForChapter(notesByChapter, fallbackNotes, chapter),
    supportReference
  )
}

export function useSupportRefQuotes(args: {
  enabled: boolean
  notesByChapter?: Record<string, TranslationNote[]> | null
  fallbackNotes?: TranslationNote[] | null
  supportReference: string
  tnKey: string
  bookId: string
  focusChapter?: number
  targetKey?: string | null
}): Map<string, SupportRefQuoteEnrichment> {
  const {
    enabled,
    notesByChapter,
    fallbackNotes,
    supportReference,
    tnKey,
    bookId,
    focusChapter = 1,
    targetKey = '',
  } = args
  const cache = useCacheAdapter() as QuoteAlignCache | null
  const catalogManager = useCatalogManager()

  const sessionKey = supportRefQuoteSessionKey({
    enabled,
    tnKey,
    bookId,
    supportReference,
  })

  const [enrichment, setEnrichment] = useState<Map<string, SupportRefQuoteEnrichment>>(
    () => new Map()
  )
  const genRef = useRef(0)
  const paintedSessionRef = useRef('')
  const plannedJobsRef = useRef(new Map<string, WarmJob>())
  const pendingByChapterRef = useRef(new Map<number, Set<string>>())
  /** Chapters whose align warm finished without a cache write (noop) — settle chips. */
  const alignSettledChaptersRef = useRef(new Set<number>())
  const notesByChapterRef = useRef(notesByChapter)
  notesByChapterRef.current = notesByChapter
  const fallbackNotesRef = useRef(fallbackNotes)
  fallbackNotesRef.current = fallbackNotes
  const contentReady = bookFilterContentReady(notesByChapter, fallbackNotes)

  useEffect(() => {
    if (
      !enabled ||
      !sessionKey ||
      !tnKey ||
      !bookId ||
      !cache ||
      !catalogManager ||
      !supportReference ||
      !contentReady
    ) {
      return
    }

    const gen = ++genRef.current
    const bookCode = bookId.toUpperCase()
    const bookIdNorm = bookId.toLowerCase()
    const focus = focusChapter > 0 ? focusChapter : 1
    const target = targetKey || ''
    const isNewSession = paintedSessionRef.current !== sessionKey
    paintedSessionRef.current = sessionKey
    let cancelIdle: (() => void) | undefined
    let unsubWarm: (() => void) | undefined
    let unsubPrepare: (() => void) | undefined
    let unsubSched: (() => void) | undefined
    let chaptersSincePaint = 0
    let pendingPaint = new Map<string, SupportRefQuoteEnrichment>()

    const commitPaint = (merge: boolean) => {
      if (pendingPaint.size === 0) return
      const batch = pendingPaint
      pendingPaint = new Map()
      chaptersSincePaint = 0
      setEnrichment((prev) => {
        if (!merge || prev.size === 0) return batch
        const next = new Map(prev)
        for (const [id, row] of batch) next.set(id, row)
        return next
      })
    }

    if (isNewSession) {
      plannedJobsRef.current.clear()
      pendingByChapterRef.current.clear()
      alignSettledChaptersRef.current.clear()
    }

    const markJobs = (jobs: WarmJob[]) => {
      // Planned only — pendingByChapter means scheduler-accepted in-flight.
      for (const job of jobs) plannedJobsRef.current.set(job.jobKey, job)
    }

    const trackAdmitted = (job: WarmJob) => {
      const chapter = supportRefWarmJobChapter(job.jobKey)
      if (!chapter) return
      const set = pendingByChapterRef.current.get(chapter) ?? new Set<string>()
      set.add(job.jobKey)
      pendingByChapterRef.current.set(chapter, set)
    }

    const flushPlanned = async () => {
      const stats = warmScheduler.getStats()
      prioritizeBookFilterWarmJobs(plannedJobsRef.current, focus)
      const before = plannedJobsRef.current.size
      const admittedChapters = new Set<number>()
      const admitted = await flushBookFilterWarmJobs({
        planned: plannedJobsRef.current,
        lane1Drained: stats.lane1Drained,
        scrollUnsettled: stats.scrollUnsettled,
        priorityChapters: [focus],
        chapterOfJob: supportRefWarmJobChapter,
        enqueue: async (job) => {
          const ok = await warmScheduler.enqueue(job)
          if (ok) {
            trackAdmitted(job)
            const chapter = supportRefWarmJobChapter(job.jobKey)
            if (chapter) admittedChapters.add(chapter)
          }
          return ok
        },
      })
      if (before > 0 && admitted === 0) {
        logHelpsQuoteBuildMiss({
          stage: 'warm-admit',
          reason: 'warm_lane_blocked',
          linkId: `focus:${focus}`,
          resourceKey: tnKey,
          bookId: bookIdNorm,
          chapter: focus,
          detail: {
            planned: before,
            lane1Drained: stats.lane1Drained,
            scrollUnsettled: stats.scrollUnsettled,
            supportReference,
          },
        })
      }
      return admittedChapters
    }

    const hydrateChapter = async (chapter: number, merge: boolean) => {
      const notes = chapterNotes(
        notesByChapterRef.current,
        fallbackNotesRef.current,
        chapter,
        supportReference
      )
      const quoteCtx = await resolveHelpsQuoteCacheCtx(catalogManager, tnKey, bookCode)
      if (gen !== genRef.current || !quoteCtx) {
        if (!quoteCtx) {
          logHelpsQuoteBuildMiss({
            stage: 'book-filter-enrichment',
            reason: 'missing_cache_context',
            linkId: `chapter:${chapter}`,
            resourceKey: tnKey,
            bookId: bookIdNorm,
            chapter,
            detail: { supportReference, targetKey: target || undefined, kind: 'quote-ctx' },
          })
        }
        return { quoteMisses: [] as TranslationNote[], alignMisses: [] as TranslationNote[] }
      }

      const alignCtx = target
        ? await resolveHelpsAlignCacheCtx(catalogManager, tnKey, target, bookCode)
        : null

      const cachedQuotes = await readCachedQuoteTokens(cache, {
        helpsKey: tnKey,
        helpsStamp: quoteCtx.helpsStamp,
        olKey: quoteCtx.olKey,
        olStamp: quoteCtx.olStamp,
        book: bookCode,
        chapter,
      })
      const quoted = notes.filter((n) => n.quote?.trim())
      const { hits: quoteHits, misses: quoteMisses } = subtractCachedQuoteHits(
        quoted,
        cachedQuotes ?? {}
      )

      let cachedAlign: CachedAlignments | null = null
      let alignMisses: TranslationNote[] = target ? quoted : []
      const reconstructed = new Map<
        string,
        {
          alignedTokens?: SupportRefQuoteEnrichment['alignedTokens']
          semanticIds?: string[]
        }
      >()

      if (alignCtx && target) {
        cachedAlign = await readCachedAlignments(cache, {
          helpsKey: tnKey,
          helpsStamp: alignCtx.helpsStamp,
          olKey: alignCtx.olKey,
          olStamp: alignCtx.olStamp,
          targetKey: target,
          targetStamp: alignCtx.targetStamp,
          book: bookCode,
          chapter,
        })
        const sub = subtractCachedAlignHits(quoted, cachedAlign ?? {})
        alignMisses = sub.misses
        if (sub.hits.size) {
          const full = await readPreparedUnit<ScriptureFullChapter>(
            cache,
            'scripture',
            target,
            bookCode,
            chapter,
            'full',
            SCRIPTURE_PREPARE_VERSION
          )
          const tokens =
            full && gen === genRef.current
              ? (extractPreparedBroadcastTokens(
                  bookCode.toLowerCase(),
                  chapter,
                  full,
                  1,
                  999
                ) as never[])
              : []
          for (const note of quoted) {
            const row = sub.hits.get(note.id)
            if (!row) continue
            // Prefer prepared reconstruct; fall back to stored display texts on refresh.
            if (!tokens.length && !alignRowHasDisplayText(row)) continue
            const verse = parseInt(String(note.reference).split(':')[1] || '1', 10)
            const qt = quoteHits.get(note.id)
            const result = reconstructAlignFromPositions({
              targetTokens: tokens as never,
              quoteTokens: qt?.length ? cachedQuoteTokensToOptimized(qt) : undefined,
              origWords: note.quote,
              occurrence: note.occurrence,
              bookCode: bookCode.toLowerCase(),
              chapter,
              verse,
              row,
            })
            reconstructed.set(note.id, {
              alignedTokens: result.alignedTokens,
              semanticIds: result.semanticIds,
            })
          }
        }
      }

      const jobsPending = (pendingByChapterRef.current.get(chapter)?.size ?? 0) > 0
      const painted = paintSupportRefQuoteEnrichment({
        notes,
        quoteHits,
        reconstructedById: reconstructed,
        alignCacheKnown:
          !target ||
          cachedAlign !== null ||
          alignSettledChaptersRef.current.has(chapter),
        warmInFlight: jobsPending,
      })
      if (gen !== genRef.current) return { quoteMisses, alignMisses }
      for (const [id, row] of painted) {
        pendingPaint.set(id, row)
        if (
          !jobsPending &&
          cachedAlign !== null &&
          row.quoteStatus === 'ol-fallback' &&
          !row.quoteWarmPending &&
          !(row.alignedTokens && row.alignedTokens.length > 0)
        ) {
          const note = notes.find((n) => n.id === id)
          logHelpsQuoteBuildMiss({
            stage: 'book-filter-enrichment',
            reason: 'align_cache_settled_miss',
            linkId: id,
            reference: note?.reference,
            resourceKey: tnKey,
            bookId: bookIdNorm,
            chapter,
            detail: {
              supportReference,
              hasQuoteTokens: Boolean(row.quoteTokens?.length),
              alignCacheKnown: true,
              quoteMiss: quoteMisses.some((n) => n.id === id),
              alignMiss: alignMisses.some((n) => n.id === id),
            },
          })
        }
      }
      if (chapter === focus || !merge) {
        commitPaint(merge)
      } else {
        chaptersSincePaint += 1
        if (
          shouldFlushBookFilterEnrichmentPaint({
            chapter,
            focusChapter: focus,
            chaptersSincePaint,
            isLast: false,
          })
        ) {
          commitPaint(true)
        }
      }
      return { quoteMisses, alignMisses }
    }

    const enqueueChapterMisses = async (
      chapter: number,
      quoteMisses: TranslationNote[],
      alignMisses: TranslationNote[]
    ) => {
      const quoteCtx = await resolveHelpsQuoteCacheCtx(catalogManager, tnKey, bookCode)
      if (gen !== genRef.current || !quoteCtx) return
      const alignCtx = target
        ? await resolveHelpsAlignCacheCtx(catalogManager, tnKey, target, bookCode)
        : null
      const jobs = planSupportRefQuoteWarmJobs({
        helpsKey: tnKey,
        bookId: bookIdNorm,
        languageCode: languageFromKey(tnKey),
        quoteMissChapters: quoteMisses.length ? [chapter] : [],
        alignMissChapters:
          alignMisses.length && !alignSettledChaptersRef.current.has(chapter)
            ? [chapter]
            : [],
        helpsStamp: quoteCtx.helpsStamp,
        olKey: quoteCtx.olKey,
        olStamp: quoteCtx.olStamp,
        targetKey: target || undefined,
        targetStamp: alignCtx?.targetStamp,
        textLanguage: target ? languageFromKey(target) : undefined,
      })
      if (jobs.length === 0) return
      markJobs(jobs)
      const admittedChapters = await flushPlanned()
      for (const chapter of admittedChapters) {
        if (gen !== genRef.current) return
        if ((pendingByChapterRef.current.get(chapter)?.size ?? 0) > 0) {
          await hydrateChapter(chapter, true)
        }
      }
    }

    const chapterHasOpenWarm = (chapter: number) =>
      (pendingByChapterRef.current.get(chapter)?.size ?? 0) > 0 ||
      [...plannedJobsRef.current.keys()].some(
        (key) => supportRefWarmJobChapter(key) === chapter
      )

    const reconcilePending = () => {
      const chapters = reconcileStaleBookFilterWarmJobs({
        pendingByChapter: pendingByChapterRef.current,
        planned: plannedJobsRef.current,
        isSchedulerPending: (jobKey) => warmScheduler.isJobPending(jobKey),
      })
      for (const chapter of chapters) {
        void hydrateChapter(chapter, true).then(() => commitPaint(true))
      }
    }

    // Drop phantom in-flight markers left by a prior effect / gated enqueue.
    reconcilePending()

    void (async () => {
      const focusResult = await hydrateChapter(focus, !isNewSession)
      if (gen !== genRef.current) return
      if (focusResult) {
        await enqueueChapterMisses(focus, focusResult.quoteMisses, focusResult.alignMisses)
        if (gen !== genRef.current) return
      }

      cancelIdle = scheduleIdle(() => {
        void (async () => {
          const rest = planSupportRefStreamChapters(
            notesByChapterRef.current,
            focus,
            fallbackNotesRef.current
          )
          const yieldSlice = () =>
            new Promise<void>((resolve) => {
              scheduleIdle(() => resolve(), 50)
            })

          for (let i = 0; i < rest.length; i++) {
            const chapter = rest[i]!
            if (gen !== genRef.current) return
            const result = await hydrateChapter(chapter, true)
            if (result && (result.quoteMisses.length || result.alignMisses.length)) {
              await enqueueChapterMisses(chapter, result.quoteMisses, result.alignMisses)
            }
            if (i === rest.length - 1) commitPaint(true)
            await yieldSlice()
          }
        })()
      }, 120)
    })()

    const onWarmDone = (msg: { jobKey: string }) => {
      if (gen !== genRef.current) return
      const ours =
        isSupportRefWarmJobFor(msg.jobKey, tnKey, bookIdNorm) ||
        isSupportRefPrepareJobFor(msg.jobKey, target, bookIdNorm)
      if (!ours) return
      plannedJobsRef.current.delete(msg.jobKey)
      const chapter = supportRefWarmJobChapter(msg.jobKey)
      if (!chapter) return
      pendingByChapterRef.current.get(chapter)?.delete(msg.jobKey)

      const isPrepare = isSupportRefPrepareJobFor(msg.jobKey, target, bookIdNorm)
      const isAlign = msg.jobKey.startsWith(`align:${tnKey}:`)

      void (async () => {
        if (isPrepare) {
          alignSettledChaptersRef.current.delete(chapter)
        }

        const result = await hydrateChapter(chapter, true)
        if (gen !== genRef.current) return

        if (isPrepare && result && result.alignMisses.length) {
          await enqueueChapterMisses(chapter, result.quoteMisses, result.alignMisses)
          if (gen !== genRef.current) return
        }

        if (
          isAlign &&
          target &&
          !chapterHasOpenWarm(chapter) &&
          result &&
          result.alignMisses.length > 0
        ) {
          alignSettledChaptersRef.current.add(chapter)
          await hydrateChapter(chapter, true)
        }

        commitPaint(true)
      })()
    }

    unsubWarm = subscribeWarmDone(onWarmDone)
    unsubPrepare = subscribePrepareWarmDone(onWarmDone)
    unsubSched = warmScheduler.subscribe((stats) => {
      reconcilePending()
      // Flush focus-priority jobs even while scroll is unsettled.
      if (!stats.lane1Drained) return
      void (async () => {
        const admitted = await flushPlanned()
        for (const chapter of admitted) {
          if (gen !== genRef.current) return
          await hydrateChapter(chapter, true)
          commitPaint(true)
        }
      })()
    })

    return () => {
      cancelIdle?.()
      unsubWarm?.()
      unsubPrepare?.()
      unsubSched?.()
    }
  }, [
    enabled,
    sessionKey,
    tnKey,
    bookId,
    cache,
    catalogManager,
    supportReference,
    focusChapter,
    targetKey,
    contentReady,
  ])

  return enrichment
}
