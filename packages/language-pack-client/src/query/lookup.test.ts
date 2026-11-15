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

const taMaps = {
  revision: 1,
  map: {
    core: {
      lang: 'en',
      names: { 'ta:manage/translate-team': ['Setting Up A Translation Team'] },
      subtitles: { 'ta:manage/translate-team': 'How can I set up a translation team?' },
    },
    parts: new Map(),
  },
} as never

const rank = {
  revision: 1,
  map: {
    core: {
      lang: 'x',
      names: {
        'ta:x/a-sub': ['Unrelated'],
        'ta:x/b-title': ['Team work'],
        'ta:x/z-title': ['The team'],
        'ta:x/faith': ['Fe y gracia'],
        'ta:x/accent': ['Gracia Équipe'],
        'ta:x/hi': ['का अनुवाद'],
        'ta:x/ar': ['من ترجمة'],
        'ta:x/same': ['Same'],
        'tw:x/term': ['Term'],
      },
      subtitles: {
        'ta:x/a-sub': 'A subtitle only team',
        'ta:x/same': 'Same',
        'tw:x/term': 'Secret question',
      },
    },
    parts: new Map(),
  },
} as never

describe('lookupMatches', () => {
  test('the subtitle of an article is a name, after the title', () => {
    const [hit] = lookupMatches(taMaps, 'set up a translation team')
    expect(hit!.id).toBe('ta:manage/translate-team')
    expect(hit!.names).toEqual(['Setting Up A Translation Team', 'How can I set up a translation team?'])
    expect(hit!.exact).toBe(false)
  })
  test('several words match in any order, as whole words or word starts', () => {
    expect(lookupMatches(taMaps, 'team translation').map((m) => m.id)).toEqual(['ta:manage/translate-team'])
    expect(lookupMatches(taMaps, 'transl tea').map((m) => m.id)).toEqual(['ta:manage/translate-team'])
    expect(lookupMatches(taMaps, 'team horse')).toEqual([])
  })
  test('function words are ignored by the several-word rule, content words of two letters are kept', () => {
    expect(lookupMatches(taMaps, 'how to team').map((m) => m.id)).toEqual(['ta:manage/translate-team'])
    expect(lookupMatches(taMaps, 'a to')).toEqual([])
    expect(lookupMatches(rank, 'fe y gracia').map((m) => m.id)).toEqual(['ta:x/faith'])
    expect(lookupMatches(rank, 'y gracia fe').map((m) => m.id)).toEqual(['ta:x/faith'])
    expect(lookupMatches(rank, 'का अनुवाद').map((m) => m.id)).toEqual(['ta:x/hi'])
    expect(lookupMatches(rank, 'من ترجمة').map((m) => m.id)).toEqual(['ta:x/ar'])
    expect(lookupMatches(rank, 'من فريق')).toEqual([])
  })
  test('accents, capitals, double spaces and punctuation do not matter; a mid-word start does not match', () => {
    expect(lookupMatches(rank, 'EQUIPE   Gracia').map((m) => m.id)).toEqual(['ta:x/accent'])
    expect(lookupMatches(taMaps, 'set up a translation team?').map((m) => m.id)).toEqual(['ta:manage/translate-team'])
    expect(lookupMatches(taMaps, 'translation, team').map((m) => m.id)).toEqual(['ta:manage/translate-team'])
    expect(lookupMatches(taMaps, 'ranslation setting')).toEqual([])
  })
  test('an exact title ranks first; a subtitle-only hit ranks below title hits and is never exact', () => {
    expect(lookupMatches(rank, 'Team work')[0]).toMatchObject({ id: 'ta:x/b-title', exact: true })
    expect(lookupMatches(rank, 'team', 2).map((m) => m.id)).toEqual(['ta:x/b-title', 'ta:x/z-title'])
    expect(lookupMatches(rank, 'a subtitle only team')[0]).toMatchObject({ id: 'ta:x/a-sub', exact: false })
    expect(lookupMatches(rank, 'a subtitle only team').every((m) => !m.exact)).toBe(true)
  })
  test('a subtitle on a tw: id is ignored; one equal to the title is not added twice', () => {
    expect(lookupMatches(rank, 'secret question')).toEqual([])
    expect(lookupMatches(rank, 'same')[0]!.names).toEqual(['Same'])
  })
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
