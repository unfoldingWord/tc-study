import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldEnqueueOriginalLanguageDownload } from './ensureOriginalLanguageDownload'

describe('shouldEnqueueOriginalLanguageDownload', () => {
  test('enqueues idle missing UHB once', () => {
    expect(
      shouldEnqueueOriginalLanguageDownload({
        resourceKey: 'unfoldingWord/hbo/uhb',
      })
    ).toBe(true)
    const src = readFileSync(join(import.meta.dir, 'ensureOriginalLanguageDownload.ts'), 'utf8')
    expect(src).toContain('fallbackIngredientCount')
  })

  test('does not re-enqueue when already queued, complete, or busy', () => {
    expect(
      shouldEnqueueOriginalLanguageDownload({
        resourceKey: 'unfoldingWord/hbo/uhb',
        alreadyEnqueuedKey: 'unfoldingWord/hbo/uhb',
      })
    ).toBe(false)
    expect(
      shouldEnqueueOriginalLanguageDownload({
        resourceKey: 'unfoldingWord/hbo/uhb',
        queuedKeys: ['unfoldingWord/hbo/uhb'],
      })
    ).toBe(false)
    expect(
      shouldEnqueueOriginalLanguageDownload({
        resourceKey: 'unfoldingWord/hbo/uhb',
        completedKeys: ['unfoldingWord/hbo/uhb'],
      })
    ).toBe(false)
    expect(
      shouldEnqueueOriginalLanguageDownload({
        resourceKey: 'unfoldingWord/hbo/uhb',
        isDownloading: true,
      })
    ).toBe(false)
  })
})

describe('live quote path vs lane 2 skip', () => {
  test('lane 2 skip does not own current-chapter quote build', () => {
    const quoteSrc = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useQuoteTokens.ts'
      ),
      'utf8'
    )
    const olSrc = readFileSync(
      join(
        import.meta.dir,
        '../../components/resources/WordsLinksViewer/hooks/useOriginalLanguageContent.ts'
      ),
      'utf8'
    )
    const admitSrc = readFileSync(join(import.meta.dir, '../warm/warmAdmitPlan.ts'), 'utf8')
    const helpsSrc = readFileSync(
      join(import.meta.dir, '../../components/resources/CombinedHelpsViewer/index.tsx'),
      'utf8'
    )
    expect(admitSrc).toContain('skipCurrent: visible')
    expect(quoteSrc).toContain('useOriginalLanguageContent')
    expect(quoteSrc).toContain('buildQuotesViaWorkerOrSync')
    expect(quoteSrc).toContain('olBlocked')
    expect(quoteSrc).not.toContain('collectLane2Groups')
    expect(olSrc).toContain('enqueueOriginalLanguageDownload')
    expect(olSrc).toContain('setOriginalContent(null)')
    expect(olSrc).toContain('completedResourceKeys')
    expect(olSrc).toContain('if (s.error)')
    expect(helpsSrc).toContain('quotesBlocked')
  })
})
