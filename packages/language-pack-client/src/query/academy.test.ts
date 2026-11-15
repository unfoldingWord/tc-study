import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
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
  })
  test('without the map: data null and the unit missing', async () => {
    const r = await open({ books: ['tit'] })
    const a = await academyQuery({ ...r, maps: async () => ({ revision: 1 }) } as never, 'tit')
    expect(a.data).toBeNull()
    expect(a.notInstalled.some((n) => n.unit === 'map')).toBe(true)
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
})
