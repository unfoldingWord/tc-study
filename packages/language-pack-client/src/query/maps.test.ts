import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { ClientError } from '../errors'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'

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

// The sample is Titus only: `tit` stands where the plan says Ruth, and `isa` is a book the sample does not cover.
const METAPHOR = 'ta:translate/figs-abstractnouns'

describe('books', () => {
  test('an article: count where the notes cite it, none where the tN does not cover the book (never zero)', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.books({ article: METAPHOR })
    expect(a.query).toBe('books')
    const books = a.data!.books
    expect(books.tit).toEqual({ state: 'count', count: 23, verses: 16, installed: true })
    expect(books.isa!.state).toBe('none')
    expect(books.isa!.installed).toBe(false)
    expect(books.isa!.count).toBeUndefined()
    expect(Object.values(books).some((b) => b.state === 'zero')).toBe(false)
    expect(Object.keys(books)).toHaveLength(66)
    expect(a.revision.units.xmap).toBeGreaterThan(0)
  })
  test('a tW article reads the word links', async () => {
    const r = await open({ books: ['tit'] })
    expect((await r.books({ article: 'tw:kt/apostle' })).data!.books.tit!.state).toBe('count')
  })
  test('a concept that is a topic flags installed per book', async () => {
    const r = await open({ books: ['tit'] })
    const a = await r.books({ concept: 'per:abraham' })
    expect(a.data!.books.tit!.installed).toBe(true)
    expect(a.data!.books.gen!.installed).toBe(false)
    expect(['count', 'zero', 'partial', 'none']).toContain(a.data!.books.tit!.state)
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
  test('with the book installed nothing is missing', async () => {
    const r = await open({ books: ['tit'] })
    expect((await r.concept(METAPHOR)).notInstalled).toEqual([])
  })
})

describe('topics', () => {
  test('without xtopics: installed false', async () => {
    const r = await open({ defaults: false, books: ['tit'] })
    expect((await r.topics()).data).toEqual({ installed: false })
    expect((await r.topics({ category: 'person' })).data).toMatchObject({ installed: false })
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
