import { describe, expect, test } from 'bun:test'
import {
  HELPS_ALIGN_VERSION,
  alignRelationId,
  helpsAlignBookPrefix,
  helpsAlignKey,
  helpsAlignTargetsPrefix,
  mergeAndWriteCachedAlignments,
  quoteRelationId,
  readCachedAlignments,
  readCachedAlignmentsForChapters,
  subtractCachedAlignHits,
  targetContentStamp,
  writeCachedAlignments,
} from './helpsAlignCache'
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

describe('helpsAlignCache', () => {
  test('targetContentStamp includes SCRIPTURE_PREPARE_VERSION', () => {
    const stamp = targetContentStamp({ version: 'v45' }, 2_000_001)
    expect(stamp).toBe('v45+2000001')
  })

  test('builds chapter-scoped 3-way keys', () => {
    expect(
      helpsAlignKey({
        helpsKey: 'unfoldingWord/en/tn',
        helpsStamp: 'v45',
        olKey: 'unfoldingWord/el-x-koine/ugnt',
        olStamp: 'v1+2.1.0-usj',
        targetKey: 'unfoldingWord/en/ult',
        targetStamp: 'v1+2000001',
        book: 'TIT',
        chapter: 1,
      })
    ).toBe(
      'helps-align:unfoldingWord/en/tn@v45:unfoldingWord/el-x-koine/ugnt@v1+2.1.0-usj:unfoldingWord/en/ult@v1+2000001:tit:1'
    )
  })

  test('book and targets prefixes', () => {
    const bookPrefix = helpsAlignBookPrefix({
      helpsKey: 'owner/en/tn',
      helpsStamp: 'v1',
      olKey: 'owner/el/ugnt',
      olStamp: 'v1+usj',
      targetKey: 'owner/en/ult',
      targetStamp: 'v1+1',
      book: 'tit',
    })
    expect(bookPrefix).toBe(
      'helps-align:owner/en/tn@v1:owner/el/ugnt@v1+usj:owner/en/ult@v1+1:tit:'
    )
    expect(
      helpsAlignTargetsPrefix({
        helpsKey: 'owner/en/tn',
        helpsStamp: 'v1',
        olKey: 'owner/el/ugnt',
        olStamp: 'v1+usj',
      })
    ).toBe('helps-align:owner/en/tn@v1:owner/el/ugnt@v1+usj:')
  })

  test('relation ids are book-scoped without chapter', () => {
    expect(
      alignRelationId({
        helpsKey: 'a/en/tn',
        olKey: 'a/el/ugnt',
        targetKey: 'a/en/ult',
        book: 'TIT',
      })
    ).toBe('align:a/en/tn|a/el/ugnt|a/en/ult|tit')
    expect(quoteRelationId({ helpsKey: 'a/en/tn', olKey: 'a/el/ugnt', book: 'tit' })).toBe(
      'quote:a/en/tn|a/el/ugnt|tit'
    )
  })

  test('round-trips alignments with TTL envelope', async () => {
    const cache = createFakeAdapter()
    const args = {
      helpsKey: 'owner/en/tn',
      helpsStamp: 'v1',
      olKey: 'owner/el/ugnt',
      olStamp: 'v1+usj',
      targetKey: 'owner/en/ult',
      targetStamp: 'v1+1',
      book: 'tit',
      chapter: 1,
    }
    const alignments = { 'tn-1': { p: [0, 2], m: 1 as const } }
    await writeCachedAlignments(cache, args, alignments)
    const entry = cache.store.get(helpsAlignKey(args)) as { expiresAt?: string; version?: number }
    expect(entry.expiresAt).toBeTruthy()
    expect(entry.version).toBe(HELPS_ALIGN_VERSION)
    expect(await readCachedAlignments(cache, args)).toEqual(alignments)
  })

  test('version mismatch returns null', async () => {
    const cache = createFakeAdapter()
    const args = {
      helpsKey: 'owner/en/tn',
      helpsStamp: 'v1',
      olKey: 'owner/el/ugnt',
      olStamp: 'v1+usj',
      targetKey: 'owner/en/ult',
      targetStamp: 'v1+1',
      book: 'tit',
      chapter: 1,
    }
    await cache.set(
      helpsAlignKey(args),
      wrapVersioned({ 'tn-1': { p: [], m: 0 } }, HELPS_ALIGN_VERSION + 1)
    )
    expect(await readCachedAlignments(cache, args)).toBeNull()
  })

  test('subtractCachedAlignHits separates hits and misses', () => {
    const needs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const cached = {
      a: { p: [], m: 0 as const },
      c: { p: [1], m: 1 as const },
    }
    const { hits, misses } = subtractCachedAlignHits(needs, cached)
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
      targetKey: 'owner/en/ult',
      targetStamp: 'v1+1',
      book: 'tit',
    }
    await writeCachedAlignments(
      cache,
      { ...base, chapter: 1 },
      { a: { p: [0], m: 1 } }
    )
    await mergeAndWriteCachedAlignments(
      cache,
      base,
      { b: { p: [2], m: 2 } },
      () => 1
    )
    const row = await readCachedAlignments(cache, { ...base, chapter: 1 })
    expect(Object.keys(row ?? {}).sort()).toEqual(['a', 'b'])
  })

  test('readCachedAlignmentsForChapters merges sparse chapters', async () => {
    const cache = createFakeAdapter()
    const base = {
      helpsKey: 'owner/en/tn',
      helpsStamp: 'v1',
      olKey: 'owner/el/ugnt',
      olStamp: 'v1+usj',
      targetKey: 'owner/en/ult',
      targetStamp: 'v1+1',
      book: 'tit',
    }
    await writeCachedAlignments(cache, { ...base, chapter: 1 }, { a: { p: [0], m: 1 } })
    await writeCachedAlignments(cache, { ...base, chapter: 3 }, { c: { p: [1], m: 1 } })
    const merged = await readCachedAlignmentsForChapters(cache, {
      ...base,
      chapters: [1, 3],
    })
    expect(Object.keys(merged).sort()).toEqual(['a', 'c'])
  })
})
