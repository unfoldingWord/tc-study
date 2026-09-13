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
  focusChapter: number
}): string {
  if (!args.enabled) return ''
  return [args.tnKey, args.bookId, args.supportReference, args.focusChapter].join('|')
}

type QuoteAlignCache = HelpsQuoteCacheAdapter & HelpsAlignCacheAdapter

function chapterNotes(
  notesByChapter: Record<string, TranslationNote[]> | null | undefined,
  chapter: number,
  supportReference: string
): TranslationNote[] {
  return supportRefNotesForChapter(notesByChapter?.[String(chapter)] ?? [], supportReference)
}

export function useSupportRefQuotes(args: {
  enabled: boolean
  notesByChapter?: Record<string, TranslationNote[]> | null
  supportReference: string
  tnKey: string
  bookId: string
  focusChapter?: number
  targetKey?: string | null
}): Map<string, SupportRefQuoteEnrichment> {
  const {
    enabled,
    notesByChapter,
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
    focusChapter,
  })

  const [enrichment, setEnrichment] = useState<Map<string, SupportRefQuoteEnrichment>>(
    () => new Map()
  )
  const genRef = useRef(0)
  const paintedSessionRef = useRef('')
  const plannedJobsRef = useRef(new Map<string, WarmJob>())
  const pendingByChapterRef = useRef(new Map<number, Set<string>>())
  const notesByChapterRef = useRef(notesByChapter)
  notesByChapterRef.current = notesByChapter

  useEffect(() => {
    if (!enabled || !sessionKey || !tnKey || !bookId || !cache || !catalogManager || !supportReference) {
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

    const markJobs = (jobs: WarmJob[]) => {
      for (const job of jobs) {
        plannedJobsRef.current.set(job.jobKey, job)
        const chapter = supportRefWarmJobChapter(job.jobKey)
        if (!chapter) continue
        const set = pendingByChapterRef.current.get(chapter) ?? new Set<string>()
        set.add(job.jobKey)
        pendingByChapterRef.current.set(chapter, set)
      }
    }

    const flushPlanned = async () => {
      if (plannedJobsRef.current.size === 0) return
      warmScheduler.notifyLane1Drained()
      for (const job of plannedJobsRef.current.values()) {
        try {
          await warmScheduler.enqueue(job)
        } catch {
          /* lane 2 may defer until drained */
        }
      }
    }

    const hydrateChapter = async (chapter: number, merge: boolean) => {
      const notes = chapterNotes(notesByChapterRef.current, chapter, supportReference)
      const quoteCtx = await resolveHelpsQuoteCacheCtx(catalogManager, tnKey, bookCode)
      if (gen !== genRef.current || !quoteCtx) return { quoteMisses: [] as TranslationNote[], alignMisses: [] as TranslationNote[] }

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
          if (full && gen === genRef.current) {
            const tokens = extractPreparedBroadcastTokens(
              bookCode.toLowerCase(),
              chapter,
              full,
              1,
              999
            )
            for (const note of quoted) {
              const row = sub.hits.get(note.id)
              if (!row) continue
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
      }

      const jobsPending = (pendingByChapterRef.current.get(chapter)?.size ?? 0) > 0
      const painted = paintSupportRefQuoteEnrichment({
        notes,
        quoteHits,
        reconstructedById: reconstructed,
        alignCacheKnown: cachedAlign !== null,
        warmInFlight:
          jobsPending || quoteMisses.length > 0 || (Boolean(target) && alignMisses.length > 0),
      })
      if (gen !== genRef.current) return { quoteMisses, alignMisses }
      setEnrichment((prev) => {
        if (!merge || prev.size === 0) return painted
        const next = new Map(prev)
        for (const [id, row] of painted) next.set(id, row)
        return next
      })
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
        alignMissChapters: alignMisses.length ? [chapter] : [],
        helpsStamp: quoteCtx.helpsStamp,
        olKey: quoteCtx.olKey,
        olStamp: quoteCtx.olStamp,
        targetKey: target || undefined,
        targetStamp: alignCtx?.targetStamp,
        textLanguage: target ? languageFromKey(target) : undefined,
      })
      if (jobs.length === 0) return
      markJobs(jobs)
      await flushPlanned()
    }

    void (async () => {
      const focusResult = await hydrateChapter(focus, !isNewSession)
      if (gen !== genRef.current) return
      if (focusResult) {
        await enqueueChapterMisses(focus, focusResult.quoteMisses, focusResult.alignMisses)
      }

      cancelIdle = scheduleIdle(() => {
        void (async () => {
          const rest = planSupportRefStreamChapters(notesByChapterRef.current, focus)
          const yieldSlice = () =>
            new Promise<void>((resolve) => {
              scheduleIdle(() => resolve(), 50)
            })

          for (const chapter of rest) {
            if (gen !== genRef.current) return
            const result = await hydrateChapter(chapter, true)
            if (result && (result.quoteMisses.length || result.alignMisses.length)) {
              await enqueueChapterMisses(chapter, result.quoteMisses, result.alignMisses)
            }
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
      void hydrateChapter(chapter, true)
    }

    unsubWarm = subscribeWarmDone(onWarmDone)
    unsubPrepare = subscribePrepareWarmDone(onWarmDone)
    unsubSched = warmScheduler.subscribe((stats) => {
      if (stats.lane1Drained && !stats.scrollUnsettled) void flushPlanned()
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
    notesByChapter,
  ])

  return enrichment
}
