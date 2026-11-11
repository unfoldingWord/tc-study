import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
import { lookupMatches } from './lookup'

const maps = {
  revision: 1,
  map: { core: { lang: 'es-419', names: { 'tw:kt/grace': ['gracia', 'misericordioso'], 'ta:translate/figs-metaphor': ['Metáfora'] } }, parts: new Map() },
  topics: { core: { names: { 'per:paul': [['Pablo', 3]] } }, parts: new Map() },
  xtopics: { core: { topics: new Map([['per:paul', { title: 'Paul' }], ['lug:jerusalem', { title: 'Jerusalem' }]]) }, parts: new Map() },
  xmap: { core: { concepts: new Map([['tw:kt/grace', 0], ['tw:other/graceful', 0], ['ta:translate/figs-metaphor', 0]]) }, parts: new Map() },
} as never

describe('lookupMatches', () => {
  test('a name in the language, with or without accents and capitals, finds its id first', () => {
    const [first] = lookupMatches(maps, 'metafora')
    expect(first).toEqual({ id: 'ta:translate/figs-metaphor', names: ['Metáfora', 'figs metaphor'], exact: true })
    expect(lookupMatches(maps, 'GRACIA')[0]!.id).toBe('tw:kt/grace')
  })
  test('the English word of the id finds it too, exact before the ones that only start with it', () => {
    const ids = lookupMatches(maps, 'grace').map((m) => m.id)
    expect(ids).toEqual(['tw:kt/grace', 'tw:other/graceful'])
    expect(lookupMatches(maps, 'grace')[0]!.exact).toBe(true)
    expect(lookupMatches(maps, 'grace')[1]!.exact).toBe(false)
  })
  test('people and places by the language name and by the common title', () => {
    expect(lookupMatches(maps, 'pablo').map((m) => m.id)).toEqual(['per:paul'])
    expect(lookupMatches(maps, 'paul').map((m) => m.id)).toEqual(['per:paul'])
    expect(lookupMatches(maps, 'jerus')[0]).toEqual({ id: 'lug:jerusalem', names: ['Jerusalem'], exact: false })
  })
  test('nothing found is an empty list, and the limit cuts the list', () => {
    expect(lookupMatches(maps, 'zzz')).toEqual([])
    expect(lookupMatches(maps, 'a', 2)).toHaveLength(2)
  })
})

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

describe('reader.lookup', () => {
  test('finds an Academy article by a word, from the maps alone, with no book installed', async () => {
    server = startFakeServer(sample, {})
    const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await client.install('es-419', { books: [] })
    const r = await client.open('es-419')
    const a = await r.lookup('abstractnouns')
    expect(a.query).toBe('lookup')
    expect(a.data!.matches.map((m) => m.id)).toContain('ta:translate/figs-abstractnouns')
    await expect(r.lookup('  ')).rejects.toMatchObject({ code: 'E_ARG' })
  })
})
