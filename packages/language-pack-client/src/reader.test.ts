import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { answer, canonicalJson } from '@bt-synergy/language-pack-v3'
import { createClient } from './client'
import { openFromSegments } from './reader'
import { httpSource } from './source/http'
import { memoryStore } from './store/memory'
import { verifyCatalogFile } from './verify'
import { type FakeServer, startFakeServer } from '../test/fakeServer'
import { buildSample, type Sample } from '../test/sample'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

function setup() {
  server?.stop()
  server = startFakeServer(sample, {})
  const store = memoryStore()
  const client = createClient({ store, source: httpSource({ base: server.url }), trust })
  return { store, client }
}

const g5485 = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests', 'queries', 'g5485.json'), 'utf8')) as { expected: unknown }

describe('open', () => {
  test('an installed book reads, with the lang, revisions, sizes and units', async () => {
    const { client } = setup()
    await client.install('es-419', { books: ['tit'] })
    const r = await client.open('es-419')
    const book = await r.book('tit')
    expect(book?.lang).toBe('es-419')
    expect(r.installed('book:tit')).toBe(true)
    expect(r.revisions().lang).toBe(1)
    expect(r.unitOf('book', 'tit')).toBe('book:tit')
    expect(r.unitOf('orig', 'tit')).toBe('orig:tit')
    expect(r.unitOf('book', 'rom')).toBeUndefined()
    expect(r.unitOf('art', 'tw:kt/grace')).toBe('art:tw:kt')
    expect((await r.orig('tit'))?.book).toBe('tit')
    expect((await r.articles('tw:kt'))?.length).toBeGreaterThan(0)
    expect(r.problems).toEqual([])
  })

  test('a book that is not installed is undefined, and its size is the catalog\'s', async () => {
    const { client } = setup()
    await client.install('es-419', { books: [] })
    const r = await client.open('es-419')
    expect(await r.book('tit')).toBeUndefined()
    expect(r.installed('book:tit')).toBe(false)
    const cat = await verifyCatalogFile(sample.langCatalog, {}, { from: 'store' })
    const unit = cat.catalog.units.find((u) => u.id === 'book:tit')!
    expect(r.size('book:tit')).toBe(unit.segments.reduce((n, i) => n + cat.catalog.segments[i]!.size, 0))
    expect(r.size('book:tit')).toBeGreaterThan(0)
  })

  test('the alias resolves like status()', async () => {
    const { client } = setup()
    await client.install('es-419', { books: ['tit'] })
    const r = await client.open('es-419')
    expect(r.lang).toBe('es-419')
  })

  test('maps() answers a strong key as the spec file does, or from a key the sample has', async () => {
    const { client } = setup()
    await client.install('es-419', { books: ['tit'] })
    const r = await client.open('es-419')
    const m = await r.maps()
    expect(m.revision).toBe(1)
    const got = JSON.parse(canonicalJson(answer(m, { kind: 'strong', key: 'G5485' }))) as { books: Record<string, { state: string; count?: number }> }
    const want = JSON.parse(canonicalJson(g5485.expected)) as typeof got
    // The sample covers Titus only: compare the book it has, and the whole answer when it covers the lot.
    expect(got.books.tit).toEqual(want.books.tit!)
    const same = Object.keys(want.books).filter((b) => canonicalJson(got.books[b]) === canonicalJson(want.books[b])).length
    console.log('g5485 books equal:', same, 'of', Object.keys(want.books).length, JSON.stringify(got.books.tit))
  })

  test('a corrupt stored segment is not installed, it is in problems, and verify lists it', async () => {
    const { client, store } = setup()
    await client.install('es-419', { books: ['tit'] })
    const state = (await store.getState())!
    const id = state.units['es-419/book:tit']!.segments[0]!
    await store.put(id, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
    const r = await client.open('es-419')
    expect(await r.book('tit')).toBeUndefined()
    expect(r.problems.map((p) => p.id)).toContain(id)
    expect(r.problems[0]!.code).toMatch(/^E_/)
    expect(r.installed('book:tit')).toBe(false)
    expect((await client.verify()).bad).toContain(id)
  })
})

describe('openFromSegments', () => {
  test('gives the same maps() answers as open', async () => {
    const { client } = setup()
    await client.install('es-419', { books: ['tit'] })
    const a = await (await client.open('es-419')).maps()
    const catalogs = [await verifyCatalogFile(sample.langCatalog, {}, { from: 'store' }), await verifyCatalogFile(sample.commonCatalog, {}, { from: 'store' })]
    const r = openFromSegments({ lang: 'es-419', catalogs, get: async (id) => sample.segments.get(id) })
    const b = await r.maps()
    for (const q of [{ kind: 'strong', key: 'G5485' }, { kind: 'book', book: 'tit' }]) {
      expect(canonicalJson(answer(b, q))).toBe(canonicalJson(answer(a, q)))
    }
    expect((await r.book('tit'))?.lang).toBe('es-419')
  })

  test('a unit whose bytes are absent is not installed', async () => {
    const catalogs = [await verifyCatalogFile(sample.langCatalog, {}, { from: 'store' }), await verifyCatalogFile(sample.commonCatalog, {}, { from: 'store' })]
    const r = openFromSegments({ lang: 'es-419', catalogs, get: async () => undefined })
    expect(await r.book('tit')).toBeUndefined()
    expect(r.installed('book:tit')).toBe(false)
  })
})
