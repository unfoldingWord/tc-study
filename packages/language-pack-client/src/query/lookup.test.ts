import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
import { lookupMatches, lookupStats } from './lookup'

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
        'ta:x/faith': ['Fe gracia salvadora'],
        'ta:x/accent': ['Gracia Équipe'],
        'ta:x/hi': ['अनुवाद टीम'],
        'ta:x/ar': ['ترجمة فريق'],
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

describe('lookupMatches: folding and content words', () => {
  test('Arabic diacritics fold; Devanagari marks stay', () => {
    const d = { revision: 1, map: { core: { lang: 'x', names: { 'ta:x/ar': ['الاستعارة'], 'ta:x/hi': ['काम'], 'ta:x/hi2': ['कम'] } }, parts: new Map() } } as never
    const [a] = lookupMatches(d, 'اَلِاسْتِعَارَة')
    expect(a!.id).toBe('ta:x/ar')
    expect(a!.exact).toBe(true)
    expect(lookupMatches(d, 'ـالاستعارة').map((x) => x.id)).toEqual(['ta:x/ar'])
    expect(lookupMatches(d, 'काम').map((x) => x.id)).toEqual(['ta:x/hi'])
  })
  test('content words equal to a name are exact, before a longer name', () => {
    const d = (lang: string, a: string, b: string) =>
      ({ revision: 1, map: { core: { lang, names: { 'ta:translate/figs-metaphor': [a], 'ta:translate/figs-metaphor-complex': [b] } }, parts: new Map() } }) as never
    const es = lookupMatches(d('es', 'Metáfora', 'Metáfora compleja'), 'qué es la metáfora')
    expect(es.map((x) => x.id)).toEqual(['ta:translate/figs-metaphor', 'ta:translate/figs-metaphor-complex'])
    expect(es[0]!.exact).toBe(true)
    const en = lookupMatches(d('en', 'Metaphor', 'Complex Metaphor'), 'what is a metaphor')
    expect(en[0]!.id).toBe('ta:translate/figs-metaphor')
    expect(en[0]!.exact).toBe(true)
  })
})

describe('lookupMatches: exact needs the same words in order', () => {
  const d = (names: Record<string, string[]>) => ({ revision: 1, map: { core: { lang: 'en', names }, parts: new Map() } }) as never
  test('a different order is not exact but still matches', () => {
    const [m] = lookupMatches(d({ 'per:spirit': ['Holy Spirit'] }), 'who is the Spirit Holy')
    expect(m!.id).toBe('per:spirit')
    expect(m!.exact).toBe(false)
    expect(lookupMatches(d({ 'per:spirit': ['Holy Spirit'] }), 'who is the Holy Spirit')[0]!.exact).toBe(true)
  })
  test('an extra word in the name is not exact', () => {
    const [m] = lookupMatches(d({ 'ta:m': ['Metáfora compleja'] }), 'qué es la metáfora')
    expect(m!.exact).toBe(false)
  })
  test('repeated words count', () => {
    const q = d({ 'x:one': ['Holy'], 'x:two': ['Holy Holy'] })
    const r = lookupMatches(q, 'what is holy holy')
    expect(r.find((x) => x.id === 'x:two')!.exact).toBe(true)
    expect(r.find((x) => x.id === 'x:one')?.exact ?? false).toBe(false)
  })
  test('"son" is not a stopword: "who is the son" finds "Son"', () => {
    const [m] = lookupMatches(d({ 'per:son': ['Son'] }), 'who is the son')
    expect(m!.id).toBe('per:son')
    expect(m!.exact).toBe(true)
  })
})

describe('lookupMatches', () => {
  test('the subtitle of an article is returned apart from the names', () => {
    const [hit] = lookupMatches(taMaps, 'set up a translation team')
    expect(hit!.id).toBe('ta:manage/translate-team')
    expect(hit!.names).toEqual(['Setting Up A Translation Team'])
    expect(hit!.subtitle).toBe('How can I set up a translation team?')
    expect(hit!.exact).toBe(false)
  })
  test('punctuation in the query does not stop a match', () => {
    const p = {
      revision: 1,
      map: {
        core: {
          lang: 'x',
          names: { 'ta:translate/figs-metaphor': ['Metaphor'], 'ta:manage/translate-team': ['Translation team'], 'ta:x/team-fr': ['Équipe de traduction'], 'ta:x/wit': ['What Is Translation?'] },
        },
        parts: new Map(),
      },
    } as never
    expect(lookupMatches(p, 'metaphor?')[0]).toMatchObject({ id: 'ta:translate/figs-metaphor', exact: true })
    expect(lookupMatches(p, "what's a metaphor").map((x) => x.id)).toEqual(['ta:translate/figs-metaphor'])
    expect(lookupMatches(p, "it's a metaphor").map((x) => x.id)).toEqual(['ta:translate/figs-metaphor'])
    expect(lookupMatches(p, "l'équipe de traduction").map((x) => x.id)).toEqual(['ta:x/team-fr'])
    expect(lookupMatches(p, 'translation team')[0]!.id).toBe('ta:manage/translate-team')
    expect(lookupMatches(p, 'what is translation')[0]).toMatchObject({ id: 'ta:x/wit', exact: true })
  })
  test('accents go only from Latin letters: Devanagari vowel signs stay', () => {
    const d = { revision: 1, map: { core: { lang: 'x', names: { 'ta:x/work': ['काम'], 'ta:x/less': ['कम'], 'ta:x/met': ['Metáfora'] } }, parts: new Map() } } as never
    expect(lookupMatches(d, 'metafora')[0]!.id).toBe('ta:x/met')
    expect(lookupMatches(d, 'काम').map((x) => x.id)).toEqual(['ta:x/work'])
    expect(lookupMatches(d, 'कम').map((x) => x.id)).toEqual(['ta:x/less'])
  })
  test('the names of a map are built once', () => {
    const first = lookupMatches(maps, 'grace')
    expect(lookupMatches(maps, 'grace')).toEqual(first)
  })
  test('several words match in any order, as whole words or word starts', () => {
    expect(lookupMatches(taMaps, 'team translation').map((m) => m.id)).toEqual(['ta:manage/translate-team'])
    expect(lookupMatches(taMaps, 'transl tea').map((m) => m.id)).toEqual(['ta:manage/translate-team'])
    expect(lookupMatches(taMaps, 'team horse')).toEqual([])
  })
  test('function words are ignored by the several-word rule, content words of two letters are kept', () => {
    expect(lookupMatches(taMaps, 'how to team').map((m) => m.id)).toEqual(['ta:manage/translate-team'])
    expect(lookupMatches(taMaps, 'a to')).toEqual([])
    expect(lookupMatches(rank, 'gracia y fe').map((m) => m.id)).toEqual(['ta:x/faith'])
    expect(lookupMatches(rank, 'y fe de gracia').map((m) => m.id)).toEqual(['ta:x/faith'])
    expect(lookupMatches(rank, 'y fe de paz')).toEqual([])
    expect(lookupMatches(rank, 'का टीम अनुवाद').map((m) => m.id)).toEqual(['ta:x/hi'])
    expect(lookupMatches(rank, 'का अनुवाद').map((m) => m.id)).toEqual(['ta:x/hi'])
    expect(lookupMatches(rank, 'का किताब')).toEqual([])
    expect(lookupMatches(rank, 'من فريق').map((m) => m.id)).toEqual(['ta:x/ar'])
    expect(lookupMatches(rank, 'من كتاب')).toEqual([])
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
  test('a subtitle never becomes names[0]: an id with no title gets none', () => {
    const m = { revision: 1, map: { core: { lang: 'x', names: {}, subtitles: { 'ta:x/orphan': 'Orphan question here' } }, parts: new Map() } } as never
    expect(lookupMatches(m, 'orphan question')).toEqual([])
  })
  test('question words are ignored in every language', () => {
    const q = {
      revision: 1,
      map: { core: { lang: 'x', names: { 'ta:a/met-es': ['Metáfora'], 'ta:a/met-fr': ['Métaphore'], 'ta:a/met-en': ['Metaphor'], 'ta:a/met-id': ['Metafora'] } }, parts: new Map() },
    } as never
    expect(lookupMatches(q, 'qué es la metáfora').map((x) => x.id)).toContain('ta:a/met-es')
    expect(lookupMatches(q, "qu'est-ce qu'une métaphore").map((x) => x.id)).toContain('ta:a/met-fr')
    expect(lookupMatches(q, 'what is a metaphor').map((x) => x.id)).toContain('ta:a/met-en')
    expect(lookupMatches(q, 'apa itu metafora').map((x) => x.id)).toContain('ta:a/met-id')
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
  test('the second lookup of a reader reuses the built entries, and results are copies', async () => {
    server = startFakeServer(sample, {})
    const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await client.install('es-419', { books: [] })
    const r = await client.open('es-419')
    const a = await r.lookup('abstractnouns')
    const before = lookupStats.builds
    const b = await r.lookup('abstractnouns')
    expect(lookupStats.builds).toBe(before)
    expect(b.data!.matches).toEqual(a.data!.matches)
    // Mutating a result does not touch later lookups.
    const snap = structuredClone(a.data!.matches)
    a.data!.matches[0]!.names.push('corrupt')
    a.data!.matches[0]!.names[0] = 'changed'
    const c = await r.lookup('abstractnouns')
    expect(c.data!.matches).toEqual(snap)
    expect(a.data!.matches[0]!.names).not.toBe(c.data!.matches[0]!.names)
    expect(lookupStats.builds).toBe(before)
  })
  test('a query of only punctuation gives no matches; non-strings and blank text are E_ARG', async () => {
    server = startFakeServer(sample, {})
    const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await client.install('es-419', { books: [] })
    const r = await client.open('es-419')
    expect((await r.lookup('???')).data!.matches).toEqual([])
    await expect(r.lookup('')).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.lookup('   ')).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.lookup(5 as never)).rejects.toMatchObject({ code: 'E_ARG' })
  })
})
