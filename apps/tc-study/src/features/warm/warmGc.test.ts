import { describe, expect, test } from 'bun:test'
import { helpsAlignKey } from '../helps/helpsAlignCache'
import { helpsQuoteKey } from '../helps/helpsQuoteCache'
import { markRelationCovered, readWarmCoverage } from './warmCoverage'
import { parseAlignWarmKey, parseQuoteWarmKey, runWarmGc } from './warmGc'

function createFakeAdapter() {
  const store = new Map<string, unknown>()
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      store.set(key, entry)
    },
    async delete(key: string) {
      store.delete(key)
    },
    async getByPrefix(prefix: string) {
      return [...store.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, entry]) => ({ key, entry }))
    },
    async prune() {
      /* no-op */
    },
  }
}

describe('warmGc stamp parse', () => {
  test('parses quote keys without splitting resource slashes', () => {
    const key = helpsQuoteKey({
      helpsKey: 'unfoldingWord/en/tn',
      helpsStamp: 'v45',
      olKey: 'unfoldingWord/el-x-koine/ugnt',
      olStamp: 'v1+2.1.0-usj',
      book: 'TIT',
      chapter: 1,
    })
    expect(parseQuoteWarmKey(key)).toEqual({
      helpsKey: 'unfoldingWord/en/tn',
      helpsStamp: 'v45',
      olKey: 'unfoldingWord/el-x-koine/ugnt',
      olStamp: 'v1+2.1.0-usj',
      book: 'tit',
      chapter: '1',
    })
  })

  test('parses align keys with last-colon book/chapter', () => {
    const key = helpsAlignKey({
      helpsKey: 'unfoldingWord/en/tn',
      helpsStamp: 'v45',
      olKey: 'unfoldingWord/el-x-koine/ugnt',
      olStamp: 'v1+usj',
      targetKey: 'unfoldingWord/es-419/glt',
      targetStamp: 'v2+2000001',
      book: 'MAT',
      chapter: 3,
    })
    expect(parseAlignWarmKey(key)).toEqual({
      helpsKey: 'unfoldingWord/en/tn',
      helpsStamp: 'v45',
      olKey: 'unfoldingWord/el-x-koine/ugnt',
      olStamp: 'v1+usj',
      targetKey: 'unfoldingWord/es-419/glt',
      targetStamp: 'v2+2000001',
      book: 'mat',
      chapter: '3',
    })
  })
})

describe('warmGc stamp mismatch', () => {
  test('deletes chapter rows whose stamp ≠ current after prune', async () => {
    const cache = createFakeAdapter()
    const staleQuote = helpsQuoteKey({
      helpsKey: 'owner/en/tn',
      helpsStamp: 'old',
      olKey: 'owner/el/ugnt',
      olStamp: 'ol1',
      book: 'tit',
      chapter: 1,
    })
    const liveQuote = helpsQuoteKey({
      helpsKey: 'owner/en/tn',
      helpsStamp: 'new',
      olKey: 'owner/el/ugnt',
      olStamp: 'ol1',
      book: 'tit',
      chapter: 2,
    })
    const staleAlign = helpsAlignKey({
      helpsKey: 'owner/en/tn',
      helpsStamp: 'new',
      olKey: 'owner/el/ugnt',
      olStamp: 'ol1',
      targetKey: 'owner/en/ult',
      targetStamp: 'old-t',
      book: 'tit',
      chapter: 1,
    })
    await cache.set(staleQuote, { ok: 1 })
    await cache.set(liveQuote, { ok: 1 })
    await cache.set(staleAlign, { ok: 1 })
    await markRelationCovered(cache, 'quote:owner/en/tn|owner/el/ugnt|tit', 'old|ol1', 3)

    const result = await runWarmGc({
      cache,
      sourceResourceId: 'owner/en/ult',
      textLanguageCode: 'en',
      helpsLanguageCode: 'en',
      currentBook: 'tit',
      stamps: {
        helpsStampByKey: { 'owner/en/tn': 'new' },
        olKey: 'owner/el/ugnt',
        olStamp: 'ol1',
        targetStampByKey: { 'owner/en/ult': 'new-t' },
      },
    })

    expect(result.pruned).toBe(true)
    expect(cache.store.has(staleQuote)).toBe(false)
    expect(cache.store.has(liveQuote)).toBe(true)
    expect(cache.store.has(staleAlign)).toBe(false)
    const coverage = await readWarmCoverage(cache)
    expect(coverage['quote:owner/en/tn|owner/el/ugnt|tit']).toBeUndefined()
  })
})
