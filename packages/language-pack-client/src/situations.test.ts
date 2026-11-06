/** The five situations of "Lo que más puede fallar", each end to end: through `createClient` and the fake server, or `openFromSegments` over the spec fixtures. */
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { answer } from '@bt-synergy/language-pack-v3'
import { partsSource } from '../../language-pack-v3/src/node/partsSource'
import { createClient } from './client'
import { openFromSegments } from './reader'
import { httpSource } from './source/http'
import { memoryStore } from './store/memory'
import { type VerifiedCatalog, verifyCatalogFile } from './verify'
import { type FakeServer, startFakeServer } from '../test/fakeServer'
import { buildSample, type Sample } from '../test/sample'

const SPEC = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests')
const file = (...p: string[]): Uint8Array => new Uint8Array(readFileSync(join(SPEC, ...p)))
const json = (...p: string[]) => JSON.parse(readFileSync(join(SPEC, ...p), 'utf8')) as Record<string, any>
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
let server: FakeServer | undefined
afterEach(() => server?.stop())
beforeAll(async () => {
  sample = await buildSample()
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

/** A catalog the test builds around one fixture segment (these fixtures have no catalog, or one that lists other units). */
function stubCatalog(revision: number, segs: { id: string; cls: string; group?: string; book?: string; size: number }[], units: { id: string; segments: number[] }[]): VerifiedCatalog {
  return {
    id: 'x',
    bytes: new Uint8Array(),
    name: 'es-419',
    publisher: 'x',
    revision,
    origin: 'published',
    catalog: {
      lang: 'es-419',
      about: { revision },
      resources: [],
      segments: segs.map((s) => ({ id: bytesOf(s.id), class: s.cls, group: s.group, book: s.book, size: s.size, ulen: 0, inputs: new Uint8Array() })),
      units,
    },
  } as unknown as VerifiedCatalog
}

describe('the five situations', () => {
  test('1. few resources: the coverage says what exists and what is none', async () => {
    server = startFakeServer(sample, {})
    const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await client.install('es-419', { books: ['tit'] })
    const r = await client.open('es-419')
    const a = await r.passage('tit 1:1')
    expect(a.data).not.toBeNull()
    expect(a.coverage!['es-419_gl/es-419/tn']).toBe('count')
    expect(a.coverage!['es-419_gl/es-419/tq']).toBe('count')
    expect(a.coverage!['es-419_gl/es-419/twl']).toBe('count')
    // A book the map does not cover is none, not zero.
    const isa = await r.books({ article: 'ta:translate/figs-metaphor' })
    expect(isa.data!.books.isa!.state).toBe('none')

    // The fixture: the map core of a partial language, read through the reader, gives the coverage its expected file lists.
    const seg = file('idioma-parcial', 'map-core.seg')
    const expected = json('idioma-parcial', 'map-core.expected.json')
    const cat = stubCatalog(1, [{ id: expected.id, cls: 'map', size: seg.length }], [{ id: 'map', segments: [0] }])
    const reader = openFromSegments({ lang: 'es-419', catalogs: [cat], get: async (id) => (id === expected.id ? seg : undefined) })
    const maps = await reader.maps()
    const got: Record<string, { whole: string[] }> = {}
    for (const [key] of maps.map!.core.res) got[key] = { whole: [...(maps.map!.core.coverage.get(key)?.whole ?? [])].sort() }
    const want = Object.fromEntries(Object.entries(expected.coverage as Record<string, { whole: string[] }>).map(([k, v]) => [k, { whole: [...v.whole].sort() }]))
    expect(got).toEqual(want)
    expect(reader.problems).toEqual([])
  })

  test('2. a book with no English sources: books() says none for Isaiah', async () => {
    const fixture = json('queries', 'isaiah.json')
    expect(fixture.expected.coverage['unfoldingWord/en/tn']).toBe('none')
    expect(fixture.expected.coverage['unfoldingWord/en/twl']).toBe('none')
    server = startFakeServer(sample, {})
    const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await client.install('es-419', { books: ['tit'] })
    const r = await client.open('es-419')
    for (const q of [{ article: 'ta:translate/figs-metaphor' }, { article: 'tw:kt/grace' }]) {
      const a = await r.books(q)
      expect(a.data!.books.isa).toEqual({ state: 'none', installed: false })
    }
  })

  test('3. an old pack with no network: partial until orig:tit arrives by transfer', async () => {
    const data = join(SPEC, 'data')
    const originals = await partsSource({ list: join(data, 'originals', 'list.json'), partsDir: join(data, 'parts') })
    // Another device that has everything and can export a transfer file.
    server = startFakeServer(sample, {})
    const donor = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await donor.install('es-419', { books: ['tit'] })
    const transfer = await donor.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] })

    const phone = createClient({ store: memoryStore(), trust }) // no source: no network
    const old = await phone.importOldPack(file('data', 'es-419-tit.langpack.zip'), { originals, device: 'test-device', now: '2026-11-01T10:00:00Z' })
    expect(old.waiting).toEqual([{ key: 'es-419/book:tit', missing: ['es-419/orig:tit'] }])
    let r = await phone.open('es-419')
    const before = await r.passage('tit 1:1')
    expect(before.data).toBeNull()
    expect(before.notInstalled?.[0]?.unit).toBe('book:tit')

    const got = await phone.importTransfer(transfer)
    expect(got.waiting).toEqual([])
    r = await phone.open('es-419')
    const after = await r.passage('tit 1:1')
    expect(after.data).not.toBeNull()
    expect(after.coverage).toEqual({ 'es-419_gl/es-419/tn': 'count', 'es-419_gl/es-419/tq': 'count', 'es-419_gl/es-419/twl': 'count' })
  })

  test('4. mixed revisions: the answer names both', async () => {
    const published = await verifyCatalogFile(file('revisiones-mixtas', 'catalog.seg'), {}, { from: 'store' })
    expect(published.revision).toBe(4)
    const mapSeg = file('revisiones-mixtas', 'map-core.seg')
    const rutSeg = file('revisiones-mixtas', 'book-rut.seg')
    const rutId = json('revisiones-mixtas', 'book-rut.expected.json').id as string
    const mapId = json('revisiones-mixtas', 'map-core.expected.json').id as string
    // The installed book is of revision 3: a catalog of that revision lists it.
    const installed = stubCatalog(3, [{ id: rutId, cls: 'book', book: 'rut', size: rutSeg.length }], [{ id: 'book:rut', segments: [0] }])
    const r = openFromSegments({
      lang: 'es-419',
      catalogs: [published, installed],
      get: async (id) => (id === mapId ? mapSeg : id === rutId ? rutSeg : undefined),
    })
    const a = await r.passage('rut 1:1')
    expect(a.data).not.toBeNull()
    expect(a.revision.units).toEqual({ 'book:rut': 3, map: 4 })
    // The map says 15 notes on metaphor in Ruth (revision 4); the installed book (revision 3) has 14.
    // No client query reads the language's own tN usage (books() and concept() read the English sources), so this asks the map itself.
    const usage = answer(await r.maps(), { kind: 'usage', concept: 'ta:translate/figs-metaphor', source: 'es-419_gl/es-419/tn' }) as { books: Record<string, { count?: number }> }
    expect(usage.books.rut!.count).toBe(15)
    const book = await r.book('rut')
    const metaphors = book!.notes!.rows.filter((n) => JSON.stringify(n).includes('figs-metaphor'))
    expect(metaphors.length).toBe(14)
  })

  test('5. a mistitled article: section ids unchanged, otherLang true', async () => {
    const seg = file('articulo-mal-titulado', 'art.seg')
    const expected = json('articulo-mal-titulado', 'art.expected.json')
    const cat = stubCatalog(1, [{ id: expected.id, cls: 'art', group: 'tw:kt', size: seg.length }], [{ id: 'art:tw:kt', segments: [0] }])
    const r = openFromSegments({ lang: 'es-419', catalogs: [cat], get: async (id) => (id === expected.id ? seg : undefined) })
    const all = await r.article('tw:kt/faith', 'all')
    expect(all.data!.sections.map((s) => s.sid)).toEqual(expected.articles[0].sections.map((s: { sid: string }) => s.sid))
    expect(all.data!.sections.at(-1)!.otherLang).toBe(true)
    expect(all.data!.sections.slice(0, -1).every((s) => !s.otherLang)).toBe(true)
  })
})
