import { describe, expect, test } from 'bun:test'
import { decodeWords, indexStrongKey, indexVersesKey, type CacheRow, type RawFound, type RawRead, type RawWrite } from '@bt-synergy/language-pack'
import type { BookStampSource } from '@bt-synergy/resource-catalog'
import { usjScriptureChapterKey, usjScriptureKey } from '@bt-synergy/scripture-loader'
import { buildBookIndex, type BookIndexStrong, type BookIndexVerses } from './bookIndex'
import { addOriginalsIndex } from './originalsIndex'

const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const UHB = 'unfoldingWord/hbo/uhb'
const TAG = 'v0.34'
const BLOBS: Record<string, string> = {
  tit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
  '3jn': '0f1e2d3c4b5a69788796a5b4c3d2e1f0deadbeef',
}
const UGNT_ROW: BookStampSource = {
  version: TAG,
  release: { tag_name: TAG, published_at: '2023-09-27T02:19:31Z' },
  contentMetadata: { bookBlobs: BLOBS, bookBlobsRef: TAG },
}

// USJ nodes in the shape the USJ processor writes them.
const c = (number: string) => ({ type: 'chapter', marker: 'c', number, sid: `X ${number}` })
const v = (number: string) => ({ type: 'verse', marker: 'v', number, sid: `X ${number}` })
const w = (text: string, strong: string, lemma: string) => ({ type: 'char', marker: 'w', content: [text], strong, lemma })
const p = (...content: unknown[]) => ({ type: 'para', marker: 'p', content })
const usj = (...content: unknown[]) => ({ type: 'USJ', version: '3.0', content })

/** Titus 1:1 and 2:11 (χάρις is word 5); 3 John 1:1 and 1:6 (Γάϊος only there). */
const CHAPTERS: Record<string, Array<{ chapter: number; usj: unknown }>> = {
  tit: [
    { chapter: 1, usj: usj(c('1'), p(v('1'), w('Παῦλος', 'G39720', 'Παῦλος'), w('δοῦλος', 'G14010', 'δοῦλος'), w('Θεοῦ', 'G23160', 'θεός'))) },
    { chapter: 2, usj: usj(c('2'), p(v('11'), w('Ἐπεφάνη', 'G20140', 'ἐπιφαίνω'), w('γὰρ', 'G10630', 'γάρ'), w('χάρις', 'G54850', 'χάρις'), w('Θεοῦ', 'G23160', 'θεός'))) },
  ],
  '3jn': [{ chapter: 1, usj: usj(c('1'), p(v('1'), w('Ὁ', 'G35880', 'ὁ'), w('πρεσβύτερος', 'G42450', 'πρεσβύτερος'), w('Γαΐῳ', 'G10500', 'Γάϊος'), v('6'), w('Θεοῦ', 'G23160', 'θεός'))) }],
}

/** A book's rows as a download leaves them: the thin book row, then one row per chapter. */
function bookRows(key: string, book: string, chapters: Array<{ chapter: number; usj: unknown }>): CacheRow[] {
  return [
    { key: usjScriptureKey(key, book), entry: { content: { book, bookCode: book, metadata: {}, chapterNumbers: chapters.map((ch) => ch.chapter) }, timestamp: 1 } },
    ...chapters.map((ch) => ({ key: usjScriptureChapterKey(key, book, ch.chapter), entry: { content: { usj: ch.usj, metadata: {} }, timestamp: 1 } })),
  ]
}

/** A cache store in memory with the IndexedDB adapter's raw reads and writes. */
function memoryCache(rows: CacheRow[]) {
  const store = new Map(rows.map((r) => [r.key, r.entry]))
  const under = (prefix: string) => [...store.keys()].filter((k) => k >= prefix && k <= `${prefix}\uffff`).sort()
  return {
    store,
    getByPrefix: async (prefix: string) => under(prefix).map((key) => ({ key, entry: store.get(key) })),
    putRawMany: async (list: CacheRow[]) => {
      for (const r of list) store.set(r.key, r.entry)
    },
    transactRaw: async (read: RawRead, decide: (found: RawFound) => RawWrite) => {
      const found: RawFound = {
        rows: new Map(read.keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)])),
        prefixKeys: new Map(read.prefixes.map((prefix) => [prefix, under(prefix)])),
      }
      const write = decide(found)
      for (const r of write.puts) store.set(r.key, r.entry)
      for (const k of write.deletes) store.delete(k)
    },
  }
}

// Of another original the catalog does not name: never touched.
const UHB_ROW: CacheRow = { key: indexStrongKey(UHB, 'H0853', 'rut'), entry: { v: 1, stamp: 'g3d230a0aca', lemma: 'אֵת', words: 'AA==', timestamp: 1 } }

function stores(extra: CacheRow[] = []) {
  const cache = memoryCache([...bookRows(UGNT, 'tit', CHAPTERS.tit!), ...bookRows(UGNT, '3jn', CHAPTERS['3jn']!), UHB_ROW, ...extra])
  const catalog = { get: async (key: string) => (key === UGNT ? UGNT_ROW : null) }
  return { cache, catalog }
}

const indexKeysOf = (store: Map<string, unknown>, original: string) =>
  [...store.keys()].filter((k) => k.startsWith(`index:verses:${original}:`) || k.startsWith(`index:strong:${original}:`)).sort()

describe('addOriginalsIndex', () => {
  test('writes the index rows of every book of each original the catalog has, stamped with the book blob', async () => {
    const { cache, catalog } = stores()
    const result = await addOriginalsIndex({ cache, catalog }, [UGNT, UHB])
    // Titus: 6 codes and its verses row; 3 John: 4 codes and its verses row.
    expect(result).toEqual([{ key: UGNT, books: 2, rows: 12 }])

    const expected = Object.entries(CHAPTERS).flatMap(([book, chapters]) => buildBookIndex(UGNT, book, chapters, `g${BLOBS[book]!.slice(0, 10)}`))
    expect(indexKeysOf(cache.store, UGNT)).toEqual(expected.map((r) => r.key).sort())
    for (const row of expected) expect(cache.store.get(row.key)).toEqual({ ...row.value, timestamp: expect.any(Number) })
    for (const key of indexKeysOf(cache.store, UGNT)) {
      const book = key.slice(key.lastIndexOf(':') + 1)
      expect((cache.store.get(key) as { stamp: string }).stamp).toBe(`g${BLOBS[book]!.slice(0, 10)}`)
    }
    expect(decodeWords((cache.store.get(indexStrongKey(UGNT, 'G5485', 'tit')) as BookIndexStrong).words)).toEqual([5])
    expect((cache.store.get(indexVersesKey(UGNT, '3jn')) as BookIndexVerses).words).toBe(4)
    expect(cache.store.get(UHB_ROW.key)).toEqual(UHB_ROW.entry)
  })

  test('a second run with a book gone leaves no rows of that book', async () => {
    const { cache, catalog } = stores()
    await addOriginalsIndex({ cache, catalog }, [UGNT])
    for (const key of [...cache.store.keys()]) if (key.startsWith(usjScriptureKey(UGNT, '3jn'))) cache.store.delete(key)

    expect(await addOriginalsIndex({ cache, catalog }, [UGNT])).toEqual([{ key: UGNT, books: 1, rows: 7 }])
    const left = indexKeysOf(cache.store, UGNT)
    expect(left.filter((k) => k.endsWith(':3jn'))).toEqual([])
    expect(left.some((k) => k.includes(':G1050:'))).toBe(false)
    expect(left).toEqual(buildBookIndex(UGNT, 'tit', CHAPTERS.tit!, 'x').map((r) => r.key).sort())
    expect(cache.store.get(UHB_ROW.key)).toEqual(UHB_ROW.entry)
  })

  test('a book row whose chapters are not in the store gets no index', async () => {
    const { cache, catalog } = stores([bookRows(UGNT, 'jud', [{ chapter: 1, usj: usj() }])[0]!])
    expect(await addOriginalsIndex({ cache, catalog }, [UGNT])).toEqual([{ key: UGNT, books: 2, rows: 12 }])
    expect(indexKeysOf(cache.store, UGNT).some((k) => k.endsWith(':jud'))).toBe(false)
  })
})
