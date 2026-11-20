import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { ClientError } from '../errors'
import { conceptQuery, usageBooks } from './maps'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

let noTitle: Sample
let noNotes: Sample
beforeAll(async () => {
  sample = await buildSample()
  noTitle = await buildSample({
    revision: 2,
    tweak: {
      row: (row) => {
        if (!row.key.startsWith('obs:es-419_gl/es-419/obs:02')) return row
        const value = JSON.parse(JSON.stringify(row.value))
        value.content.title = ''
        return { ...row, value }
      },
    },
  })
  noNotes = await buildSample({ revision: 3, tweak: { omit: (row) => row.key.startsWith('tn:es-419_gl/es-419/obs-tn:') } })
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

/** The default units before OBS joined them: for tests that need obs absent. */
const NO_OBS = ['xmap', 'map', 'xtopics', 'topics']

async function open(opts: { defaults?: boolean; books?: string[]; units?: string[] }, content: Sample = sample) {
  server?.stop()
  server = startFakeServer(content, {})
  const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
  await client.install('es-419', opts)
  return client.open('es-419')
}

// The sample is Titus only: `tit` stands where the plan says Ruth, and `isa` is a book the sample does not cover.
const METAPHOR = 'ta:translate/figs-abstractnouns'

describe('books', () => {
  test('a Strong key: the occurrences per book from the xmap table, a short Greek key resolved', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.books({ strong: 'G3972' })
    expect(a.query).toBe('books')
    expect(Object.keys(a.data!.books)).toHaveLength(66)
    expect(a.data!.books.tit!.state).toBe('count')
    expect(a.data!.books.tit!.count).toBeGreaterThan(0)
    expect(a.data!.books.tit!.installed).toBe(true)
    expect(a.data!.books.isa!.state).toBe('none')
    expect(((await r.books({ strong: 'G39720' })).data!.books.tit)).toEqual(a.data!.books.tit)
    for (const k of ['G3972', 'g3972', 'G39720']) expect((await r.books({ strong: k })).data!.books.tit).toEqual(a.data!.books.tit)
    const g26 = await r.books({ strong: 'G26' })
    expect(g26.data!.books.tit).toEqual((await r.books({ strong: 'G0026' })).data!.books.tit)
    expect(g26.data!.books.tit).toEqual((await r.books({ strong: 'g26' })).data!.books.tit)
    await expect(r.books({ strong: 'G1', article: 'tw:kt/grace' } as never)).rejects.toThrow(ClientError)
    await expect(r.books({ strong: '' })).rejects.toThrow(ClientError)
  })
  test('an article: count where the notes cite it, none where the tN does not cover the book (never zero)', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.books({ article: METAPHOR })
    expect(a.query).toBe('books')
    const books = a.data!.books
    // The language's own tN (es-419, the map's usage table), not the English one.
    expect(books.tit).toEqual({ state: 'count', count: 14, verses: 9, installed: true })
    expect(books.isa!.state).toBe('none')
    expect(books.isa!.installed).toBe(false)
    expect(books.isa!.count).toBeUndefined()
    expect(Object.values(books).some((b) => b.state === 'zero')).toBe(false)
    expect(Object.keys(books)).toHaveLength(66)
    expect(a.revision.units.map).toBeGreaterThan(0)
  })
  test('a language map with no tN of its own gives every cell none, never zero', () => {
    const m = { revision: 1, map: { core: { lang: 'fr', res: [['unfoldingWord/en/tn', 'v1']], coverage: new Map(), usage: undefined }, parts: new Map() } } as never
    const cells = Object.values(usageBooks(m, 'ta:translate/figs-metaphor'))
    expect(cells).toHaveLength(66)
    expect(cells.every((c) => c.state === 'none')).toBe(true)
  })
  test('English: the English tN is its own, so a ta: article counts its notes in every book', () => {
    const TN = 'unfoldingWord/en/tn'
    const notes = { unit: 'notes', rows: new Map([['ta:translate/figs-metaphor', new Map([['psa', [140, 120]]])]]) }
    const coverage = new Map([[TN, { whole: ['psa', 'tit'], partial: [] }]])
    const m = {
      revision: 1,
      xmap: { core: { coverage, notes, links: undefined, strong: { unit: 'occurrences', rows: new Map() } }, parts: new Map() },
      map: { core: { lang: 'en', res: [[TN, 'v1']], coverage: new Map(), usage: undefined }, parts: new Map() },
    } as never
    const books = usageBooks(m, 'ta:translate/figs-metaphor')
    expect(books.psa).toEqual({ state: 'count', count: 140, verses: 120 })
    expect(books.tit).toEqual({ state: 'zero', count: 0, verses: 0 })
    expect(books.gen!.state).toBe('none')
  })
  test('a tW article reads the word links', async () => {
    const r = await open({ books: ['tit'] })
    expect((await r.books({ article: 'tw:kt/apostle' })).data!.books.tit!.state).toBe('count')
  })
  test('an article or a tW concept with obs not installed lists obs in notInstalled', async () => {
    const r = await open({ defaults: false, units: NO_OBS, books: ['tit'] })
    for (const q of [{ article: 'ta:translate/figs-metaphor' }, { concept: 'tw:kt/god' }]) {
      const a = await r.books(q)
      expect(a.data!.obs).toMatchObject({ state: 'none', installed: false })
      expect(a.notInstalled.find((n) => n.unit === 'obs')).toEqual({ unit: 'obs', bytes: r.size('obs') })
    }
  })
  test('a concept that is a topic flags installed per book', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.books({ concept: 'per:abraham' })
    expect(a.data!.books.tit!.installed).toBe(true)
    expect(a.data!.books.gen!.installed).toBe(false)
    expect(a.data!.installed).toBeUndefined()
    // The sample's topic source does not cover Titus for persons: the cell says so, it is not a zero.
    expect(a.data!.books.tit).toEqual({ state: 'none', installed: true })
    const sec = await r.books({ concept: 'sec:tit/1-1' })
    expect(sec.data!.books.tit).toMatchObject({ state: 'count', count: 16, installed: true })
    expect(a.revision.units.xtopics).toBeGreaterThan(0)
  })
  test('a topic without xtopics: installed false and no per-book states', async () => {
    const r = await open({ defaults: false, books: ['tit'] })
    const a = await r.books({ concept: 'per:abraham' })
    expect(a.data).toEqual({ installed: false, books: {} })
  })
  test('bad arguments are E_ARG', async () => {
    const r = await open({ books: ['tit'] })
    await expect(r.books({} as never)).rejects.toBeInstanceOf(ClientError)
    await expect(r.books({ article: 'nonsense' })).rejects.toMatchObject({ code: 'E_ARG' })
  })
})

describe('concept', () => {
  test('lists the books it is counted in that are not installed, with bytes', async () => {
    const r = await open({ books: [] })
    const a = await r.concept(METAPHOR)
    expect(a.query).toBe('concept')
    expect((a.data as { found: boolean }).found).toBe(true)
    const miss = a.notInstalled.find((n) => n.unit === 'book:tit')
    expect(miss).toMatchObject({ book: 'tit', bytes: r.size('book:tit') })
    expect(miss!.bytes).toBeGreaterThan(0)
    expect(a.revision.units.xmap).toBeGreaterThan(0)
  })
  test('only obs is missing', async () => {
    const r = await open({ defaults: false, units: NO_OBS, books: ['tit'] })
    // The obs unit is not installed here: it is the only thing missing.
    expect((await r.concept(METAPHOR)).notInstalled.map((n) => n.unit)).toEqual(['obs'])
  })
})

describe('topics', () => {
  test('without xtopics: installed false', async () => {
    const r = await open({ defaults: false, books: ['tit'] })
    expect((await r.topics()).data).toEqual({ installed: false })
    expect((await r.topics({ category: 'person' })).data).toEqual({ kind: 'category', topicKind: 'person', installed: false })
    expect((await r.topics({ book: 'tit' })).data).toMatchObject({ installed: false })
  })
  test('a category: ids sorted', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.topics({ category: 'person' })
    const ids = (a.data as { ids: string[] }).ids
    expect(ids).toContain('per:abraham')
    expect(ids).toEqual([...ids].sort())
    expect(a.revision.units.xtopics).toBeGreaterThan(0)
  })
  test('no argument: the categories with their counts', async () => {
    const r = await open({ books: ['tit'] })
    const d = (await r.topics()).data as { installed: boolean; categories: Record<string, number> }
    expect(d.installed).toBe(true)
    expect(Object.keys(d.categories)).toEqual(['person', 'place', 'event', 'topic', 'story', 'section'])
    expect(d.categories.person).toBe(7)
  })
  test('a book: its topics', async () => {
    const r = await open({ books: ['tit'] })
    const d = (await r.topics({ book: 'tit' })).data as { installed: boolean; topics: { id: string; kind: string }[] }
    expect(d.installed).toBe(true)
    expect(d.topics.map((t) => t.id)).toContain('sec:tit/1-1')
  })
  test('bad arguments are E_ARG', async () => {
    const r = await open({ books: ['tit'] })
    await expect(r.topics({ category: 'nope' })).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.topics({ book: 'zzz' })).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.topics({ book: 'tit', category: 'person' })).rejects.toMatchObject({ code: 'E_ARG' })
  })
})

describe('renderings', () => {
  test('a Strong of Titus 1:1: renderings with count and refs', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.renderings({ strong: 'G39720' })
    expect(a.query).toBe('renderings')
    expect(a.data!.strong).toBe('G39720')
    const pablo = a.data!.renderings.find((x) => x.text === 'Pablo')
    expect(pablo).toBeDefined()
    expect(pablo!.count).toBeGreaterThan(0)
    expect(pablo!.refs).toContain('tit 1:1')
    expect(a.revision.units['book:tit']).toBeGreaterThan(0)
    expect(a.revision.units['orig:tit']).toBeGreaterThan(0)
    expect(a.cites.length).toBeGreaterThan(0)
  })
  test('both texts are merged, a word is a rendering with its neighbours, refs have no duplicates', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.renderings({ strong: 'G23160' })
    expect(new Set(a.cites.map((c) => c.res))).toEqual(new Set(['es-419_gl/es-419/glt', 'es-419_gl/es-419/gst']))
    const by = Object.fromEntries(a.data!.renderings.map((x) => [x.text, x]))
    // "de Dios" translates one original word: one rendering, not "de" and "Dios".
    expect(by['de Dios']!.refs).toContain('tit 1:1')
    expect(by['de']).toBeUndefined()
    // A word that both texts (and several verses) use counts every time, its refs once each.
    expect(by['Dios']!.count).toBeGreaterThan(by['Dios']!.refs.length)
    for (const x of a.data!.renderings) expect(new Set(x.refs).size).toBe(x.refs.length)
    const total = a.data!.renderings.reduce((n, x) => n + x.count, 0)
    expect(total).toBeGreaterThanOrEqual(27)
  })
  test('{ book, word } takes the Strong of that word', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.renderings({ book: 'tit', word: 0 })
    expect(a.data!.strong).toBe('G39720')
    expect(a.data!.renderings.length).toBeGreaterThan(0)
  })
  test('books counted but not installed go to notInstalled', async () => {
    const r = await open({ books: [] })
    const a = await r.renderings({ strong: 'G39720' })
    expect(a.data!.renderings).toEqual([])
    expect(a.notInstalled.some((n) => n.unit === 'book:tit' && n.bytes > 0)).toBe(true)
  })
  test('bad arguments are E_ARG', async () => {
    const r = await open({ books: ['tit'] })
    await expect(r.renderings({ book: 'tit', word: 99999 })).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(r.renderings({ book: 'tit', word: -1 })).rejects.toMatchObject({ code: 'E_ARG'
 })
    await expect(r.renderings({} as never)).rejects.toMatchObject({ code: 'E_ARG' })
  })
})

describe('OBS stories of a concept', () => {
  test('tw:kt/god lists OBS frames', async () => {
    const r = await open({ units: ['obs'], books: [] })
    const a = await r.concept('tw:kt/god')
    const obs = (a.data as { obs: { stories: { n: number; id: string; title: string; frames?: string[] }[] } }).obs
    expect(obs.stories.map((x) => [x.n, x.id, x.title, x.frames])).toEqual([[1, 'obs:1', 'La creación', ['01:01']]])
    expect(a.notInstalled.some((n) => n.unit === 'obs')).toBe(false)
  })
  test('ta:translate/figs-metaphor counts OBS notes', async () => {
    const r = await open({ units: ['obs'], books: [] })
    const a = await r.concept('ta:translate/figs-metaphor')
    const obs = (a.data as { obs: { stories: { n: number; count?: number }[] } }).obs
    expect(obs.stories.map((x) => [x.n, x.count])).toEqual([[1, 1]])
  })
  test('a story with no title shows Story N in the concept', async () => {
    const r = await open({ units: ['obs'], books: [] }, noTitle)
    const m = await r.maps()
    const parts = new Map(m.xtopics!.parts)
    parts.set('gen', { occurrences: new Map([['ev:creation-of-all-things', [1003001]]]) } as never)
    const patched = { ...m, xtopics: { ...m.xtopics!, parts } }
    const a = await conceptQuery({ ...r, maps: async () => patched } as never, 'ev:creation-of-all-things')
    expect((a.data as { obs: { stories: { title: string }[] } }).obs.stories.map((s) => s.title)).toEqual(['Story 2'])
  })
  test('a per: topic lists the stories that overlap its verses, without the obs unit', async () => {
    const r = await open({ books: [] })
    // The sample's topics occur in Titus only, where no story is: give the creation event Genesis 1:5 and Exodus 7:1.
    const m = await r.maps()
    const parts = new Map(m.xtopics!.parts)
    parts.set('gen', { occurrences: new Map([['ev:creation-of-all-things', [1001005, 2007001]]]) } as never)
    const patched = { ...m, xtopics: { ...m.xtopics!, parts } }
    const a = await conceptQuery({ ...r, maps: async () => patched } as never, 'ev:creation-of-all-things')
    const obs = (a.data as { obs?: { stories: { n: number; id: string; title: string; refs: string[] }[] } }).obs
    expect(obs!.stories.map((s) => [s.n, s.id, s.title])).toEqual([[1, 'obs:1', 'La creación'], [10, 'obs:10', obs!.stories[1]!.title]])
    expect(obs!.stories[0]!.refs).toEqual(['gen 1:1-2:25'])
    expect(a.notInstalled.some((n) => n.unit === 'obs')).toBe(false)
    // A topic with no overlapping story has no obs field.
    expect(((await r.concept('per:abraham')).data as { obs?: unknown }).obs).toBeUndefined()
  })
  test('obs not installed: concept obs is installed:false and notInstalled has obs', async () => {
    const r = await open({ defaults: false, units: NO_OBS, books: [] })
    const a = await r.concept('tw:kt/god')
    expect((a.data as { obs: unknown }).obs).toEqual({ installed: false })
    const n = a.notInstalled.find((x) => x.unit === 'obs')
    expect(n!.bytes).toBeGreaterThan(0)
  })
  test('books({article}) has an obs cell with the count', async () => {
    const r = await open({ units: ['obs'], books: ['tit'] })
    expect((await r.books({ article: 'ta:translate/figs-metaphor' })).data!.obs).toEqual({ state: 'count', count: 1, installed: true })
    expect((await r.books({ concept: 'tw:kt/god' })).data!.obs).toEqual({ state: 'count', count: 1, installed: true })
    const off = await open({ defaults: false, units: NO_OBS, books: [] })
    const cell = (await off.books({ article: 'ta:translate/figs-metaphor' })).data!.obs!
    expect(cell).toMatchObject({ state: 'none', installed: false })
    expect(cell.bytes).toBeGreaterThan(0)
  })
  test('a language without OBS notes: the obs cell of an article is none', async () => {
    const r = await open({ units: ['obs'], books: [] }, noNotes)
    expect((await r.books({ article: 'ta:translate/figs-metaphor' })).data!.obs).toEqual({ state: 'none', installed: true })
    const c = (await r.concept('ta:translate/figs-metaphor')).data as { obs?: unknown }
    expect(c.obs).toBeUndefined()
  })
})
