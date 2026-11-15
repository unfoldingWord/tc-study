import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
import { usageBooks } from './maps'
import { academyOf, academyQuery } from './academy'

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

async function open(opts: { defaults?: boolean; books?: string[] }) {
  server?.stop()
  server = startFakeServer(sample, {})
  const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
  await client.install('es-419', opts)
  return client.open('es-419')
}

describe('academy', () => {
  test('the articles the notes of a book cite, most cited first', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.academy('tit')
    expect(a.query).toBe('academy')
    expect(a.data!.book).toBe('tit')
    const list = a.data!.articles
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((x) => x.id.startsWith('ta:') && x.count > 0)).toBe(true)
    const abs = list.find((x) => x.id === 'ta:translate/figs-abstractnouns')!
    expect(abs.count).toBe(14)
    expect(abs.partial).toBe(false)
    for (let i = 1; i < list.length; i++) {
      const p = list[i - 1]!
      const c = list[i]!
      expect(p.count > c.count || (p.count === c.count && p.id < c.id)).toBe(true)
    }
    expect(a.revision.units.map).toBeGreaterThan(0)
    expect((await r.academy('isa')).data!.articles).toEqual([])
    // Every count agrees with the cells of books().
    const m = await r.maps()
    for (const x of list) expect(usageBooks(m, x.id).tit).toMatchObject({ count: x.count })
  })
  test('over a map with many ids the counts equal usageBooks and nothing else is listed', () => {
    const rows = new Map<string, Map<string, [number, number]>>()
    for (let i = 0; i < 500; i++) rows.set(`ta:x/a${String(i).padStart(3, '0')}`, new Map([['tit', [i % 7, 1]], ['gen', [3, 1]]]))
    const mk = (partial: boolean) =>
      ({
        revision: 1,
        map: {
          core: {
            lang: 'es',
            names: { 'ta:x/a001': ['Uno'] },
            res: new Map([['x/es/tn', {}]]),
            coverage: new Map([['x/es/tn', { whole: partial ? [] : ['tit'], partial: partial ? ['tit'] : [] }]]),
            usage: { unit: 'notes', rows },
          },
          parts: new Map(),
        },
      }) as never
    for (const partial of [false, true]) {
      const m = mk(partial)
      const list = academyOf(m, 'tit')
      expect(list.length).toBe(500 - Math.ceil(500 / 7))
      for (const x of list) {
        expect(usageBooks(m, x.id).tit).toMatchObject({ count: x.count })
        expect(x.partial).toBe(partial)
      }
      expect(list.find((x) => x.id === 'ta:x/a001')!.title).toBe('Uno')
      expect(academyOf(m, 'gen')).toEqual([])
    }
  })
  test('revision.units lists only the maps read: xmap for English, not for another language', async () => {
    const TN = 'unfoldingWord/en/tn'
    const r = await open({ books: ['tit'] })
    const notes = { unit: 'notes', rows: new Map([['ta:x/a', new Map([['tit', [2, 1]]])]]) }
    const xmap = { core: { coverage: new Map([[TN, { whole: ['tit'], partial: [] }]]), notes, links: undefined, strong: { unit: 'occurrences', rows: new Map() } }, parts: new Map() }
    const en = { core: { lang: 'en', res: [[TN, 'v1']], coverage: new Map(), usage: undefined, names: {} }, parts: new Map() }
    const es = { core: { lang: 'es-419', res: [['x/es-419/tn', 'v1']], coverage: new Map([['x/es-419/tn', { whole: ['tit'], partial: [] }]]), usage: { unit: 'notes', rows: new Map([['ta:x/a', new Map([['tit', [3, 1]]])]]) }, names: {} }, parts: new Map() }
    const a = await academyQuery({ ...r, maps: async () => ({ revision: 1, xmap, map: en }) } as never, 'tit')
    expect(a.revision.units.xmap).toBeGreaterThan(0)
    expect(a.data!.articles).toEqual([{ id: 'ta:x/a', count: 2, partial: false }])
    const b = await academyQuery({ ...r, maps: async () => ({ revision: 1, xmap, map: es }) } as never, 'tit')
    expect(b.revision.units.xmap).toBeUndefined()
    expect(b.revision.units.map).toBeGreaterThan(0)
    expect(b.data!.articles).toEqual([{ id: 'ta:x/a', count: 3, partial: false }])
  })
  test('English with many ids: counts come from the xmap notes and agree with usageBooks', () => {
    const TN = 'unfoldingWord/en/tn'
    const rows = new Map<string, Map<string, [number, number]>>()
    for (let i = 0; i < 400; i++) rows.set(`ta:x/a${i}`, new Map([['tit', [i % 5, 1]]]))
    const m = {
      revision: 1,
      xmap: { core: { coverage: new Map([[TN, { whole: ['tit'], partial: [] }]]), notes: { unit: 'notes', rows }, links: undefined, strong: { unit: 'occurrences', rows: new Map() } }, parts: new Map() },
      map: { core: { lang: 'en', res: [[TN, 'v1']], coverage: new Map(), usage: undefined, names: {} }, parts: new Map() },
    } as never
    const list = academyOf(m, 'tit')
    expect(list.length).toBe(320)
    for (const x of list) expect(usageBooks(m, x.id).tit).toMatchObject({ count: x.count })
  })
  test('without the map: data null and the unit missing', async () => {
    const r = await open({ books: ['tit'] })
    const a = await academyQuery({ ...r, maps: async () => ({ revision: 1 }) } as never, 'tit')
    expect(a.data).toBeNull()
    const miss = a.notInstalled.find((n) => n.unit === 'map')
    expect(miss).toMatchObject({ unit: 'map', bytes: r.size('map') })
    expect(miss!.bytes).toBeGreaterThan(0)
  })
  test('a bad book is E_ARG', async () => {
    const r = await open({ books: ['tit'] })
    await expect(r.academy('xyz')).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.academy(5 as never)).rejects.toMatchObject({ code: 'E_ARG' })
  })
  test('sorted by count then id, with the first name as title; other books left out', () => {
    const rows = new Map([
      ['ta:b', new Map([['rut', [3, 2]]])],
      ['ta:a', new Map([['rut', [3, 2]]])],
      ['ta:c', new Map([['rut', [9, 5]]])],
      ['ta:d', new Map([['gen', [4, 4]]])],
    ])
    const coverage = new Map([['x/es-419/tn', { whole: ['rut'], partial: [] }]])
    const core = { lang: 'es-419', res: [['x/es-419/tn', 'v1']], coverage, usage: { unit: 'notes', rows }, names: { 'ta:c': ['Tercero', 'x'] } }
    const m = { revision: 1, map: { core, parts: new Map() } } as never
    expect(academyOf(m, 'rut').map((x) => [x.id, x.count, x.title, x.partial])).toEqual([
      ['ta:c', 9, 'Tercero', false],
      ['ta:a', 3, undefined, false],
      ['ta:b', 3, undefined, false],
    ])
  })
  test('a partially covered book lists only the cited articles; zero and none are left out', () => {
    const rows = new Map([['ta:a', new Map([['rut', [2, 2]]])]])
    const coverage = new Map([['x/es-419/tn', { whole: ['gen'], partial: ['rut'] }]])
    const core = { lang: 'es-419', res: [['x/es-419/tn', 'v1']], coverage, usage: { unit: 'notes', rows }, names: { 'ta:a': ['A'], 'ta:z': ['Z'] } }
    const m = { revision: 1, map: { core, parts: new Map() } } as never
    expect(academyOf(m, 'rut')).toEqual([{ id: 'ta:a', title: 'A', count: 2, partial: true }])
    expect(academyOf(m, 'gen')).toEqual([]) // whole book, no row: zero
    expect(academyOf(m, 'exo')).toEqual([]) // not covered: none
  })
  test('covered: false with no own tN or outside the tN coverage, true for a covered book with no citations', async () => {
    const rows = new Map([['ta:a', new Map([['rut', [2, 2]]])]])
    const coverage = new Map([['x/es-419/tn', { whole: ['gen'], partial: ['rut'] }]])
    const own = { lang: 'es-419', res: [['x/es-419/tn', 'v1']], coverage, usage: { unit: 'notes', rows }, names: { 'ta:a': ['A'] } }
    const r = await open({ books: ['tit'] })
    const ask = async (core: object, book: string) =>
      (await academyQuery({ ...r, maps: async () => ({ revision: 1, map: { core, parts: new Map() } }) } as never, book)).data!
    expect(await ask(own, 'rut')).toEqual({ book: 'rut', covered: true, articles: [{ id: 'ta:a', title: 'A', count: 2, partial: true }] })
    expect(await ask(own, 'gen')).toEqual({ book: 'gen', covered: true, articles: [] })
    expect(await ask(own, 'exo')).toEqual({ book: 'exo', covered: false, articles: [] })
    const none = { lang: 'es-419', res: [], coverage: new Map(), usage: undefined, names: { 'ta:a': ['A'] } }
    expect(await ask(none, 'rut')).toEqual({ book: 'rut', covered: false, articles: [] })
  })
  test('English: ids and counts come from the xmap notes, and the xmap is marked used', async () => {
    const TN = 'unfoldingWord/en/tn'
    const notes = { unit: 'notes', rows: new Map([['ta:translate/figs-metaphor', new Map([['psa', [140, 120]]])]]) }
    const xcov = new Map([[TN, { whole: ['psa'], partial: [] }]])
    const xmap = { core: { coverage: xcov, notes, links: undefined, strong: { unit: 'occurrences', rows: new Map() } }, parts: new Map() }
    const map = { core: { lang: 'en', res: [[TN, 'v1']], coverage: new Map(), usage: undefined, names: {} }, parts: new Map() }
    const r = await open({ books: ['tit'] })
    const a = await academyQuery({ ...r, maps: async () => ({ revision: 1, xmap, map }) } as never, 'psa')
    expect(a.data).toEqual({ book: 'psa', covered: true, articles: [{ id: 'ta:translate/figs-metaphor', count: 140, partial: false }] })
    expect(a.revision.units.xmap).toBeGreaterThan(0)
    // Without the xmap the English counts cannot be read: data null and the unit is listed.
    const b = await academyQuery({ ...r, maps: async () => ({ revision: 1, map }) } as never, 'psa')
    expect(b.data).toBeNull()
    expect(b.notInstalled.find((n) => n.unit === 'xmap')).toMatchObject({ bytes: r.size('xmap') })
    expect(r.size('xmap')).toBeGreaterThan(0)
  })
})
