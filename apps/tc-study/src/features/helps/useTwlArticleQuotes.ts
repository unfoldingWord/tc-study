/**
 * TWL book-article filter: hydrate quote + align from IndexedDB, chapter-first.
 * First paint is cache-only for the focus chapter. Misses enqueue quote-chapter
 * and align-chapter on prepare/warm lane 2 — no main-thread batchAlign.
 *
 * Keys match useQuoteTokens / useAlignedTokens (TWL link.id, words-links SoT).
 */

import type { TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useEffect, useRef, useState } from 'react'
import {
  useCacheAdapter,
  useCatalogManager,
} from '../../contexts'
import { scheduleIdle } from '../../utils/scheduleIdle'
import { subscribePrepareWarmDone } from '../../workers/prepareClient'
import { subscribeWarmDone } from '../../workers/warmClient'
import {
  alignRowHasDisplayText,
  readCachedAlignments,
  subtractCachedAlignHits,
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
  twlArticleLinksForChapter,
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

export function twlArticleQuoteSessionKey(args: {
  enabled: boolean
  twlKey: string
  bookId: string
  articlePath: string
}): string {
  if (!args.enabled) return ''
  // Focus chapter only reorders hydrate priority — keep enrichment across jumps.
  return [args.twlKey, args.bookId, args.articlePath].join('|')
}

type QuoteAlignCache = HelpsQuoteCacheAdapter & HelpsAlignCacheAdapter

type TwlQuoteLink = Pick<
  TranslationWordsLink,
  'id' | 'reference' | 'origWords' | 'occurrence' | 'articlePath' | 'twLink'
>

function chapterLinks(
  linksByChapter: Record<string, TwlQuoteLink[]> | null | undefined,
  fallbackLinks: readonly TwlQuoteLink[] | null | undefined,
  chapter: number,
  articlePath: string
): TwlQuoteLink[] {
  return twlArticleLinksForChapter(
    streamRowsForChapter(linksByChapter, fallbackLinks, chapter),
    articlePath
  )
}

function linksAsPaintNotes(links: readonly TwlQuoteLink[]): Array<{ id: string; quote?: string }> {
  return links.map((link) => ({ id: link.id, quote: link.origWords }))
}

export function useTwlArticleQuotes(args: {
  enabled: boolean
  linksByChapter?: Record<string, TwlQuoteLink[]> | null
  fallbackLinks?: TwlQuoteLink[] | null
  articlePath: string
  twlKey: string
  bookId: string
  focusChapter?: number
  targetKey?: string | null
}): Map<string, SupportRefQuoteEnrichment> {
  const {
    enabled,
    linksByChapter,
    fallbackLinks,
    articlePath,
    twlKey,
    bookId,
    focusChapter = 1,
    targetKey = '',
  } = args
  const cache = useCacheAdapter() as QuoteAlignCache | null
  const catalogManager = useCatalogManager()

  const sessionKey = twlArticleQuoteSessionKey({
    enabled,
    twlKey,
    bookId,
    articlePath,
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
  const linksByChapterRef = useRef(linksByChapter)
  linksByChapterRef.current = linksByChapter
  const fallbackLinksRef = useRef(fallbackLinks)
  fallbackLinksRef.current = fallbackLinks
  const contentReady = bookFilterContentReady(linksByChapter, fallbackLinks)

  useEffect(() => {
    if (
      !enabled ||
      !sessionKey ||
      !twlKey ||
      !bookId ||
      !cache ||
      !catalogManager ||
      !articlePath ||
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
          resourceKey: twlKey,
          bookId: bookIdNorm,
          chapter: focus,
          detail: {
            planned: before,
            lane1Drained: stats.lane1Drained,
            scrollUnsettled: stats.scrollUnsettled,
            articlePath,
          },
        })
      }
      return admittedChapters
    }

    const hydrateChapter = async (chapter: number, merge: boolean) => {
      const links = chapterLinks(
        linksByChapterRef.current,
        fallbackLinksRef.current,
        chapter,
        articlePath
      )
      const quoteCtx = await resolveHelpsQuoteCacheCtx(catalogManager, twlKey, bookCode)
      if (gen !== genRef.current || !quoteCtx) {
        return { quoteMisses: [] as TwlQuoteLink[], alignMisses: [] as TwlQuoteLink[] }
      }

      const alignCtx = target
        ? await resolveHelpsAlignCacheCtx(catalogManager, twlKey, target, bookCode)
        : null

      const cachedQuotes = await readCachedQuoteTokens(cache, {
        helpsKey: twlKey,
        helpsStamp: quoteCtx.helpsStamp,
        olKey: quoteCtx.olKey,
        olStamp: quoteCtx.olStamp,
        book: bookCode,
        chapter,
      })
      const quoted = links.filter((l) => l.origWords?.trim())
      const { hits: quoteHits, misses: quoteMisses } = subtractCachedQuoteHits(
        quoted,
        cachedQuotes ?? {}
      )

      let cachedAlign: CachedAlignments | null = null
      let alignMisses: TwlQuoteLink[] = target ? quoted : []
      const reconstructed = new Map<
        string,
        {
          alignedTokens?: SupportRefQuoteEnrichment['alignedTokens']
          semanticIds?: string[]
        }
      >()

      if (alignCtx && target) {
        cachedAlign = await readCachedAlignments(cache, {
          helpsKey: twlKey,
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
          for (const link of quoted) {
            const row = sub.hits.get(link.id)
            if (!row) continue
            if (!tokens.length && !alignRowHasDisplayText(row)) continue
            const verse = parseInt(String(link.reference).split(':')[1] || '1', 10)
            const qt = quoteHits.get(link.id)
            const result = reconstructAlignFromPositions({
              targetTokens: tokens as never,
              quoteTokens: qt?.length ? cachedQuoteTokensToOptimized(qt) : undefined,
              origWords: link.origWords,
              occurrence: link.occurrence,
              bookCode: bookCode.toLowerCase(),
              chapter,
              verse,
              row,
            })
            reconstructed.set(link.id, {
              alignedTokens: result.alignedTokens,
              semanticIds: result.semanticIds,
            })
          }
        }
      }

      const jobsPending = (pendingByChapterRef.current.get(chapter)?.size ?? 0) > 0
      const painted = paintSupportRefQuoteEnrichment({
        notes: linksAsPaintNotes(links),
        quoteHits,
        reconstructedById: reconstructed,
        // No target → nothing to align. Settled chapters → warm already finished
        // without a cache write (noop) and must not spin forever.
        alignCacheKnown:
          !target ||
          cachedAlign !== null ||
          alignSettledChaptersRef.current.has(chapter),
        warmInFlight: jobsPending,
      })
      if (gen !== genRef.current) return { quoteMisses, alignMisses }
      for (const [id, row] of painted) pendingPaint.set(id, row)
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
      quoteMisses: TwlQuoteLink[],
      alignMisses: TwlQuoteLink[]
    ) => {
      const quoteCtx = await resolveHelpsQuoteCacheCtx(catalogManager, twlKey, bookCode)
      if (gen !== genRef.current || !quoteCtx) return
      const alignCtx = target
        ? await resolveHelpsAlignCacheCtx(catalogManager, twlKey, target, bookCode)
        : null
      const jobs = planSupportRefQuoteWarmJobs({
        helpsKey: twlKey,
        bookId: bookIdNorm,
        languageCode: languageFromKey(twlKey),
        quoteMissChapters: quoteMisses.length ? [chapter] : [],
        // Skip align re-queue after a settled noop; prepare-done clears settled.
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
        helpsType: 'words-links',
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
            linksByChapterRef.current,
            focus,
            fallbackLinksRef.current
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
        isSupportRefWarmJobFor(msg.jobKey, twlKey, bookIdNorm) ||
        isSupportRefPrepareJobFor(msg.jobKey, target, bookIdNorm)
      if (!ours) return
      plannedJobsRef.current.delete(msg.jobKey)
      const chapter = supportRefWarmJobChapter(msg.jobKey)
      if (!chapter) return
      pendingByChapterRef.current.get(chapter)?.delete(msg.jobKey)

      const isPrepare = isSupportRefPrepareJobFor(msg.jobKey, target, bookIdNorm)
      const isAlign = msg.jobKey.startsWith(`align:${twlKey}:`)

      void (async () => {
        if (isPrepare) {
          // Scripture ready — allow align to run again after a prior noop.
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
          // Align finished without usable rows and nothing else is queued.
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
    twlKey,
    bookId,
    cache,
    catalogManager,
    articlePath,
    focusChapter,
    targetKey,
    contentReady,
  ])

  return enrichment
}
