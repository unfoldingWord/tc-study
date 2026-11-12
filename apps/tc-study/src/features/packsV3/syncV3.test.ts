import { describe, expect, it } from 'bun:test'
import { ClientError, memoryStore, type LanguagePackClient } from '@bt-synergy/language-pack-client'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { createPacksV3 } from './client'
import { type CacheAdapter, type CatalogAdapter, syncLanguageV3, syncRecordKey } from './syncV3'
import { buildSample, fakeFetch, REVISED_NOTE_SUFFIX, type Sample } from './testing/sample'

const TN = 'es-419_gl/es-419/tn'
const GLT = 'es-419_gl/es-419/glt'

/** In-memory adapters with the methods of the app's: they count what is written. */
function adapters() {
  const rows = new Map<string, unknown>()
  const catalogRows = new Map<string, ResourceMetadata>()
  const writes = { cache: 0, catalog: 0, deletes: 0 }
  const cache: CacheAdapter = {
    get: async (k) => rows.get(k) ?? null,
    getByPrefix: async (p) => [...rows].filter(([k]) => k.startsWith(p)).map(([key, entry]) => ({ key, entry })),
    putRawMany: async (rs) => {
      writes.cache++
      for (const r of rs) rows.set(r.key, r.entry)
    },
    deleteMany: async (ks) => {
      writes.deletes++
      for (const k of ks) rows.delete(k)
    },
  }
  const catalog: CatalogAdapter = {
    get: async (k) => catalogRows.get(k) ?? null,
    set: async (k, m) => void (writes.catalog++, catalogRows.set(k, m)),
  }
  return { rows, catalogRows, writes, cache, catalog }
}
const keysOf = (rows: Map<string, unknown>, prefix: string) => [...rows.keys()].filter((k) => k.startsWith(prefix))
const segments = (urls: string[]) => urls.filter((u) => u.includes('/seg/'))

async function clientOf(fetch: typeof globalThis.fetch, ...samples: Sample[]): Promise<LanguagePackClient> {
  return createPacksV3({ fetch, store: memoryStore(), trustedKeys: Object.fromEntries(samples.map((s) => [s.keyId, s.publicKey])) })
}

describe('syncLanguageV3', () => {
  it('writes the rows of Titus, its original, the article groups, the catalog entries and the receipts', async () => {
    const sample = await buildSample()
    const client = await clientOf(fakeFetch(sample), sample)
    const a = adapters()
    const out = await syncLanguageV3('es-419', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog })
    expect(out).toEqual({ kind: 'done', books: ['tit'] })
    expect(keysOf(a.rows, `scripture-usj:${GLT}:tit`).length).toBeGreaterThan(3)
    expect(keysOf(a.rows, 'scripture-usj:unfoldingWord/el-x-koine/ugnt:tit').length).toBeGreaterThan(3)
    expect(keysOf(a.rows, `tn:${TN}:tit`).length).toBeGreaterThan(1)
    expect(keysOf(a.rows, 'tq:').length).toBeGreaterThan(1)
    expect(keysOf(a.rows, 'twl:').length).toBe(1)
    expect(keysOf(a.rows, 'es-419_gl/es-419/tw/bible/kt/').length).toBeGreaterThan(5)
    expect(keysOf(a.rows, 'es-419_gl/es-419/ta/translate/').length).toBe(2)
    expect(keysOf(a.rows, 'helps-text:tw-title:').length).toBeGreaterThan(5)
    // The stamp of the helps-text rows is that of the catalog row (the release tag).
    expect(keysOf(a.rows, 'helps-text:ta-title:').every((k) => k.includes('es-419_gl/es-419/ta@v4:'))).toBe(true)
    // Catalog entries: one per resource, with the books held.
    expect(a.catalogRows.get(GLT)).toMatchObject({ resourceKey: GLT, owner: 'es-419_gl', language: 'es-419', resourceId: 'glt', subject: 'Aligned Bible', version: 'v42', release: { tag_name: 'v42' } })
    expect(a.catalogRows.get(GLT)!.contentMetadata?.downloadedIngredients).toEqual(['tit'])
    expect(a.catalogRows.get(TN)!.contentMetadata?.ingredients?.map((i) => i.identifier)).toEqual(['tit'])
    expect(a.catalogRows.has('unfoldingWord/el-x-koine/ugnt')).toBe(true)
    // Receipts of the resources that are whole: Titus is the only book the pack lists.
    const receipt = a.rows.get(`resource:${GLT}`) as { metadata: Record<string, unknown> }
    expect(receipt.metadata).toMatchObject({ downloadComplete: true, releaseStamp: 'v42', downloadMethod: 'format3' })
    expect(a.rows.has('resource:es-419_gl/es-419/tw')).toBe(true)
    expect(a.rows.has('resource:es-419_gl/es-419/obs')).toBe(false) // OBS is not installed
  }, 120_000)

  it('a second sync with no change fetches only the catalog and writes nothing', async () => {
    const sample = await buildSample()
    const fetch = fakeFetch(sample)
    const client = await clientOf(fetch, sample)
    const a = adapters()
    await syncLanguageV3('es-419', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog })
    const [seen, writes] = [fetch.urls.length, { ...a.writes }]
    const out = await syncLanguageV3('es-419', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog })
    expect(out).toEqual({ kind: 'done', books: ['tit'] })
    const asked = fetch.urls.slice(seen)
    expect(asked.length).toBeGreaterThan(0)
    expect(asked.every((u) => u.endsWith('/catalog'))).toBe(true)
    expect(a.writes).toEqual(writes)
  }, 120_000)

  it('a new revision replaces the rows of the unit that changed and the derived rows of its book, and keeps the others', async () => {
    const [one, two] = [await buildSample(1), await buildSample(2)]
    let current = fakeFetch(one)
    const fetch = ((i: RequestInfo | URL) => current(i)) as typeof globalThis.fetch
    const client = await clientOf(fetch, one, two)
    const a = adapters()
    await syncLanguageV3('es-419', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog })
    const noteOf = () => JSON.stringify(a.rows.get(`tn:${TN}:tit:1`))
    expect(noteOf()).not.toContain(REVISED_NOTE_SUFFIX)
    // What the warm worker derives from Titus, and rows of another book and another source that must stay.
    const derived = ['prepared:notes:es-419_gl/es-419/tn:tit:1:light', 'helps-quote:x@a:y@b:tit:1', 'helps-align:x@a:y@b:z@c:tit:2']
    const others = ['prepared:notes:es-419_gl/es-419/tn:rut:1:light', 'helps-quote:x@a:y@b:rut:1', 'helps-align:x@a:y@b:z@c:rut:1', 'scripture-usj:other/es/ult:tit:1']
    for (const k of [...derived, ...others]) a.rows.set(k, { content: 'x' })
    const orig = JSON.stringify(a.rows.get('scripture-usj:unfoldingWord/el-x-koine/ugnt:tit:1'))
    const tw = a.rows.get('es-419_gl/es-419/tw/bible/kt/grace')
    const before = { ...a.writes }
    const sigBefore = { ...(a.rows.get(syncRecordKey('es-419')) as { content: { units: Record<string, string> } }).content.units }
    current = fakeFetch(two)
    expect(await syncLanguageV3('es-419', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog })).toEqual({ kind: 'done', books: ['tit'] })
    expect(noteOf()).toContain(REVISED_NOTE_SUFFIX)
    for (const k of derived) expect(a.rows.has(k)).toBe(false)
    for (const k of others) expect(a.rows.has(k)).toBe(true)
    expect(JSON.stringify(a.rows.get('scripture-usj:unfoldingWord/el-x-koine/ugnt:tit:1'))).toBe(orig)
    expect(a.rows.get('es-419_gl/es-419/tw/bible/kt/grace')).toBe(tw)
    expect(a.writes.deletes).toBe(before.deletes + 1) // only the changed book was dropped
    const record = (a.rows.get(syncRecordKey('es-419')) as { content: { units: Record<string, string> } }).content.units
    expect(record['art:tw:kt']).toBe(sigBefore['art:tw:kt'])
    expect(record['orig:tit']).toBe(sigBefore['orig:tit'])
    expect(record['book:tit']).not.toBe(sigBefore['book:tit'])
  }, 120_000)

  it('a network that drops mid-install leaves no row for the cut unit, says failed, and the retry fetches only what is missing', async () => {
    const sample = await buildSample()
    const good = fakeFetch(sample)
    let segs = 0
    let cut = true
    const fetch = (async (i: RequestInfo | URL) => {
      if (cut && String(i).includes('/seg/') && ++segs > 2) throw new TypeError('network down')
      return good(i)
    }) as typeof globalThis.fetch
    const client = await clientOf(fetch, sample)
    const a = adapters()
    const out = await syncLanguageV3('es-419', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog })
    expect(out).toEqual({ kind: 'failed', code: 'E_NETWORK' })
    expect(keysOf(a.rows, 'tn:').length).toBe(0)
    expect(keysOf(a.rows, 'scripture-usj:').length).toBe(0)
    expect(a.rows.has(`resource:${GLT}`)).toBe(false)
    const fetched = new Set(segments(good.urls))
    const mark = good.urls.length
    cut = false
    expect(await syncLanguageV3('es-419', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog })).toEqual({ kind: 'done', books: ['tit'] })
    const again = segments(good.urls.slice(mark))
    expect(again.length).toBeGreaterThan(0)
    expect(again.filter((u) => fetched.has(u))).toEqual([])
    expect(keysOf(a.rows, `tn:${TN}:tit`).length).toBeGreaterThan(1)
  }, 120_000)

  it('says offline when the device is, no-pack for a language without a pack, and failed with the code otherwise', async () => {
    const sample = await buildSample()
    const client = await clientOf(fakeFetch(sample), sample)
    const a = adapters()
    expect(await syncLanguageV3('fr', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog })).toEqual({ kind: 'no-pack' })
    expect(a.rows.size).toBe(0)
    const refusing = (error: ClientError) => ({ ...client, refresh: async () => { throw error } }) as LanguagePackClient
    const down = refusing(new ClientError('E_NETWORK', 'down'))
    const nav = globalThis.navigator
    Object.defineProperty(nav, 'onLine', { value: false, configurable: true })
    try {
      expect(await syncLanguageV3('es-419', { books: ['tit'] }, { client: down, cache: a.cache, catalog: a.catalog })).toEqual({ kind: 'offline' })
    } finally {
      delete (nav as { onLine?: boolean }).onLine
    }
    expect(await syncLanguageV3('es-419', { books: ['tit'] }, { client: down, cache: a.cache, catalog: a.catalog })).toEqual({ kind: 'failed', code: 'E_NETWORK' })
    const limited = refusing(new ClientError('E_NETWORK', 'slow down', { status: 429, retryAfter: 30 }))
    expect(await syncLanguageV3('es-419', { books: ['tit'] }, { client: limited, cache: a.cache, catalog: a.catalog })).toEqual({ kind: 'failed', code: 'E_NETWORK', retryAfter: 30 })
  }, 120_000)

  it('two concurrent calls fetch each segment once', async () => {
    const sample = await buildSample()
    const fetch = fakeFetch(sample)
    const client = await clientOf(fetch, sample)
    const a = adapters()
    const deps = { client, cache: a.cache, catalog: a.catalog }
    const [x, y] = await Promise.all([syncLanguageV3('es-419', { books: ['tit'] }, deps), syncLanguageV3('es-419', { books: ['tit'] }, deps)])
    expect(x).toEqual({ kind: 'done', books: ['tit'] })
    expect(y).toEqual(x)
    const asked = segments(fetch.urls)
    expect(asked.length).toBeGreaterThan(0)
    expect(new Set(asked).size).toBe(asked.length)
  }, 120_000)

  it('reports progress per unit', async () => {
    const sample = await buildSample()
    const client = await clientOf(fakeFetch(sample), sample)
    const a = adapters()
    const seen: string[] = []
    await syncLanguageV3('es-419', { books: ['tit'] }, { client, cache: a.cache, catalog: a.catalog, onProgress: (p) => seen.push(p.unit) })
    expect(seen).toContain('book:tit')
    expect(seen).toContain('orig:tit')
  }, 120_000)
})
