/** Final review, area 2: reading and queries. The sample is Titus only. */
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { makeReader, openFromSegments, type PackReader } from '../reader'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import type { BlobStore } from '../store/types'
import type { SearchIndex } from '../search/types'
import { verifyCatalogFile } from '../verify'
import { renderingsQuery } from './renderings'
import schemas from './schemas.json'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

async function installed(want: Parameters<ReturnType<typeof createClient>['install']>[1], store: BlobStore = memoryStore()) {
  server?.stop()
  server = startFakeServer(sample, {})
  const client = createClient({ store, source: httpSource({ base: server.url }), trust })
  await client.install('es-419', want)
  return { client, store, server }
}

async function segmentsOf(unit: string): Promise<string[]> {
  for (const bytes of [sample.langCatalog, sample.commonCatalog]) {
    const c = await verifyCatalogFile(bytes, {}, { from: 'store' })
    const u = c.catalog.units.find((x) => x.id === unit)
    if (u !== undefined) return u.segments.map((i) => hexOf(c.catalog.segments[i]!.id))
  }
  throw new Error(`no unit ${unit}`)
}

const TW = 'tw:kt/apostle'
const TA = 'ta:translate/figs-abstractnouns'

describe('final review, reading and queries', () => {
  test('1: a language revision whose common catalog the server lacks: the reader keeps every active unit', async () => {
    const lang2 = await buildSample({ revision: 2, commonRevision: 2, requireNewCommon: true })
    const { client, server: srv } = await installed({ books: ['tit'] })
    srv.set({ ...lang2, commonCatalog: sample.commonCatalog })
    const r = await client.refresh('es-419')
    expect(r.missingCommon?.revision).toBe(2)
    const reader = await client.open('es-419')
    for (const unit of ['xmap', 'xtopics', 'orig:tit', 'book:tit', 'map', 'topics']) expect([unit, reader.installed(unit)]).toEqual([unit, true])
    expect(((await reader.topics()).data as { installed: boolean }).installed).toBe(true)
    expect((await reader.renderings({ strong: 'G39720' })).data!.renderings.length).toBeGreaterThan(0)
    expect((await reader.books({ article: TW })).data!.books.tit!.state).toBe('count')
  })

  test('2: a Strong of four digits finds the words the table keys with a 0 added (G3972 is G39720)', async () => {
    const { client } = await installed({ books: ['tit'] })
    const reader = await client.open('es-419')
    const short = await reader.renderings({ strong: 'G3972' })
    const long = await reader.renderings({ strong: 'G39720' })
    expect(short.data!.renderings.length).toBeGreaterThan(0)
    expect(short.data!.renderings).toEqual(long.data!.renderings)
    expect(short.data!.strong).toBe('G39720')
  })

  test('3: alignment positions are not used against an original of another stamp', async () => {
    const { client } = await installed({ books: ['tit'] })
    const reader = await client.open('es-419')
    const other: PackReader = {
      ...reader,
      orig: async (b) => {
        const o = await reader.orig(b)
        return o === undefined ? undefined : { ...o, stamp: 'g' + '0'.repeat(40) }
      },
    }
    const a = await renderingsQuery(other, { strong: 'G39720' })
    expect(a.data!.renderings).toEqual([])
    expect(a.notInstalled).toContainEqual(expect.objectContaining({ book: 'tit', unit: 'orig:tit', what: 'stale' }))
  })

  test('4: without xmap or map the map queries say installed false and name the unit, never all none', async () => {
    const { client } = await installed({ defaults: false })
    const reader = await client.open('es-419')
    expect(reader.installed('xmap')).toBe(false)
    const tw = await reader.books({ article: TW })
    expect(tw.data!.installed).toBe(false)
    expect(tw.notInstalled.map((n) => n.unit)).toContain('xmap')
    expect(tw.notInstalled.find((n) => n.unit === 'xmap')!.bytes).toBeGreaterThan(0)
    const ta = await reader.books({ article: TA })
    expect(ta.data!.installed).toBe(false)
    expect(ta.notInstalled.map((n) => n.unit)).toContain('map')
    const concept = await reader.concept(TW)
    expect((concept.data as { installed?: boolean }).installed).toBe(false)
    expect(concept.notInstalled.map((n) => n.unit)).toContain('xmap')
  })

  test('4: a corrupt stored map is like a missing one', async () => {
    const store = memoryStore()
    const { client } = await installed({ books: ['tit'] }, store)
    for (const id of await segmentsOf('map')) await store.put(id, new Uint8Array([1, 2, 3]))
    const reader = await client.open('es-419')
    const ta = await reader.books({ article: TA })
    expect(ta.data!.installed).toBe(false)
    expect(ta.notInstalled.map((n) => n.unit)).toContain('map')
    const ctx = await reader.context('tit 1:1')
    expect(ctx.notInstalled.map((n) => n.unit)).toContain('map')
  })

  test('5: a whole source with no rows in the range is zero, not count', async () => {
    const { client } = await installed({ books: ['tit'] })
    const reader = await client.open('es-419')
    const kindOf: Record<string, 'notes' | 'questions' | 'links'> = { tn: 'notes', tq: 'questions', twl: 'links' }
    const states = new Set<string>()
    for (const [c, last] of [[1, 16], [2, 15], [3, 15]] as const) {
      for (let v = 1; v <= last; v++) {
        const a = await reader.passage(`tit ${c}:${v}`)
        for (const [key, state] of Object.entries(a.coverage ?? {})) {
          states.add(state)
          const rows = a.data![kindOf[key.slice(key.lastIndexOf('/') + 1)]!].length
          if (state === 'count') expect([key, c, v, rows > 0]).toEqual([key, c, v, true])
          if (state === 'zero') expect([key, c, v, rows]).toEqual([key, c, v, 0])
        }
      }
    }
    expect(states.has('zero')).toBe(true)
  })

  test('6: search keeps only hits of books installed in this reader', async () => {
    const lang = await verifyCatalogFile(sample.langCatalog, {}, { from: 'store' })
    const index: SearchIndex = {
      init: async () => {},
      addBook: async () => {},
      removeSegment: async () => {},
      has: async () => true,
      search: async () => [{ kind: 'text', book: 'tit', ref: '1:1', res: 'x', snippet: '«Pablo»', score: 1 }],
    } as unknown as SearchIndex
    const reader = makeReader({ lang: 'es-419', catalogs: [lang], get: async () => undefined, active: {}, index })
    const a = await reader.search('Pablo')
    expect(a.data).toEqual([])
    expect(a.cites).toEqual([])
  })

  test('7: the topics schema refuses a category and a book together', () => {
    expect((schemas as unknown as { topics: { input: { not?: unknown } } }).topics.input.not).toEqual({ required: ['category', 'book'] })
  })

  test('8: a reference with a capitalised book code reads', async () => {
    const { client } = await installed({ books: ['tit'] })
    const reader = await client.open('es-419')
    const a = await reader.passage('Tit 1:1')
    expect(a.data!.book).toBe('tit')
    expect(a.data!.texts.length).toBeGreaterThan(0)
  })

  test('the map set names the revision of the active map unit', async () => {
    const lang = await verifyCatalogFile(sample.langCatalog, {}, { from: 'store' })
    const reader = openFromSegments({ lang: 'es-419', catalogs: [lang], get: async (id) => sample.segments.get(id) })
    expect((await reader.maps()).revision).toBe(1)
  })
})
