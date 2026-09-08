import { describe, expect, test } from 'bun:test'
import {
  HELPS_QUOTE_VERSION,
  helpsQuoteKey,
  mergeAndWriteCachedQuoteTokens,
  olContentStamp,
  readCachedQuoteTokens,
  readCachedQuoteTokensForChapters,
  subtractCachedQuoteHits,
  toCachedQuoteTokens,
  writeCachedQuoteTokens,
} from './helpsQuoteCache'
import { wrapVersioned } from '../cache/versionedEnvelope'

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
  }
}

describe('helpsQuoteCache', () => {
  test('olContentStamp includes USJ processing version', () => {
    const stamp = olContentStamp({ version: 'v45' }, '2.1.0-usj')
    expect(stamp).toBe('v45+2.1.0-usj')
  })

  test('builds chapter-scoped keys', () => {
    expect(
      helpsQuoteKey({
        helpsKey: 'unfoldingWord/en/tn',
        helpsStamp: 'v45',
        olKey: 'unfoldingWord/el-x-koine/ugnt',
        olStamp: 'v1+2.1.0-usj',
        book: 'TIT',
        chapter: 1,
      })
    ).toBe(
      'helps-quote:unfoldingWord/en/tn@v45:unfoldingWord/el-x-koine/ugnt@v1+2.1.0-usj:tit:1'
    )
  })

  test('round-trips tokens with TTL envelope', async () => {
    const cache = createFakeAdapter()
    const args = {
      helpsKey: 'owner/en/tn',
      helpsStamp: 'v1',
      olKey: 'owner/el/ugnt',
      olStamp: 'v1+2.1.0-usj',
      book: 'tit',
      chapter: 1,
    }
    const tokens = {
      'tn-1': toCachedQuoteTokens([
        { id: 1, text: 'Παῦλος', type: 'word', occurrence: 1, content: 'Παῦλος' },
      ]),
    }
    await writeCachedQuoteTokens(cache, args, tokens)
    const entry = cache.store.get(helpsQuoteKey(args)) as { expiresAt?: string; version?: number }
    expect(entry.expiresAt).toBeTruthy()
    expect(entry.version).toBe(HELPS_QUOTE_VERSION)
    expect(await readCachedQuoteTokens(cache, args)).toEqual(tokens)
  })

  test('version mismatch returns null', async () => {
    const cache = createFakeAdapter()
    const args = {
      helpsKey: 'owner/en/tn',
      helpsStamp: 'v1',
      olKey: 'owner/el/ugnt',
      olStamp: 'v1+usj',
      book: 'tit',
      chapter: 1,
    }
    await cache.set(helpsQuoteKey(args), wrapVersioned({ 'tn-1': [] }, HELPS_QUOTE_VERSION + 1))
    expect(await readCachedQuoteTokens(cache, args)).toBeNull()
  })

  test('subtractCachedQuoteHits separates hits and misses', () => {
    const needs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const cached = { a: [], c: [{ id: 1, text: 'x', type: 'word', occurrence: 1, content: 'x' }] }
    const { hits, misses } = subtractCachedQuoteHits(needs, cached)
    expect([...hits.keys()]).toEqual(['a', 'c'])
    expect(misses.map((m) => m.id)).toEqual(['b'])
  })

  test('mergeAndWrite merges into existing chapter rows', async () => {
    const cache = createFakeAdapter()
    const base = {
      helpsKey: 'owner/en/tn',
      helpsStamp: 'v1',
      olKey: 'owner/el/ugnt',
      olStamp: 'v1+usj',
      book: 'tit',
    }
    await writeCachedQuoteTokens(
      cache,
      { ...base, chapter: 1 },
      { a: toCachedQuoteTokens([{ id: 1, text: 'a', type: 'word', occurrence: 1, content: 'a' }]) }
    )
    await mergeAndWriteCachedQuoteTokens(
      cache,
      base,
      {
        b: toCachedQuoteTokens([{ id: 2, text: 'b', type: 'word', occurrence: 1, content: 'b' }]),
      },
      () => 1
    )
    const row = await readCachedQuoteTokens(cache, { ...base, chapter: 1 })
    expect(Object.keys(row ?? {}).sort()).toEqual(['a', 'b'])
  })

  test('readCachedQuoteTokensForChapters merges sparse chapters', async () => {
    const cache = createFakeAdapter()
    const base = {
      helpsKey: 'owner/en/tn',
      helpsStamp: 'v1',
      olKey: 'owner/el/ugnt',
      olStamp: 'v1+usj',
      book: 'tit',
    }
    await writeCachedQuoteTokens(cache, { ...base, chapter: 1 }, {
      a: toCachedQuoteTokens([{ id: 1, text: 'a', type: 'word', occurrence: 1, content: 'a' }]),
    })
    await writeCachedQuoteTokens(cache, { ...base, chapter: 3 }, {
      c: toCachedQuoteTokens([{ id: 3, text: 'c', type: 'word', occurrence: 1, content: 'c' }]),
    })
    const merged = await readCachedQuoteTokensForChapters(cache, {
      ...base,
      chapters: [1, 3],
    })
    expect(Object.keys(merged).sort()).toEqual(['a', 'c'])
  })
})
