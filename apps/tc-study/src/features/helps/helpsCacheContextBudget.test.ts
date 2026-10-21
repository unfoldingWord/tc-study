import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  HELPS_CACHE_CONTEXT_BUDGET_MS,
  HELPS_CACHE_HYDRATE_BUDGET_MS,
  settleHelpsCacheContext,
  settleHelpsWorkerOrSync,
  shouldSyncHelpsAlign,
} from './helpsCacheContextBudget'
import { resolveHelpsQuoteStatus } from './resolveHelpsQuoteStatus'
import { planAlignCacheHydrate } from './alignCacheHydratePlan'

describe('settleHelpsCacheContext', () => {
  test('returns resolved context within budget', async () => {
    const value = await settleHelpsCacheContext(
      Promise.resolve({ helpsStamp: 'v1' }),
      200
    )
    expect(value).toEqual({ helpsStamp: 'v1' })
  })

  test('times out hung catalog metadata so live quote/align can proceed', async () => {
    const hung = new Promise<{ ok: true }>(() => {
      /* never settles — simulates stalled IDB catalog get */
    })
    const started = Date.now()
    const value = await settleHelpsCacheContext(hung, 40)
    expect(value).toBeNull()
    expect(Date.now() - started).toBeLessThan(200)
  })

  test('treats rejection as null (live path)', async () => {
    const value = await settleHelpsCacheContext(
      Promise.reject(new Error('catalog down')),
      200
    )
    expect(value).toBeNull()
  })

  test('hydrate budget is much longer than soft live budget', () => {
    expect(HELPS_CACHE_HYDRATE_BUDGET_MS).toBeGreaterThanOrEqual(5_000)
    expect(HELPS_CACHE_HYDRATE_BUDGET_MS).toBeGreaterThan(
      HELPS_CACHE_CONTEXT_BUDGET_MS * 10
    )
  })
})

describe('settleHelpsWorkerOrSync', () => {
  test('sync only when worker rejects — does not time out into main thread', async () => {
    const value = await settleHelpsWorkerOrSync(
      Promise.reject(new Error('worker down')),
      () => 'sync'
    )
    expect(value).toBe('sync')
  })

  test('prefers worker result', async () => {
    const value = await settleHelpsWorkerOrSync(
      Promise.resolve('worker'),
      () => 'sync'
    )
    expect(value).toBe('worker')
  })
})

describe('shouldSyncHelpsAlign', () => {
  test('sync only for tiny batches or when chips cannot be produced yet', () => {
    expect(
      shouldSyncHelpsAlign({
        linkCount: 54,
        syncMaxLinks: 8,
        quoteBuildReady: false,
        linksHaveQuoteTokens: false,
      })
    ).toBe(true)
    expect(
      shouldSyncHelpsAlign({
        linkCount: 54,
        syncMaxLinks: 8,
        quoteBuildReady: true,
        linksHaveQuoteTokens: false,
      })
    ).toBe(true)
    // Chapter-sized batches with quote tokens ready → worker (not main thread).
    expect(
      shouldSyncHelpsAlign({
        linkCount: 54,
        syncMaxLinks: 8,
        quoteBuildReady: true,
        linksHaveQuoteTokens: true,
      })
    ).toBe(false)
    expect(
      shouldSyncHelpsAlign({
        linkCount: 4,
        syncMaxLinks: 8,
        quoteBuildReady: true,
        linksHaveQuoteTokens: true,
      })
    ).toBe(true)
    expect(
      shouldSyncHelpsAlign({
        linkCount: 200,
        syncMaxLinks: 8,
        quoteBuildReady: true,
        linksHaveQuoteTokens: true,
      })
    ).toBe(false)
  })
})

describe('wait-for-tokens must not false-settle ol-fallback', () => {
  test('plan waits only when cache hit and no target tokens', () => {
    expect(
      planAlignCacheHydrate({
        canReconstruct: false,
        hitCount: 10,
        missCount: 0,
        hasAnyTargetTokens: false,
      })
    ).toBe('wait-for-tokens')
    expect(
      planAlignCacheHydrate({
        canReconstruct: false,
        hitCount: 10,
        missCount: 0,
        hasAnyTargetTokens: true,
      })
    ).toBe('live-align')
  })

  test('pending while waiting for tokens even if quote-build already settled', () => {
    expect(
      resolveHelpsQuoteStatus({
        hasAlignedTokens: false,
        alignmentPending: true,
        olQuote: 'πρεσβύτας',
      })
    ).toBe('pending')
  })
})

describe('quote settle + book-nav wiring', () => {
  const root = join(import.meta.dir, '../..')

  test('quote + align hooks budget catalog stamps; chapter builds stay on workers', () => {
    const quotes = readFileSync(
      join(root, 'components/resources/WordsLinksViewer/hooks/useQuoteTokens.ts'),
      'utf8'
    )
    const aligned = readFileSync(
      join(root, 'components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'),
      'utf8'
    )
    const prepareClient = readFileSync(join(root, 'workers/prepareClient.ts'), 'utf8')
    const warmClient = readFileSync(join(root, 'workers/warmClient.ts'), 'utf8')
    const warmWorker = readFileSync(join(root, 'workers/warm.worker.ts'), 'utf8')
    expect(quotes).toContain('settleHelpsCacheContext')
    expect(quotes).toContain('HELPS_CACHE_HYDRATE_BUDGET_MS')
    expect(quotes).toContain('HELPS_SYNC_MAX_LINKS')
    expect(quotes).toContain('batchQuotesInWorker')
    expect(quotes).not.toContain('HELPS_PRIORITY_ROWS * 4')
    expect(aligned).toContain('retrySettledMisses')
    expect(aligned).toContain('targetTokensAreAlignReady')
    expect(aligned).toContain('settleHelpsCacheContext')
    expect(aligned).toContain('HELPS_CACHE_HYDRATE_BUDGET_MS')
    expect(aligned).toContain('shouldSyncHelpsAlign')
    expect(aligned).toContain('batchAlignInWorker')
    expect(aligned).toContain('paint-display')
    expect(aligned).toMatch(/wait-for-tokens[\s\S]*alignmentPending:\s*true/)
    expect(prepareClient).toContain('batchQuotesOnWarmWorker')
    expect(prepareClient).toContain('batchAlignOnWarmWorker')
    expect(prepareClient).toContain('using prepare.worker')
    expect(prepareClient).toContain('PREPARE_RPC_TIMEOUT_MS')
    expect(warmClient).toContain('batchQuotesOnWarmWorker')
    expect(warmClient).toContain('WARM_RPC_TIMEOUT_MS')
    expect(warmClient).toContain('recycleDedicatedWorker')
    expect(warmWorker).toContain("type === 'batch-quotes'")
    expect(warmWorker).toContain("type === 'batch-align'")
    expect(warmWorker).toContain('runBatchQuotes')
    expect(HELPS_CACHE_CONTEXT_BUDGET_MS).toBeGreaterThan(0)
    expect(HELPS_CACHE_HYDRATE_BUDGET_MS).toBeGreaterThan(HELPS_CACHE_CONTEXT_BUDGET_MS)
  })

  test('book-nav guards remain wired (no wrong-book token reintroduce)', () => {
    const prepared = readFileSync(
      join(import.meta.dir, '../scripture/usePreparedChapter.ts'),
      'utf8'
    )
    const viewer = readFileSync(
      join(root, 'components/resources/ScriptureViewer/index.tsx'),
      'utf8'
    )
    const broadcast = readFileSync(
      join(root, 'components/resources/ScriptureViewer/hooks/useTokenBroadcast.ts'),
      'utf8'
    )
    expect(prepared).toContain('preparedChapterStateAfterNavPeek')
    expect(viewer).toContain('resolveScriptureBroadcastBookCode')
    expect(broadcast).toContain('viewModelForScriptureBroadcast')
    expect(broadcast).toContain('fullChapterForScriptureBroadcast')
    expect(alignedContainsContentStamp()).toBe(true)
  })
})

function alignedContainsContentStamp(): boolean {
  const aligned = readFileSync(
    join(
      import.meta.dir,
      '../../components/resources/WordsLinksViewer/hooks/useAlignedTokens.ts'
    ),
    'utf8'
  )
  return (
    aligned.includes('scriptureTokensContentStamp') && aligned.includes('tokenContentStamp')
  )
}
