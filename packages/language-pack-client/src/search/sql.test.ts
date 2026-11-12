import { Database } from 'bun:sqlite'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient, type LanguagePackClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, retitleTw, rewordTitusNote, type Sample } from '../../test/sample'
import type { TrustPolicy } from '../verify'
import { memoryIndex } from './memory'
import { type SqlDriver, sqlIndex } from './sql'
import type { SearchIndex } from './types'

/** bun:sqlite as a SqlDriver: the only place the package imports it. */
export function bunDriver(db = new Database(':memory:')): SqlDriver {
  return {
    async exec(sql) {
      db.exec(sql)
    },
    async run(sql, params) {
      db.query(sql).run(...(params as never[]))
    },
    async all<T>(sql: string, params: unknown[]) {
      return db.query(sql).all(...(params as never[])) as T[]
    },
    async transaction<T>(fn: () => Promise<T>) {
      db.exec('BEGIN')
      try {
        const r = await fn()
        db.exec('COMMIT')
        return r
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  }
}

const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let sample: Sample
let sample2: Sample
let trust: TrustPolicy
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  sample2 = await buildSample({ revision: 2, tweak: rewordTitusNote() })
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

function setup(content: Sample, index?: SearchIndex, store = memoryStore()): LanguagePackClient {
  server?.stop()
  server = startFakeServer(content, {})
  return createClient({ store, source: httpSource({ base: server.url }), trust, ...(index ? { index } : {}) })
}

/** The default units before OBS joined them: for tests that need obs absent. */
const NO_OBS = ['xmap', 'map', 'xtopics', 'topics']

const key = (hits: { kind: string; ref: string; book: string }[]) => hits.map((h) => `${h.kind}|${h.book}|${h.ref}`).sort()

describe('sqlIndex through the client', () => {
  test('finds Titus hits with refs; accent-insensitive; the snippet and score', async () => {
    const client = setup(sample, sqlIndex(bunDriver()))
    await client.install('es-419', { books: ['tit'] })
    const reader = await client.open('es-419')
    const a = await reader.search('Pablo', { limit: 100 })
    expect(a.query).toBe('search')
    expect(a.data!.length).toBeGreaterThan(3)
    expect(a.data!.every((h) => h.book === 'tit' && /^\d+:/.test(h.ref) && h.snippet.includes('«'))).toBe(true)
    expect(a.data!.map((h) => h.kind)).toContain('text')
    expect(a.data![0]!.score).toBeGreaterThanOrEqual(a.data![a.data!.length - 1]!.score)
    expect(a.cites.length).toBe(a.data!.length)
    expect(a.cites[0]!.release).toMatch(/^v\d+/)
    expect(a.revision.units['book:tit']).toBe(1)
    const plain = await reader.search('introduccion', { limit: 100 })
    const accented = await reader.search('Introducción', { limit: 100 })
    expect(plain.data!.length).toBeGreaterThan(0)
    expect(key(plain.data!)).toEqual(key(accented.data!))
    expect((await reader.search('cual')).data!.length).toBeGreaterThan(0)
  })

  test('quotes, stars and punctuation do not throw; empty gives []', async () => {
    const client = setup(sample, sqlIndex(bunDriver()))
    await client.install('es-419', { books: ['tit'] })
    const reader = await client.open('es-419')
    for (const q of ['"', 'Pablo"* OR', 'NEAR(a b) "x', '*', '', '   ', '¿?!', 'a" b"c', 'AND']) {
      const a = await reader.search(q)
      expect(Array.isArray(a.data)).toBe(true)
    }
    expect((await reader.search('"')).data).toEqual([])
    expect((await reader.search('Pablo*')).data!.length).toBeGreaterThan(0)
  })

  test('filters: books, kinds, limit', async () => {
    const client = setup(sample, sqlIndex(bunDriver()))
    await client.install('es-419', { books: ['tit'] })
    const reader = await client.open('es-419')
    const all = (await reader.search('Pablo', { limit: 100 })).data!
    expect((await reader.search('Pablo', { books: ['tit'], limit: 100 })).data!.length).toBe(all.length)
    expect((await reader.search('Pablo', { books: ['rom'] })).data).toEqual([])
    const notes = (await reader.search('Pablo', { kinds: ['note'], limit: 100 })).data!
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.every((h) => h.kind === 'note' && h.id !== undefined)).toBe(true)
    expect((await reader.search('Pablo', { limit: 2 })).data!.length).toBe(2)
    expect((await reader.search('Pablo')).data!.length).toBe(Math.min(20, all.length))
  })

  test('a new revision removes the rows of the old segment', async () => {
    const real = sqlIndex(bunDriver())
    const added: string[] = []
    const index = { ...real, addBook: (l: string, b: Parameters<typeof real.addBook>[1], id: string) => (added.push(id), real.addBook(l, b, id)) }
    const store = memoryStore()
    const client = setup(sample, index, store)
    await client.install('es-419', { books: ['tit'] })
    const before = (await (await client.open('es-419')).search('Pablo', { limit: 500 })).data!
    expect(added.length).toBe(1)
    const client2 = setup(sample2, index, store)
    await client2.refresh('es-419')
    await client2.install('es-419', { books: ['tit'] })
    const after = (await (await client2.open('es-419')).search('Pablo', { limit: 500 })).data!
    expect(after.length).toBe(before.length)
    expect(key(after)).toEqual(key(before))
    expect((await (await client2.open('es-419')).search('otra palabra', { kinds: ['note'] })).data!.length).toBe(1)
    expect(added.length).toBe(2)
    expect(added[1]).not.toBe(added[0])
    expect(await index.has(added[0]!)).toBe(false)
    expect(await index.has(added[1]!)).toBe(true)
  })

  test('the same hits (by kind, book and ref) from the memory index', async () => {
    const withSql = setup(sample, sqlIndex(bunDriver()))
    await withSql.install('es-419', { books: ['tit'] })
    const a = await (await withSql.open('es-419')).search('Pablo', { limit: 500 })
    const mem = setup(sample, memoryIndex())
    await mem.install('es-419', { books: ['tit'] })
    const b = await (await mem.open('es-419')).search('Pablo', { limit: 500 })
    const fallback = setup(sample)
    await fallback.install('es-419', { books: ['tit'] })
    const c = await (await fallback.open('es-419')).search('Pablo', { limit: 500 })
    expect(key(b.data!)).toEqual(key(a.data!))
    expect(key(c.data!)).toEqual(key(a.data!))
    for (const q of ['introduccion', 'Cuál', 'Tito Pablo']) {
      const x = await (await withSql.open('es-419')).search(q, { limit: 500 })
      const y = await (await fallback.open('es-419')).search(q, { limit: 500 })
      expect(key(y.data!)).toEqual(key(x.data!))
    }
  })

  test('an index filled through importTransfer', async () => {
    const a = setup(sample)
    await a.install('es-419', { books: ['tit'] })
    const bytes = await a.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] })
    const b = setup(sample, sqlIndex(bunDriver()))
    await b.importTransfer(bytes)
    expect((await (await b.open('es-419')).search('Pablo')).data!.length).toBeGreaterThan(0)
  })

  test('an index that fails does not corrupt the install: it is recorded', async () => {
    const broken = sqlIndex(bunDriver())
    const bad = { ...broken, addBook: async () => { throw new Error('disk full') } }
    const client = setup(sample, bad)
    const report = await client.install('es-419', { books: ['tit'] })
    expect(report.activated).toContain('es-419/book:tit')
    expect(client.indexProblems().length).toBeGreaterThan(0)
    expect((await client.status('es-419')).units.find((u) => u.key === 'es-419/book:tit')!.installed).toBe(true)
  })

  test('notInstalled lists the books not installed, with bytes', async () => {
    const client = setup(sample, sqlIndex(bunDriver()))
    await client.install('es-419', { books: ['tit'], defaults: false, units: NO_OBS })
    const a = await (await client.open('es-419')).search('Pablo')
    // Titus is installed; the sample also lists the obs unit, which is not.
    expect(a.data!.length).toBeGreaterThan(0)
    expect(a.notInstalled.map((n) => n.unit)).toEqual(['obs'])
    const none = setup(sample)
    await none.refresh('es-419')
    const b = await (await none.open('es-419')).search('Pablo')
    expect(b.data).toEqual([])
    expect(b.notInstalled.map((n) => n.unit)).toContain('book:tit')
  })
})

describe('OBS in the search index', () => {
  async function readerWith(index: SearchIndex | undefined, want: { units?: string[]; books: string[] }, content: Sample = sample) {
    const client = setup(content, index)
    await client.install('es-419', want as never)
    return client.open('es-419')
  }
  test('a search for the title of story 1 finds it', async () => {
    const r = await readerWith(sqlIndex(bunDriver()), { units: ['obs'], books: [] })
    const a = await r.search('creación', { kinds: ['title'] })
    expect(a.data!.map((h) => [h.kind, h.book, h.ref])).toEqual([['title', 'obs', '01:0']])
    expect(a.cites.map((c) => c.ref)).toEqual(['obs 01:0'])
    expect(a.revision.units.obs).toBeDefined()
    expect(a.notInstalled.map((n) => n.unit)).not.toContain('obs')
  })
  test('frame text, an OBS note and an OBS question are found with book obs', async () => {
    const r = await readerWith(sqlIndex(bunDriver()), { units: ['obs'], books: [] })
    expect((await r.search('mundo', { kinds: ['text'] })).data!.map((h) => [h.book, h.ref])).toEqual([['obs', '01:01']])
    const n = (await r.search('metáfora')).data!
    expect(n.map((h) => [h.kind, h.book, h.ref])).toEqual([['note', 'obs', '01:02']])
    expect(n[0]!.id).toBe('n001')
    const q = (await r.search('Dios', { kinds: ['question'] })).data!
    expect(q.map((h) => [h.kind, h.book, h.ref, h.id])).toEqual([['question', 'obs', '01:01', 'q001']])
  })
  test('kinds: ["title"] filters', async () => {
    const r = await readerWith(sqlIndex(bunDriver()), { units: ['obs'], books: [] })
    expect((await r.search('pecado', { kinds: ['title'] })).data!.map((h) => h.ref)).toEqual(['02:0'])
    expect((await r.search('serpiente', { kinds: ['title'] })).data).toEqual([])
    expect((await r.search('serpiente')).data!.length).toBeGreaterThan(0)
  })
  test('obs not installed: no OBS hits and notInstalled obs', async () => {
    const r = await readerWith(sqlIndex(bunDriver()), { units: NO_OBS, defaults: false, books: ['tit'] })
    const a = await r.search('creación')
    expect(a.data).toEqual([])
    expect(a.notInstalled.map((n) => n.unit)).toEqual(['obs'])
    expect(a.notInstalled[0]!.bytes).toBe(r.size('obs'))
    expect((await r.search('Pablo', { books: ['tit'] })).notInstalled).toEqual([])
  })
  test('the same hits from the SQL index, the memory index and no index', async () => {
    const out: string[][] = []
    for (const ix of [sqlIndex(bunDriver()), memoryIndex(), undefined]) {
      const r = await readerWith(ix, { units: ['obs'], books: ['tit'] })
      const all: string[] = []
      for (const q of ['creación', 'mundo', 'metáfora', 'creó', 'Dios', 'Pablo']) all.push(...key((await r.search(q, { limit: 1000 })).data!), '--')
      out.push(all)
    }
    expect(out[1]).toEqual(out[0]!)
    expect(out[2]).toEqual(out[0]!)
    expect(out[0]!.some((k) => k.startsWith('title|obs'))).toBe(true)
  })
  test('an empty title has no title row, in either index', async () => {
    const empty = await buildSample({
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
    for (const ix of [sqlIndex(bunDriver()), memoryIndex(), undefined]) {
      const r = await readerWith(ix, { units: ['obs'], books: [] }, empty)
      expect((await r.search('pecado', { kinds: ['title'] })).data).toEqual([])
      expect((await r.search('Story', { kinds: ['title'] })).data).toEqual([])
      expect((await r.search('creación', { kinds: ['title'] })).data!.length).toBe(1)
      expect((await r.search('serpiente')).data!.length).toBe(1)
    }
  })
  test('removing the obs segment removes its rows (SQL)', async () => {
    const ix = sqlIndex(bunDriver())
    await ix.init()
    await ix.addObs('xx', { lang: 'xx', res: [['r/obs', 'v1']], stories: [{ res: 'r/obs', n: 1, title: 'La creación', frames: [{ n: 1, text: 'Dios' }] }] }, 'o1')
    expect(await ix.has('o1')).toBe(true)
    expect((await ix.search('xx', 'creación')).length).toBe(1)
    await ix.removeSegment('o1')
    expect(await ix.has('o1')).toBe(false)
    expect(await ix.search('xx', 'creación')).toEqual([])
  })
})

describe('article sections in the index', () => {
  test('installing an art: unit adds its segment, section hits cite it, and prune removes it', async () => {
    const index = sqlIndex(bunDriver())
    const client = setup(sample, index)
    await client.install('es-419', { books: ['tit'] })
    const reader = await client.open('es-419')
    const arts = (await reader.articles('tw:kt'))!
    const art = arts.find((a) => a.sections.some((x) => x.md.trim() !== ''))!
    const sec = art.sections.find((x) => x.md.trim() !== '')!
    const word = /[\p{L}]{6,}/u.exec(sec.md)![0]
    const r = await reader.search(word, { kinds: ['section'], limit: 100 })
    const hit = r.data!.find((h) => h.id === `${art.id}#${sec.sid}`)!
    expect(hit).toMatchObject({ kind: 'section', book: '', ref: '', res: art.res })
    expect(r.cites.find((c) => c.id === hit.id)).toMatchObject({ res: art.res, release: expect.any(String) })
    expect('ref' in r.cites.find((c) => c.id === hit.id)!).toBe(false)
    const artSeg = (await client.status('es-419')).units.find((u) => u.key === 'es-419/art:tw:kt')
    expect(artSeg?.installed).toBe(true)
    const mem = setup(sample)
    await mem.install('es-419', { books: ['tit'] })
    const m = await (await mem.open('es-419')).search(word, { kinds: ['section'], limit: 100 })
    expect(m.data!.map((h) => h.id).sort()).toEqual(r.data!.map((h) => h.id).sort())
  })
  test('the index has the art: segment while installed and not after the unit is gone', async () => {
    const real = sqlIndex(bunDriver())
    const added: string[] = []
    const index = { ...real, addArticles: (l: string, a: Parameters<typeof real.addArticles>[1], id: string) => (added.push(id), real.addArticles(l, a, id)) }
    const client = setup(sample, index)
    await client.install('es-419', { books: ['tit'] })
    await client.open('es-419')
    expect(added.length).toBeGreaterThan(0)
    for (const id of added) expect(await index.has(id)).toBe(true)
    // A new revision of the articles replaces the segment: the old one leaves the index, the new one is in it.
    const store = memoryStore()
    const seen: string[] = []
    const real2 = sqlIndex(bunDriver())
    const spy = { ...real2, addArticles: (l: string, a: Parameters<typeof real.addArticles>[1], id: string) => (seen.push(id), real2.addArticles(l, a, id)) }
    await setup(sample, spy, store).install('es-419', { books: ['tit'] })
    const c3 = setup(await buildSample({ revision: 3, tweak: retitleTw() }), spy, store)
    await c3.refresh('es-419')
    await c3.install('es-419', { books: ['tit'] })
    await c3.prune()
    const fresh = seen.filter((id) => !added.includes(id))
    expect(seen.filter((id) => added.includes(id)).length).toBeGreaterThan(0)
    expect(fresh.length).toBeGreaterThan(0)
    for (const id of fresh) expect(await real2.has(id)).toBe(true)
    for (const id of added) expect(await real2.has(id)).toBe(false)
  })
})

describe('sqlIndex stems', () => {
  const mk = (lang: string, text: string): import('@bt-synergy/language-pack-v3').BookModel => ({
    lang,
    book: 'rut',
    orig: ['o', 'v1'],
    res: [['r/t', 'v1']],
    texts: [{ res: 'r/t', pieces: [[text, false]], events: [[0, 'chapter', '1'], [0, 'verse', '1']] }],
  })
  test('stems match other forms; the snippet marks the original word; fr only exact', async () => {
    const ix = sqlIndex(bunDriver())
    await ix.init()
    await ix.addBook('es-419', mk('es-419', 'Las gracias de Dios'), 's1')
    await ix.addBook('en', mk('en', 'he blessed them'), 's2')
    await ix.addBook('fr', mk('fr', 'les graces et les gracias'), 's3')
    const es = await ix.search('es-419', 'gracia')
    expect(es.length).toBe(1)
    expect(es[0]!.snippet).toContain('«gracias»')
    expect((await ix.search('en', 'bless')).length).toBe(1)
    expect(await ix.search('fr', 'gracia')).toEqual([])
    expect((await ix.search('fr', 'gracias')).length).toBe(1)
  })
  test('a version 1 database is rebuilt by init', async () => {
    const db = new Database(':memory:')
    db.exec(`CREATE VIRTUAL TABLE pieces USING fts5(body, kind UNINDEXED, lang UNINDEXED, book UNINDEXED, ref UNINDEXED, res UNINDEXED, rid UNINDEXED, seg UNINDEXED);
      CREATE TABLE indexed (seg TEXT PRIMARY KEY, lang TEXT, book TEXT); INSERT INTO indexed VALUES ('s1', 'es', 'rut');`)
    const ix = sqlIndex(bunDriver(db))
    await ix.init()
    expect(await ix.has('s1')).toBe(false)
    await ix.addBook('es', mk('es', 'Las gracias de Dios'), 's1')
    expect((await ix.search('es', 'gracia')).length).toBe(1)
    await ix.init()
    expect(await ix.has('s1')).toBe(true)
  })
  test('user text with quotes is never FTS5 syntax', async () => {
    const ix = sqlIndex(bunDriver())
    await ix.init()
    await ix.addBook('es', mk('es', 'Las gracias de Dios'), 's1')
    expect(await ix.search('es', 'gracia" OR x')).toEqual([])
    expect((await ix.search('es', 'gracia" dios')).length).toBe(1)
  })
})
