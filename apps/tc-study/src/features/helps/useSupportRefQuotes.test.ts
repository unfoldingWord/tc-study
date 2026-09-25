import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  enrichmentFromCachedQuotes,
  supportRefQuoteSessionKey,
} from './useSupportRefQuotes'

describe('useSupportRefQuotes first paint', () => {
  test('cached quotes paint current-chapter notes without batchAlign', () => {
    const notes = [
      { id: 'psa-1', quote: 'like a tree' },
      { id: 'psa-1b', quote: '' },
    ]
    const hits = new Map([
      ['psa-1', [{ id: 1, text: 'כְּעֵץ', type: 'word', occurrence: 1, content: 'כְּעֵץ' }]],
    ])
    const painted = enrichmentFromCachedQuotes(notes, hits)
    expect(painted.get('psa-1')?.quoteStatus).toBe('ol-fallback')
    expect(painted.get('psa-1')?.quoteTokens?.[0]?.text).toBe('כְּעֵץ')
    expect(painted.get('psa-1b')?.quoteStatus).toBe('none')
    expect(painted.size).toBe(2)
  })

  test('session key is filter identity, not focus chapter', () => {
    expect(
      supportRefQuoteSessionKey({
        enabled: true,
        tnKey: 'unfoldingWord/en/tn',
        bookId: 'psa',
        supportReference: 'rc://*/ta/man/translate/figs-metaphor',
      })
    ).toBe('unfoldingWord/en/tn|psa|rc://*/ta/man/translate/figs-metaphor')
    expect(
      supportRefQuoteSessionKey({
        enabled: false,
        tnKey: 'unfoldingWord/en/tn',
        bookId: 'psa',
        supportReference: 'rc://*/ta/man/translate/figs-metaphor',
      })
    ).toBe('')
  })

  test('hook hydrates focus chapter cache first and never imports batchAlign', () => {
    const src = readFileSync(join(import.meta.dir, 'useSupportRefQuotes.ts'), 'utf8')
    expect(src).toContain('paintSupportRefQuoteEnrichment')
    expect(src).toContain('readCachedQuoteTokens')
    expect(src).toContain('readCachedAlignments')
    expect(src).toContain('hydrateChapter(focus')
    expect(src).toContain('planSupportRefStreamChapters')
    expect(src).toContain('fallbackNotes')
    expect(src).toContain('planSupportRefQuoteWarmJobs')
    expect(src).toContain('warmScheduler.enqueue')
    expect(src).toContain('reconcileStaleBookFilterWarmJobs')
    expect(src).toContain('isJobPending')
    expect(src).not.toContain('warmChapterQuotes')
    expect(src).not.toContain('batchAlignLinks')
    expect(src).not.toContain('batchAlignInWorker')
    expect(src).not.toMatch(/loader\.loadViewModel/)
    expect(src).not.toMatch(/notes\.map\(\(n\) => n\.id\)/)
  })
})
