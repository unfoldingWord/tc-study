import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BOOK_FILTER_ENRICHMENT_PAINT_EVERY,
  bookFilterContentReady,
  flushBookFilterWarmJobs,
  prioritizeBookFilterWarmJobs,
  reconcileStaleBookFilterWarmJobs,
  shouldFlushBookFilterEnrichmentPaint,
} from './bookFilterQuoteWarm'
import type { WarmJob } from '../warm/warmTypes'

describe('bookFilterQuoteWarm', () => {
  test('contentReady is stable across chapter-map identity changes', () => {
    expect(bookFilterContentReady(null, null)).toBe(false)
    expect(bookFilterContentReady({}, [])).toBe(false)
    expect(bookFilterContentReady({ '1': [{ id: 'a' }] }, null)).toBe(true)
    expect(bookFilterContentReady(null, [{ id: 'a' }])).toBe(true)
  })

  test('enrichment paint coalesces off-focus chapters', () => {
    expect(
      shouldFlushBookFilterEnrichmentPaint({
        chapter: 1,
        focusChapter: 1,
        chaptersSincePaint: 1,
        isLast: false,
      })
    ).toBe(true)
    expect(
      shouldFlushBookFilterEnrichmentPaint({
        chapter: 5,
        focusChapter: 1,
        chaptersSincePaint: BOOK_FILTER_ENRICHMENT_PAINT_EVERY - 1,
        isLast: false,
      })
    ).toBe(false)
    expect(
      shouldFlushBookFilterEnrichmentPaint({
        chapter: 5,
        focusChapter: 1,
        chaptersSincePaint: BOOK_FILTER_ENRICHMENT_PAINT_EVERY,
        isLast: false,
      })
    ).toBe(true)
    expect(
      shouldFlushBookFilterEnrichmentPaint({
        chapter: 5,
        focusChapter: 1,
        chaptersSincePaint: 1,
        isLast: true,
      })
    ).toBe(true)
  })

  test('flushBookFilterWarmJobs does not enqueue while lane1 busy', async () => {
    const planned = new Map<string, WarmJob>([
      [
        'quote:a:psa:1',
        {
          jobKey: 'quote:a:psa:1',
          lane: 2,
          kind: 'quote-chapter',
          languageCode: 'en',
          resourceKey: 'a',
          bookId: 'psa',
          chapter: 1,
          helpsStamp: 's',
          olKey: 'ol',
          olStamp: 'o',
          helpsType: 'words-links',
        },
      ],
    ])
    let calls = 0
    await flushBookFilterWarmJobs({
      planned,
      lane1Drained: false,
      scrollUnsettled: false,
      enqueue: async () => {
        calls += 1
        return true
      },
    })
    expect(calls).toBe(0)

    await flushBookFilterWarmJobs({
      planned,
      lane1Drained: true,
      scrollUnsettled: false,
      enqueue: async () => {
        calls += 1
        return true
      },
    })
    expect(calls).toBe(1)
  })

  test('flush does not count gated enqueues as admitted', async () => {
    const planned = new Map<string, WarmJob>([
      [
        'quote:a:psa:1',
        {
          jobKey: 'quote:a:psa:1',
          lane: 2,
          kind: 'quote-chapter',
          languageCode: 'en',
          resourceKey: 'a',
          bookId: 'psa',
          chapter: 1,
          helpsStamp: 's',
          olKey: 'ol',
          olStamp: 'o',
          helpsType: 'notes',
        },
      ],
      [
        'quote:a:psa:2',
        {
          jobKey: 'quote:a:psa:2',
          lane: 2,
          kind: 'quote-chapter',
          languageCode: 'en',
          resourceKey: 'a',
          bookId: 'psa',
          chapter: 2,
          helpsStamp: 's',
          olKey: 'ol',
          olStamp: 'o',
          helpsType: 'notes',
        },
      ],
    ])
    const admitted: string[] = []
    const count = await flushBookFilterWarmJobs({
      planned,
      lane1Drained: true,
      scrollUnsettled: false,
      enqueue: async (job) => {
        if (job.jobKey.endsWith(':1')) return false
        admitted.push(job.jobKey)
        return true
      },
    })
    expect(count).toBe(1)
    expect(admitted).toEqual(['quote:a:psa:2'])
  })

  test('reconcile drops phantom pending that scheduler is not running', () => {
    const pendingByChapter = new Map<number, Set<string>>([
      [1, new Set(['quote:a:psa:1', 'align:a:psa:1'])],
      [2, new Set(['quote:a:psa:2'])],
    ])
    const planned = new Map<string, WarmJob>([
      [
        'quote:a:psa:2',
        {
          jobKey: 'quote:a:psa:2',
          lane: 2,
          kind: 'quote-chapter',
          languageCode: 'en',
          resourceKey: 'a',
          bookId: 'psa',
          chapter: 2,
          helpsStamp: 's',
          olKey: 'ol',
          olStamp: 'o',
          helpsType: 'words-links',
        },
      ],
    ])
    const chapters = reconcileStaleBookFilterWarmJobs({
      pendingByChapter,
      planned,
      isSchedulerPending: (jobKey) => jobKey === 'align:a:psa:1',
    })
    expect(chapters.sort()).toEqual([1, 2])
    expect([...pendingByChapter.get(1)!]).toEqual(['align:a:psa:1'])
    expect(pendingByChapter.has(2)).toBe(false)
  })

  test('flush prioritizes focus chapter and admits it while scrolling', async () => {
    const mk = (chapter: number): WarmJob => ({
      jobKey: `quote:a:psa:${chapter}`,
      lane: 2,
      kind: 'quote-chapter',
      languageCode: 'en',
      resourceKey: 'a',
      bookId: 'psa',
      chapter,
      helpsStamp: 's',
      olKey: 'ol',
      olStamp: 'o',
      helpsType: 'notes',
    })
    const planned = new Map<string, WarmJob>([
      ['quote:a:psa:18', mk(18)],
      ['quote:a:psa:2', mk(2)],
      ['quote:a:psa:3', mk(3)],
    ])
    prioritizeBookFilterWarmJobs(planned, 2)
    expect([...planned.keys()][0]).toBe('quote:a:psa:2')

    const admitted: string[] = []
    await flushBookFilterWarmJobs({
      planned,
      lane1Drained: true,
      scrollUnsettled: true,
      priorityChapters: [2],
      enqueue: async (job) => {
        admitted.push(job.jobKey)
        return true
      },
    })
    expect(admitted).toEqual(['quote:a:psa:2'])
  })

  test('hooks no longer force default-owner lane1 drain or remount on map identity', () => {
    for (const file of [
      'useTwlArticleQuotes.ts',
      'useSupportRefQuotes.ts',
      'useWarmAdjacentHelpsQuotes.ts',
    ]) {
      const src = readFileSync(join(import.meta.dir, file), 'utf8')
      expect(src).not.toContain('notifyLane1Drained()')
    }
    for (const file of ['useTwlArticleQuotes.ts', 'useSupportRefQuotes.ts']) {
      const src = readFileSync(join(import.meta.dir, file), 'utf8')
      expect(src).toContain('flushBookFilterWarmJobs')
      expect(src).toContain('reconcileStaleBookFilterWarmJobs')
      expect(src).toContain('isJobPending')
      expect(src).toContain('contentReady')
      expect(src).toMatch(/targetKey,\s*contentReady,\s*\]/)
      expect(src).not.toMatch(/targetKey,\s*linksByChapter/)
      expect(src).not.toMatch(/targetKey,\s*notesByChapter/)
    }
    const pipeline = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/useCombinedHelpsPipeline.ts'),
      'utf8'
    )
    expect(pipeline).not.toContain('[relevantNotes, supportRefQuoteEnrichment]')
    const viewer = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/index.tsx'),
      'utf8'
    )
    expect(viewer).toContain('bookFilterRowsReady')
  })
})
