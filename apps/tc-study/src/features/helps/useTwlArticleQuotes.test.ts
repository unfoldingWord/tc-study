import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planSupportRefQuoteWarmJobs } from './supportRefQuotePaint'
import { enrichmentFromCachedQuotes, twlArticleQuoteSessionKey } from './useTwlArticleQuotes'

describe('useTwlArticleQuotes first paint', () => {
  test('cached quotes paint current-chapter TWL links without batchAlign', () => {
    const links = [
      { id: 'twl-1', quote: 'יְהוָה' },
      { id: 'twl-1b', quote: '' },
    ]
    const hits = new Map([
      ['twl-1', [{ id: 1, text: 'יְהוָה', type: 'word', occurrence: 1, content: 'יְהוָה' }]],
    ])
    const painted = enrichmentFromCachedQuotes(links, hits)
    expect(painted.get('twl-1')?.quoteStatus).toBe('ol-fallback')
    expect(painted.get('twl-1')?.quoteTokens?.[0]?.text).toBe('יְהוָה')
    expect(painted.get('twl-1b')?.quoteStatus).toBe('none')
    expect(painted.size).toBe(2)
  })

  test('session key is article identity, not focus chapter', () => {
    expect(
      twlArticleQuoteSessionKey({
        enabled: true,
        twlKey: 'unfoldingWord/en/twl',
        bookId: 'psa',
        articlePath: 'bible/kt/yahweh',
      })
    ).toBe('unfoldingWord/en/twl|psa|bible/kt/yahweh')
    expect(
      twlArticleQuoteSessionKey({
        enabled: false,
        twlKey: 'unfoldingWord/en/twl',
        bookId: 'psa',
        articlePath: 'bible/kt/yahweh',
      })
    ).toBe('')
  })

  test('off-chapter miss enqueues quote + align warm, not batchAlign on main', () => {
    const jobs = planSupportRefQuoteWarmJobs({
      helpsKey: 'unfoldingWord/en/twl',
      bookId: 'psa',
      languageCode: 'en',
      quoteMissChapters: [18],
      alignMissChapters: [18],
      helpsStamp: 'twl1',
      olKey: 'unfoldingWord/hbo/uhb',
      olStamp: 'uhb1',
      targetKey: 'unfoldingWord/en/ult',
      targetStamp: 'ult1',
      textLanguage: 'en',
      helpsType: 'words-links',
    })
    expect(jobs.every((j) => j.lane === 2)).toBe(true)
    expect(jobs.map((j) => j.kind)).toEqual(['quote-chapter', 'prepare-unit', 'align-chapter'])
    expect(jobs.every((j) => j.kind !== 'prepare-unit' ? true : j.kind === 'prepare-unit')).toBe(true)
    expect(jobs[0]?.helpsType).toBe('words-links')
    expect(jobs[2]?.helpsType).toBe('words-links')
    expect(jobs[0]?.jobKey).toBe('quote:unfoldingWord/en/twl:psa:18')
    expect(jobs[1]?.jobKey).toBe('prep:scripture:unfoldingWord/en/ult:psa:18')
    expect(jobs[2]?.jobKey).toBe('align:unfoldingWord/en/twl:unfoldingWord/en/ult:psa:18')
  })

  test('hook hydrates focus chapter cache first and never imports batchAlign', () => {
    const src = readFileSync(join(import.meta.dir, 'useTwlArticleQuotes.ts'), 'utf8')
    expect(src).toContain('paintSupportRefQuoteEnrichment')
    expect(src).toContain('readCachedQuoteTokens')
    expect(src).toContain('readCachedAlignments')
    expect(src).toContain('hydrateChapter(focus')
    expect(src).toContain('planSupportRefStreamChapters')
    expect(src).toContain('fallbackLinks')
    expect(src).toContain('planSupportRefQuoteWarmJobs')
    expect(src).toContain("helpsType: 'words-links'")
    expect(src).toContain('warmScheduler.enqueue')
    expect(src).toContain('flushBookFilterWarmJobs')
    expect(src).toContain('reconcileStaleBookFilterWarmJobs')
    expect(src).toContain('isJobPending')
    expect(src).toContain('subscribeWarmDone')
    expect(src).toContain('origWords')
    expect(src).not.toContain('notifyLane1Drained()')
    expect(src).not.toContain('warmChapterQuotes')
    expect(src).not.toContain('batchAlignLinks')
    expect(src).not.toContain('batchAlignInWorker')
    expect(src).not.toMatch(/loader\.loadViewModel/)
    expect(src).not.toMatch(/links\.map\(\(l\) => l\.id\)/)
  })
})
