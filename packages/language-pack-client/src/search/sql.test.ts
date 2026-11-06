import { Database } from 'bun:sqlite'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient, type LanguagePackClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, rewordTitusNote, type Sample } from '../../test/sample'
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
    await client.install('es-419', { books: ['tit'] })
    const a = await (await client.open('es-419')).search('Pablo')
    // The sample lists Titus only, and Titus is installed: nothing is missing.
    expect(a.data!.length).toBeGreaterThan(0)
    expect(a.notInstalled).toEqual([])
    const none = setup(sample)
    await none.refresh('es-419')
    const b = await (await none.open('es-419')).search('Pablo')
    expect(b.data).toEqual([])
    expect(b.notInstalled.map((n) => n.unit)).toContain('book:tit')
  })
})
