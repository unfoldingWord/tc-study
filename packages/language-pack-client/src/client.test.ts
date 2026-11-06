import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KNOWN, origView, readSegment, type RowSource, zipSource } from '@bt-synergy/language-pack-v3'
import { createClient } from './client'
import { ClientError } from './errors'
import { httpSource, type PackSource } from './source/http'
import { memoryStore } from './store/memory'
import type { BlobStore } from './store/types'
import { planInstall } from './plan'
import { emptyState } from './state'
import { verifyCatalogFile } from './verify'
import { type FakeServer, startFakeServer } from '../test/fakeServer'
import { newKey } from '../test/keys'
import { buildSample, rewordTitusNote, type Sample } from '../test/sample'

let sample: Sample
let sample2: Sample
let otherCommon: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
/** segment ids by unit key, from the sample's catalogs */
let segsOf: Record<string, string[]>
const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))

beforeAll(async () => {
  sample = await buildSample()
  sample2 = await buildSample({ revision: 2, tweak: rewordTitusNote() })
  otherCommon = await buildSample({ commonRevision: 2 })
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
  segsOf = {}
  for (const [name, bytes] of [['es-419', sample.langCatalog], ['common', sample.commonCatalog]] as const) {
    const c = await verifyCatalogFile(bytes, {}, { from: 'store' })
    for (const u of c.catalog.units) segsOf[`${name}/${u.id}`] = u.segments.map((i) => hexOf(c.catalog.segments[i]!.id))
  }
}, 120_000)

let server: FakeServer | undefined
afterEach(() => server?.stop())

function setup(o: Parameters<typeof startFakeServer>[1] = {}, content: Sample = sample, store: BlobStore = memoryStore()) {
  const srv = startFakeServer(content, o)
  server?.stop()
  server = srv
  const client = createClient({ store, source: httpSource({ base: srv.url }), trust })
  const segHits = () => srv.hits.filter((h) => h.startsWith('/v3/packs/seg/')).map((h) => h.slice('/v3/packs/seg/'.length))
  return { server: srv, store, client, segHits }
}

describe('install', () => {
  test('the default units and the book with what it needs, and no aligned unit', async () => {
    const { client, store } = setup()
    const report = await client.install('es-419', { books: ['tit'] })
    const keys = Object.keys((await store.getState())!.units)
    expect(keys).toEqual(
      expect.arrayContaining(['common/xmap', 'es-419/map', 'common/xtopics', 'es-419/topics', 'es-419/book:tit', 'common/orig:tit', 'es-419/art:tw:kt']),
    )
    expect(keys.some((k) => k.includes('/aligned:'))).toBe(false)
    expect(report.activated).toEqual(expect.arrayContaining(['es-419/book:tit', 'common/orig:tit']))
    expect(report.waiting).toEqual([])
    expect(report.bytes).toBeGreaterThan(0)
  })

  test('aligned by part id adds that part only', async () => {
    const { client, store } = setup()
    const part = Object.keys(segsOf).find((k) => k.startsWith('es-419/aligned:'))!.slice('es-419/'.length)
    await client.install('es-419', { aligned: [part.slice('aligned:'.length)] })
    const keys = Object.keys((await store.getState())!.units).filter((k) => k.includes('/aligned:'))
    expect(keys).toEqual([`es-419/${part}`])
  })

  test('a second install fetches nothing', async () => {
    const { client, server } = setup()
    await client.install('es-419', { books: ['tit'] })
    const n = server.hits.length
    const again = await client.install('es-419', { books: ['tit'] })
    expect(server.hits.length).toBe(n)
    expect(again.fetched).toEqual([])
  })

  test('progress is reported per segment', async () => {
    const { client } = setup()
    const seen: number[] = []
    const report = await client.install('es-419', {}, { onProgress: (p) => seen.push(p.done) })
    expect(seen.length).toBe(report.fetched.length)
    expect(seen.at(-1)).toBe(report.fetched.length)
  })

  test('an unknown language is E_NO_PACK', async () => {
    const { client } = setup()
    await expect(client.install('fr')).rejects.toMatchObject({ code: 'E_NO_PACK' })
  })

  test('a failed call does not poison the queue', async () => {
    const { client } = setup()
    await expect(client.install('fr')).rejects.toBeInstanceOf(ClientError)
    expect((await client.install('es-419')).waiting).toEqual([])
  })

  // A single 'drop' is retried by Bun's fetch and succeeds, so the cut is a 404 (E_NETWORK) here.
  test('Focus 1: a cut inside a unit leaves it inactive and the retry fetches only the missing segment', async () => {
    const [first, second] = segsOf['es-419/map']!
    expect(second).toBeDefined()
    const { client, store, segHits } = setup({ failSegment: (id, n) => (id === second && n === 1 ? 404 : 'ok') })
    const r1 = await client.install('es-419', { books: ['tit'] })
    const st = (await store.getState())!
    expect(st.units['es-419/map']).toBeUndefined()
    expect(r1.waiting.map((w) => w.key)).toEqual(expect.arrayContaining(['es-419/map', 'es-419/book:tit']))
    expect(await store.has(first!)).toBe(true)
    expect(await store.has(second!)).toBe(false)
    expect(st.units['common/xmap']).toBeDefined()
    const before = segHits().length
    const r2 = await client.install('es-419', { books: ['tit'] })
    expect(segHits().slice(before)).toEqual([second!])
    expect(r2.fetched).toEqual([second!])
    expect(r2.waiting).toEqual([])
    expect((await store.getState())!.units['es-419/book:tit']).toBeDefined()
  })

  test('a corrupt segment is reported in waiting and not stored', async () => {
    const [bad] = segsOf['es-419/book:tit']!
    const { client, store } = setup({ failSegment: (id) => (id === bad ? 'corrupt' : 'ok') })
    const report = await client.install('es-419', { books: ['tit'] })
    expect(report.waiting.find((w) => w.key === 'es-419/book:tit')?.missing).toContain(bad!)
    expect(await store.has(bad!)).toBe(false)
  })

  test('Focus 3: no common catalog, or another one: map and topics activate, book waits, no throw', async () => {
    for (const mode of ['none', 'other'] as const) {
      const { client, store } = setup(mode === 'none' ? { noCommon: true } : {}, mode === 'none' ? sample : { ...sample, commonCatalog: otherCommon.commonCatalog })
      const report = await client.install('es-419', { books: ['tit'] })
      const units = (await store.getState())!.units
      expect(units['es-419/map']).toBeDefined()
      expect(units['es-419/topics']).toBeDefined()
      expect(units['es-419/book:tit']).toBeUndefined()
      expect(report.waiting.map((w) => w.key)).toContain('es-419/book:tit')
      const status = await client.status('es-419')
      expect(status.missingCommon?.name).toBe('common')
      expect(status.missingCommon?.revision).toBe(1)
    }
  })

  test('Focus 3: the common catalog arriving later releases the book', async () => {
    const { client, store, server } = setup({}, { ...sample, commonCatalog: otherCommon.commonCatalog })
    await client.install('es-419', { books: ['tit'] })
    server.set(sample)
    const stale = await client.install('es-419', { books: ['tit'] }) // already published: no refresh
    expect(stale.activated).toEqual([])
    const refreshed = await client.refresh('es-419')
    expect(refreshed.missingCommon).toBeUndefined()
    const r = await client.install('es-419', { books: ['tit'] })
    expect(r.waiting).toEqual([])
    expect((await store.getState())!.units['es-419/book:tit']).toBeDefined()
    expect((await client.status('es-419')).missingCommon).toBeUndefined()
  })

  test('Focus 4: a store that fails on the third put gives E_STORE, the state before, and keeps the segments put', async () => {
    const inner = memoryStore()
    let puts = 0
    const store: BlobStore = {
      has: (id) => inner.has(id),
      get: (id) => inner.get(id),
      ids: () => inner.ids(),
      delete: (id) => inner.delete(id),
      getState: () => inner.getState(),
      setState: (s) => inner.setState(s),
      async put(id, bytes) {
        // catalogs are put too: only the segment puts are counted
        if (sample.segments.has(id) && ++puts === 3) throw new Error('QuotaExceededError')
        return inner.put(id, bytes)
      },
    }
    const { client, server } = setup({}, sample, store)
    await client.refresh('es-419')
    const before = await store.getState()
    const catalogIds = await inner.ids()
    // One request at a time, so exactly the two segments before the failing put are kept.
    await expect(client.install('es-419', { books: ['tit'] }, { concurrency: 1 })).rejects.toMatchObject({ code: 'E_STORE' })
    expect(await store.getState()).toEqual(before)
    const kept = (await inner.ids()).filter((id) => !catalogIds.includes(id))
    expect(kept.length).toBe(2)
    const retry = createClient({ store: inner, source: httpSource({ base: server.url }), trust })
    const r = await retry.install('es-419', { books: ['tit'] })
    expect(r.waiting).toEqual([])
    expect(r.fetched.some((id) => kept.includes(id))).toBe(false)
  })

  test('Focus 5: two installs at once fetch each id once and end as in sequence', async () => {
    const a = setup()
    await Promise.all([a.client.install('es-419', { books: ['tit'] }), a.client.install('es-419', { books: ['tit'] })])
    const hits = a.segHits()
    expect(new Set(hits).size).toBe(hits.length)
    const stA = await a.store.getState()
    const b = setup()
    await b.client.install('es-419', { books: ['tit'] })
    await b.client.install('es-419', { books: ['tit'] })
    expect(stA).toEqual(await b.store.getState())
  })

  test('an untrusted server key is E_SIGNATURE and nothing is stored', async () => {
    const other = await newKey()
    const { server, store } = setup()
    const client = createClient({ store, source: httpSource({ base: server.url }), trust: { trustedKeys: other.trusted } })
    await expect(client.install('es-419')).rejects.toMatchObject({ code: 'E_SIGNATURE' })
    expect(await store.ids()).toEqual([])
    expect(await store.getState()).toBeUndefined()
  })
})

describe('refresh', () => {
  test('the second refresh sends the stored ETag and reports unchanged', async () => {
    const etags: (string | undefined)[] = []
    const { server, store } = setup()
    const inner = httpSource({ base: server.url })
    const source: PackSource = {
      catalog: (name, o) => (etags.push(o?.etag), inner.catalog(name, o)),
      segment: (id, s) => inner.segment(id, s),
    }
    const client = createClient({ store, source, trust })
    const r1 = await client.refresh('es-419')
    expect(r1.unchanged).toBe(false)
    expect(r1.catalogs.map((c) => c.name).sort()).toEqual(['common', 'es-419'])
    expect(r1.missingCommon).toBeUndefined()
    const r2 = await client.refresh('es-419')
    expect(r2.unchanged).toBe(true)
    expect(etags.filter((e) => e !== undefined).length).toBe(1)
    expect((await store.getState())!.published['es-419']!.etag).toBeDefined()
    expect(Object.keys((await store.getState())!.units)).toEqual([])
  })

  test('a lower revision is E_DOWNGRADE unless confirmed; nothing is stored then', async () => {
    const { client, server, store } = setup({}, sample2)
    await client.refresh('es-419')
    const before = await store.getState()
    server.set(sample)
    await expect(client.refresh('es-419')).rejects.toMatchObject({ code: 'E_DOWNGRADE' })
    expect(await store.getState()).toEqual(before)
    const r = await client.refresh('es-419', { confirmDowngrade: true })
    expect(r.catalogs.find((c) => c.name === 'es-419')!.revision).toBe(1)
  })

  test('a fork (same revision, other id) is E_DOWNGRADE even when confirmed', async () => {
    const { client, server } = setup()
    await client.refresh('es-419')
    server.set(await buildSample({ tweak: rewordTitusNote() }))
    await expect(client.refresh('es-419', { confirmDowngrade: true })).rejects.toMatchObject({ code: 'E_DOWNGRADE' })
  })
})

describe('status, prune and verify', () => {
  test('status lists the units and the updates', async () => {
    const { client, server } = setup()
    await client.install('es-419', { books: ['tit'] })
    const s1 = await client.status('es-419')
    expect(s1.units.find((u) => u.key === 'es-419/book:tit')).toMatchObject({ installed: true, revision: 1, optional: false })
    expect(s1.units.find((u) => u.key.includes('/aligned:'))).toMatchObject({ installed: false, optional: true })
    expect(s1.updates).toEqual([])
    server.set(sample2)
    await client.refresh('es-419')
    const s2 = await client.status('es-419')
    expect(s2.published?.revision).toBe(2)
    expect(s2.active?.revision).toBe(1)
    expect(s2.updates.map((u) => u.key)).toEqual(['es-419/book:tit'])
  })

  test('prune after replacing Titus removes the old Titus segment (and the old catalog file) only', async () => {
    const { client, server, store } = setup()
    await client.install('es-419', { books: ['tit'] })
    const [oldBook] = segsOf['es-419/book:tit']!
    const oldLang = (await store.getState())!.published['es-419']!.id
    server.set(sample2)
    await client.refresh('es-419')
    const r = await client.install('es-419', { books: ['tit'] })
    expect(r.activated).toContain('es-419/book:tit')
    expect(r.fetched.length).toBe(1)
    const { removed } = await client.prune()
    expect(removed.sort()).toEqual([oldBook!, oldLang].sort())
    expect(await store.has(oldBook!)).toBe(false)
    expect(await client.prune()).toEqual({ removed: [] })
    expect((await client.verify()).bad).toEqual([])
  })

  test('verify lists a stored segment whose bytes no longer match its id', async () => {
    const { client, store } = setup()
    await client.install('es-419', { books: ['tit'] })
    const [id] = segsOf['es-419/book:tit']!
    const bytes = (await store.get(id!))!.slice()
    bytes[bytes.length >> 1] ^= 0xff
    await store.put(id!, bytes)
    expect((await client.verify()).bad).toEqual([id!])
  })
})

describe('fix round 1', () => {
  const ids = async (s: Sample, unit: string) => {
    const c = await verifyCatalogFile(s.langCatalog, {}, { from: 'store' })
    return c.catalog.units.find((u) => u.id === unit)!.segments.map((i) => hexOf(c.catalog.segments[i]!.id))
  }
  const offline: PackSource = {
    catalog: async () => {
      throw new ClientError('E_NETWORK', 'offline')
    },
    segment: async () => {
      throw new ClientError('E_NETWORK', 'offline')
    },
  }

  test('1: a stored blob that no longer matches its id is refetched, never activated', async () => {
    const { client, store, segHits, server } = setup()
    await client.install('es-419', { books: ['tit'] })
    const [id] = segsOf['es-419/book:tit']!
    const bad = (await store.get(id!))!.slice()
    bad[bad.length >> 1] ^= 0xff
    await store.put(id!, bad)
    const n = segHits().length
    const r = await client.install('es-419', { books: ['tit'] })
    expect(r.fetched).toEqual([id!])
    expect(segHits().slice(n)).toEqual([id!])
    expect((await client.verify()).bad).toEqual([])
    // good blobs are not fetched again
    const m = server.hits.length
    expect((await client.install('es-419', { books: ['tit'] })).fetched).toEqual([])
    expect(server.hits.length).toBe(m)
  })

  test('1: a corrupt blob under the id of a new revision does not activate it', async () => {
    const { client, store, server } = setup()
    await client.install('es-419', { books: ['tit'] })
    const [oldId] = await ids(sample, 'book:tit')
    const [newId] = await ids(sample2, 'book:tit')
    expect(newId).not.toBe(oldId)
    server.set(sample2)
    await client.refresh('es-419')
    await store.put(newId!, new Uint8Array([1, 2, 3]))
    const r = await client.install('es-419', { books: ['tit'] })
    expect(r.fetched).toEqual([newId!])
    expect(r.waiting).toEqual([])
    expect((await client.verify()).bad).toEqual([])
    // and when the refetch fails too, the unit stays on the old revision
    await store.put(newId!, new Uint8Array([1, 2, 3]))
    const state = (await store.getState())!
    await store.setState({ ...state, units: { ...state.units, 'es-419/book:tit': { ...state.units['es-419/book:tit']!, segments: [oldId!], revision: 1 } } })
    const down = setup({ failSegment: (id) => (id === newId ? 404 : 'ok') }, sample2, store)
    const r2 = await down.client.install('es-419', { books: ['tit'] })
    expect(r2.waiting.map((w) => w.key)).toContain('es-419/book:tit')
    expect((await store.getState())!.units['es-419/book:tit']!.segments).toEqual([oldId!])
  })

  test('2: the required common catalog is found by id in the store, not by the published pointer', async () => {
    const { client, store } = setup()
    await client.install('es-419', { books: ['tit'] })
    const c2 = await verifyCatalogFile(otherCommon.commonCatalog, {}, { from: 'store' })
    await store.put(c2.id, otherCommon.commonCatalog)
    const state = (await store.getState())!
    await store.setState({ ...state, published: { ...state.published, common: { name: 'common', publisher: c2.publisher, revision: 2, id: c2.id, origin: 'published' } } })
    expect((await client.status('es-419')).missingCommon).toBeUndefined()
    const r = await createClient({ store, source: offline, trust }).install('es-419', { books: ['tit'] })
    expect(r.waiting).toEqual([])
    expect(r.unknown).toEqual([])
  })

  test('3: prune keeps a catalog an installed unit still names', async () => {
    const { client, store, server } = setup()
    await client.install('es-419', { books: ['tit'] })
    const oldLang = (await store.getState())!.published['es-419']!.id
    const [newId] = await ids(sample2, 'book:tit')
    server.set(sample2)
    await client.refresh('es-419')
    const down = setup({ failSegment: (id) => (id === newId ? 404 : 'ok') }, sample2, store)
    const r = await down.client.install('es-419', { books: ['tit'] })
    expect(r.waiting.map((w) => w.key)).toContain('es-419/book:tit')
    expect((await store.getState())!.units['es-419/book:tit']!.catalogId).toBe(oldLang)
    const { removed } = await down.client.prune()
    expect(removed).not.toContain(oldLang)
    expect(await store.has(oldLang)).toBe(true)
  })

  test('4: an alias resolves to the catalog name: offline install and ETag on refresh', async () => {
    const etags: (string | undefined)[] = []
    const { server, store } = setup()
    const inner = httpSource({ base: server.url })
    const spy: PackSource = { catalog: (n, o) => (etags.push(o?.etag), inner.catalog(n, o)), segment: (i, s) => inner.segment(i, s) }
    const c1 = createClient({ store, source: spy, trust })
    await c1.install('es', { books: ['tit'] })
    const r = await c1.refresh('es')
    expect(r.unchanged).toBe(true)
    expect(etags.filter((e) => e !== undefined).length).toBe(1)
    const c2 = createClient({ store, source: offline, trust })
    const again = await c2.install('es', { books: ['tit'] })
    expect(again.fetched).toEqual([])
    expect((await c2.status('es')).published?.name).toBe('es-419')
  })

  test('5: a setState that fails after one activated unit leaves the state as it was', async () => {
    const inner = memoryStore()
    let sets = 0
    let armed = false
    const store: BlobStore = {
      has: (id) => inner.has(id),
      get: (id) => inner.get(id),
      ids: () => inner.ids(),
      delete: (id) => inner.delete(id),
      put: (id, b) => inner.put(id, b),
      getState: () => inner.getState(),
      async setState(s) {
        if (armed && ++sets === 2) throw new Error('disk full')
        return inner.setState(s)
      },
    }
    const { client } = setup({}, sample, store)
    await client.refresh('es-419')
    const before = await store.getState()
    armed = true
    await expect(client.install('es-419', { books: ['tit'] })).rejects.toMatchObject({ code: 'E_STORE' })
    expect(await store.getState()).toEqual(before)
  })

  test('6: install reads only the planned segments from the store', async () => {
    const inner = memoryStore()
    const gets: string[] = []
    const store: BlobStore = {
      has: (id) => inner.has(id),
      get: (id) => (gets.push(id), inner.get(id)),
      ids: () => inner.ids(),
      delete: (id) => inner.delete(id),
      put: (id, b) => inner.put(id, b),
      getState: () => inner.getState(),
      setState: (s) => inner.setState(s),
    }
    const { client } = setup({}, sample, store)
    const part = Object.keys(segsOf).find((k) => k.startsWith('es-419/aligned:'))!.slice('es-419/aligned:'.length)
    await client.install('es-419', { defaults: false, aligned: [part] })
    const stray = 'cd'.repeat(32)
    await inner.put(stray, new Uint8Array([7]))
    const unrelated = [stray, ...segsOf[`es-419/aligned:${part}`]!]
    gets.length = 0
    await client.install('es-419', { defaults: false, units: ['map'] })
    expect(gets.filter((id) => unrelated.includes(id))).toEqual([])
    expect(gets.length).toBeGreaterThan(0) // the catalogs and the planned segments are read
  })

  test('7: prune keeps the common catalog a kept language catalog requires', async () => {
    const { client, store } = setup()
    await client.install('es-419', { defaults: false, units: ['map'] })
    const c1 = (await verifyCatalogFile(sample.commonCatalog, {}, { from: 'store' })).id
    expect(await store.has(c1)).toBe(true)
    const c2 = await verifyCatalogFile(otherCommon.commonCatalog, {}, { from: 'store' })
    await store.put(c2.id, otherCommon.commonCatalog)
    const state = (await store.getState())!
    await store.setState({ ...state, published: { ...state.published, common: { name: 'common', publisher: c2.publisher, revision: 2, id: c2.id, origin: 'published' } } })
    const { removed } = await client.prune()
    expect(removed).not.toContain(c1)
    expect(await store.has(c1)).toBe(true)
    expect((await createClient({ store, source: offline, trust }).status('es-419')).missingCommon).toBeUndefined()
  })
})

describe('final review, trust and installation', () => {
  const offlineSrc: PackSource = {
    catalog: () => Promise.reject(new ClientError('E_NETWORK', 'offline')),
    segment: () => Promise.reject(new ClientError('E_NETWORK', 'offline')),
  }

  test('A2: refresh of a language that requires an older common catalog stores it by id and keeps published.common', async () => {
    const { client, store, server } = setup({}, { ...sample, commonCatalog: otherCommon.commonCatalog })
    await client.refresh('common')
    const c2 = (await store.getState())!.published.common!
    expect(c2.revision).toBe(2)
    server.set(sample)
    const r = await client.refresh('es-419')
    expect(r.missingCommon).toBeUndefined()
    expect((await store.getState())!.published.common!.id).toBe(c2.id)
    const i = await client.install('es-419', { books: ['tit'] })
    expect(i.waiting).toEqual([])
    expect((await store.getState())!.units['es-419/book:tit']).toBeDefined()
    expect((await store.getState())!.published.common!.id).toBe(c2.id)
  })

  test('A3: a stored language catalog that no longer verifies is fetched again, without the ETag', async () => {
    const etags: (string | undefined)[] = []
    const { server, store, client } = setup()
    await client.install('es-419', { books: ['tit'] })
    const langId = (await store.getState())!.published['es-419']!.id
    await store.put(langId, new Uint8Array([1, 2, 3]))
    const inner = httpSource({ base: server.url })
    const spy: PackSource = { catalog: (n, o) => (etags.push(o?.etag), inner.catalog(n, o)), segment: (i, s) => inner.segment(i, s) }
    const c = createClient({ store, source: spy, trust })
    await c.refresh('es-419')
    expect(etags[0]).toBeUndefined()
    expect(await verifyCatalogFile((await store.get(langId))!, trust, { from: 'store', expectedId: langId })).toBeDefined()
    // install too: a stored catalog that does not verify makes install refresh first
    await store.put(langId, new Uint8Array([1, 2, 3]))
    const r = await c.install('es-419', { books: ['tit'] })
    expect(r.waiting).toEqual([])
  })

  test('A4: a 429 stops the install: E_NETWORK with retryAfter, the units already complete stay active, no further request', async () => {
    const [failing] = segsOf['es-419/map']!
    const { client, store, segHits } = setup({ failSegment: (id) => (id === failing ? 429 : 'ok') })
    // One request at a time, so the failing one is the last asked (the parallel case is in 'install several segments at a time').
    const e = await client.install('es-419', { books: ['tit'] }, { concurrency: 1 }).catch((x) => x)
    expect(e).toBeInstanceOf(ClientError)
    expect(e).toMatchObject({ code: 'E_NETWORK', status: 429, retryAfter: 7 })
    expect(segHits().at(-1)).toBe(failing!)
    expect((await store.getState())!.units['common/xmap']).toBeDefined()
    expect((await store.getState())!.units['es-419/map']).toBeUndefined()
  })

  test('A4: a 503 stops the install with E_NETWORK status 503 and keeps what is installed', async () => {
    const { client, store } = setup()
    await client.install('es-419', { books: ['tit'] })
    const before = await store.getState()
    const part = Object.keys(segsOf).find((k) => k.startsWith('es-419/aligned:'))!
    const down = setup({ failSegment: () => 503 }, sample, store)
    await expect(down.client.install('es-419', { aligned: [part.slice('es-419/aligned:'.length)] })).rejects.toMatchObject({ code: 'E_NETWORK', status: 503 })
    expect(await store.getState()).toEqual(before)
    expect(down.segHits().length).toBe(1)
  })

  test('A6: prune keeps the common catalog a stored language catalog requires even when that catalog no longer verifies', async () => {
    const { client, store, server } = setup()
    await client.install('es-419', { defaults: false, units: ['map'] })
    const c1 = (await verifyCatalogFile(sample.commonCatalog, {}, { from: 'store' })).id
    server.set({ ...sample, commonCatalog: otherCommon.commonCatalog })
    await client.refresh('common')
    expect((await store.getState())!.published.common!.id).not.toBe(c1)
    const other = await newKey()
    const { removed } = await createClient({ store, source: offlineSrc, trust: { trustedKeys: other.trusted } }).prune()
    expect(removed).not.toContain(c1)
    expect(await store.has(c1)).toBe(true)
  })
})

/**
 * A fetch in front of the fake server that holds each segment request until the test releases it (or lets it through once
 * `openAll` is called), so the order and the overlap of the requests are set by the test, not by timing.
 */
function gatedFetch() {
  const calls: string[] = []
  const held = new Map<string, { release: () => void; done: Promise<void> }>()
  let inFlight = 0
  let max = 0
  let open = false
  const checks: { cond: () => boolean; resolve: () => void }[] = []
  const notify = () => {
    for (const c of [...checks]) {
      if (!c.cond()) continue
      checks.splice(checks.indexOf(c), 1)
      c.resolve()
    }
  }
  const f: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const at = url.indexOf('/v3/packs/seg/')
    if (at < 0) return fetch(input, init)
    const id = url.slice(at + '/v3/packs/seg/'.length)
    calls.push(id)
    inFlight++
    max = Math.max(max, inFlight)
    let finished!: () => void
    const done = new Promise<void>((r) => (finished = r))
    try {
      await new Promise<void>((resolve, reject) => {
        if (open) return resolve()
        held.set(id, { release: resolve, done })
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
        notify()
      })
      return await fetch(input, init)
    } finally {
      held.delete(id)
      inFlight--
      finished()
    }
  }
  return {
    fetch: f,
    calls,
    held,
    max: () => max,
    /** Resolves once `cond` holds (checked whenever a request is held). */
    until(cond: () => boolean): Promise<void> {
      return cond() ? Promise.resolve() : new Promise((resolve) => checks.push({ cond, resolve }))
    },
    /** Lets these held requests go on; resolves when their answers are back and the client has handled them. */
    async release(ids: string[]): Promise<void> {
      const ds = ids.map((id) => {
        const h = held.get(id)
        if (h === undefined) throw new Error(`not held: ${id}`)
        h.release()
        return h.done
      })
      await Promise.all(ds)
      // The client handles an answer in microtasks only (the body is in memory): one macrotask lets it finish.
      await new Promise((r) => setTimeout(r, 0))
    },
    openAll() {
      open = true
      for (const h of [...held.values()]) h.release()
    },
  }
}

describe('install several segments at a time', () => {
  /** The segment ids of the Titus install, once each in plan order: xmap(2) map(2) xtopics(2) topics art:tw:kt orig:tit book:tit. */
  let order: string[]
  beforeAll(async () => {
    const cats = [await verifyCatalogFile(sample.langCatalog, {}, { from: 'store' }), await verifyCatalogFile(sample.commonCatalog, {}, { from: 'store' })]
    const seen = new Set<string>()
    order = []
    for (const step of planInstall(cats, emptyState(), { books: ['tit'] }, new Set()).steps) {
      for (const s of step.segments) {
        if (seen.has(s.id)) continue
        seen.add(s.id)
        order.push(s.id)
      }
    }
    expect(order.slice(0, 6)).toEqual([...segsOf['common/xmap']!, ...segsOf['es-419/map']!, ...segsOf['common/xtopics']!])
    expect(order.length).toBe(10)
  })

  /** `beforeSet` may hold a `setState` (it is counted when called); `failPut(n)` makes the n-th segment put throw. */
  function gatedSetup(
    o: Parameters<typeof startFakeServer>[1] = {},
    hooks: { beforeSet?: () => Promise<void> | undefined; failPut?: (n: number) => boolean; beforePut?: (id: string) => void } = {},
  ) {
    const srv = startFakeServer(sample, o)
    server?.stop()
    server = srv
    const gate = gatedFetch()
    const inner = memoryStore()
    let sets = 0
    let puts = 0
    const store: BlobStore = {
      has: (id) => inner.has(id),
      get: (id) => inner.get(id),
      async put(id, b) {
        if (sample.segments.has(id) && hooks.failPut?.(++puts) === true) throw new Error('QuotaExceededError')
        if (sample.segments.has(id)) hooks.beforePut?.(id)
        return inner.put(id, b)
      },
      ids: () => inner.ids(),
      delete: (id) => inner.delete(id),
      getState: () => inner.getState(),
      async setState(s) {
        sets++
        await hooks.beforeSet?.()
        return inner.setState(s)
      },
    }
    const client = createClient({ store, source: httpSource({ base: srv.url, fetch: gate.fetch }), trust })
    return { gate, store, client, sets: () => sets }
  }
  const settled = (p: Promise<unknown>) => {
    const box = { done: false }
    p.then(
      () => (box.done = true),
      () => (box.done = true),
    )
    return box
  }

  test('install runs up to 4 segment requests at once', async () => {
    const { gate, client } = gatedSetup()
    const run = client.install('es-419', { books: ['tit'] })
    await gate.until(() => gate.held.size === 4)
    await new Promise((r) => setTimeout(r, 0))
    expect(gate.calls).toEqual(order.slice(0, 4)) // no fifth request while four are running
    gate.openAll()
    const report = await run
    expect(gate.max()).toBe(4)
    expect(gate.calls.length).toBe(order.length)
    expect(new Set(gate.calls).size).toBe(order.length)
    expect(report.waiting).toEqual([])
    expect(report.fetched.length).toBe(order.length)
  })

  test('install with concurrency 1 asks in catalog order', async () => {
    const { gate, client } = gatedSetup()
    gate.openAll()
    const done: number[] = []
    const report = await client.install('es-419', { books: ['tit'] }, { concurrency: 1, onProgress: (p) => done.push(p.done) })
    expect(gate.calls).toEqual(order)
    expect(gate.max()).toBe(1)
    expect(report.fetched).toEqual(order)
    expect(done).toEqual(order.map((_, i) => i + 1))
  })

  test('a concurrency that is not a whole number from 1 up is E_ARG', async () => {
    const { client } = gatedSetup()
    for (const concurrency of [0, -1, 1.5, Number.NaN]) {
      await expect(client.install('es-419', { books: ['tit'] }, { concurrency })).rejects.toMatchObject({ code: 'E_ARG' })
    }
  })

  test('stops on E_NETWORK and keeps complete units', async () => {
    // order[4] is the first segment of common/xtopics: by then xmap and map are complete.
    const { gate, client, store, sets } = gatedSetup({ failSegment: (id) => (id === order[4] ? 503 : 'ok') })
    const run = client.install('es-419', { books: ['tit'] })
    const box = settled(run)
    await gate.until(() => gate.held.size === 4)
    await gate.release(order.slice(0, 4))
    await gate.until(() => gate.held.size === 4 && gate.calls.length === 8)
    expect(gate.calls).toEqual(order.slice(0, 8))
    const setsBefore = sets()
    await gate.release([order[4]!]) // the client has seen the 503 now
    expect(box.done).toBe(false) // the requests already running settle first
    await gate.release(order.slice(5, 8))
    const e = await run.catch((x) => x)
    expect(e).toBeInstanceOf(ClientError)
    expect(e).toMatchObject({ code: 'E_NETWORK', status: 503 })
    expect(gate.calls).toEqual(order.slice(0, 8)) // no request after the failure
    const units = (await store.getState())!.units
    expect(units['common/xmap']).toBeDefined()
    expect(units['es-419/map']).toBeDefined()
    expect(units['common/xtopics']).toBeUndefined()
    expect(units['es-419/book:tit']).toBeUndefined()
    for (const id of order.slice(5, 8)) expect(await store.has(id)).toBe(true) // what was running is stored
    expect(sets() - setsBefore).toBe(1) // saved once after the failure (art:tw:kt completed meanwhile)
    expect(units['es-419/art:tw:kt']).toBeDefined()
  })

  test('a 429 rejects with retryAfter after in-flight requests settle', async () => {
    const { gate, client, store } = gatedSetup({ failSegment: (id) => (id === order[1] ? 429 : 'ok') })
    const run = client.install('es-419', { books: ['tit'] })
    const box = settled(run)
    await gate.until(() => gate.held.size === 4)
    await gate.release([order[1]!])
    expect(box.done).toBe(false)
    await gate.release([order[0]!, order[2]!, order[3]!])
    const e = await run.catch((x) => x)
    expect(e).toMatchObject({ code: 'E_NETWORK', status: 429, retryAfter: 7 })
    expect(gate.calls).toEqual(order.slice(0, 4))
    for (const id of [order[0]!, order[2]!, order[3]!]) expect(await store.has(id)).toBe(true)
    const units = (await store.getState())!.units
    expect(units['common/xmap']).toBeUndefined()
    expect(units['es-419/map']).toBeDefined() // completed by requests that settled after the 429
  })

  test('abort stops new requests and keeps complete units', async () => {
    const { gate, client, store } = gatedSetup()
    const ac = new AbortController()
    const run = client.install('es-419', { books: ['tit'] }, { signal: ac.signal })
    await gate.until(() => gate.held.size === 4)
    await gate.release(order.slice(0, 4))
    await gate.until(() => gate.held.size === 4 && gate.calls.length === 8)
    ac.abort()
    const e = await run.catch((x) => x)
    expect(e).toBe(ac.signal.reason)
    expect((e as Error).name).toBe('AbortError')
    expect(gate.calls).toEqual(order.slice(0, 8))
    const units = (await store.getState())!.units
    expect(units['common/xmap']).toBeDefined()
    expect(units['es-419/map']).toBeDefined()
    expect(units['common/xtopics']).toBeUndefined()
    expect(units['es-419/book:tit']).toBeUndefined()
  })

  test('an abort while a state save is running still activates what is complete, with one more save', async () => {
    let armed = false
    let onHeld!: () => void
    const held = new Promise<void>((r) => (onHeld = r))
    let letGo!: () => void
    const gateSet = new Promise<void>((r) => (letGo = r))
    const { gate, client, store, sets } = gatedSetup({}, {
      beforeSet: () => {
        if (!armed) return undefined
        armed = false
        onHeld()
        return gateSet
      },
    })
    await client.refresh('es-419')
    armed = true
    const ac = new AbortController()
    const run = client.install('es-419', { books: ['tit'] }, { signal: ac.signal })
    const box = settled(run)
    await gate.until(() => gate.held.size === 4)
    await gate.release(order.slice(0, 2))
    await held // xmap is being saved
    await gate.release(order.slice(2, 4)) // map is complete; its activation waits behind the save
    await gate.until(() => gate.held.size === 2 && gate.calls.length === 6)
    const setsBefore = sets()
    ac.abort()
    await new Promise((r) => setTimeout(r, 0))
    expect(box.done).toBe(false) // the save still runs
    letGo()
    const e = await run.catch((x) => x)
    expect(e).toBe(ac.signal.reason)
    expect(gate.calls).toEqual(order.slice(0, 6))
    const units = (await store.getState())!.units
    expect(units['common/xmap']).toBeDefined()
    expect(units['es-419/map']).toBeDefined()
    expect(units['common/xtopics']).toBeUndefined()
    expect(sets() - setsBefore).toBe(1) // map: one save after the abort
  })

  // The last segment: no request is pending any more when the abort comes, so no worker sees it; the end of the install must.
  test('an abort during the last put rejects with the abort and keeps every complete unit', async () => {
    const ac = new AbortController()
    let setsAtAbort = -1
    const { gate, client, store, sets } = gatedSetup({}, {
      beforePut: (id) => {
        if (id !== order.at(-1)) return
        setsAtAbort = sets()
        ac.abort()
      },
    })
    gate.openAll()
    const e = await client.install('es-419', { books: ['tit'] }, { concurrency: 1, signal: ac.signal }).catch((x) => x)
    expect(e).toBe(ac.signal.reason)
    expect(gate.calls).toEqual(order)
    const units = (await store.getState())!.units
    expect(units['es-419/book:tit']).toBeDefined() // the last segment is stored and completes the book
    expect(sets() - setsAtAbort).toBe(1) // saved once, at the end
  })

  test('an abort during the last state save rejects with the abort', async () => {
    const ac = new AbortController()
    const { gate, client, store, sets } = gatedSetup({}, {
      beforeSet: () => {
        if (gate.calls.length === order.length) ac.abort()
        return undefined
      },
    })
    gate.openAll()
    const e = await client.install('es-419', { books: ['tit'] }, { concurrency: 1, signal: ac.signal }).catch((x) => x)
    expect(e).toBe(ac.signal.reason)
    const setsAfter = sets()
    const units = (await store.getState())!.units
    expect(units['es-419/book:tit']).toBeDefined()
    expect(units['common/orig:tit']).toBeDefined()
    expect(sets()).toBe(setsAfter)
  })

  test('an abort from the last progress callback rejects with the abort, after one save', async () => {
    const ac = new AbortController()
    const { gate, client, store, sets } = gatedSetup()
    gate.openAll()
    let setsAtAbort = -1
    const e = await client
      .install('es-419', { books: ['tit'] }, {
        concurrency: 1,
        signal: ac.signal,
        onProgress: (p) => {
          if (p.done < p.total) return
          setsAtAbort = sets()
          ac.abort()
        },
      })
      .catch((x) => x)
    expect(e).toBe(ac.signal.reason)
    expect((await store.getState())!.units['es-419/book:tit']).toBeDefined()
    expect(sets() - setsAtAbort).toBe(1) // the queued activation is left to the single one at the end
  })

  /**
   * A source whose segment answers the test gives by hand, whatever the signal says: an answer that was already on its way when
   * the abort came. Catalogs come from the fake server.
   */
  function handSource() {
    const srv = startFakeServer(sample)
    server?.stop()
    server = srv
    const http = httpSource({ base: srv.url })
    const pending = new Map<string, { resolve: (b: Uint8Array) => void; reject: (e: unknown) => void }>()
    const waits: { n: number; resolve: () => void }[] = []
    const source: PackSource = {
      catalog: (name, o) => http.catalog(name, o),
      segment: (id) =>
        new Promise<Uint8Array>((resolve, reject) => {
          pending.set(id, { resolve, reject })
          for (const w of [...waits]) if (pending.size >= w.n) (waits.splice(waits.indexOf(w), 1), w.resolve())
        }),
    }
    const store = memoryStore()
    const client = createClient({ store, source, trust })
    const answer = async (id: string, how: Uint8Array | Error) => {
      const p = pending.get(id)!
      pending.delete(id)
      if (how instanceof Uint8Array) p.resolve(how)
      else p.reject(how)
      await new Promise((r) => setTimeout(r, 0))
    }
    return {
      client,
      store,
      answer,
      requested: (n: number) => (pending.size >= n ? Promise.resolve() : new Promise<void>((resolve) => waits.push({ n, resolve }))),
    }
  }

  test('after an abort, a late 503, a corrupt segment or an unexpected error does not replace the abort', async () => {
    const { client, store, answer, requested } = handSource()
    const ac = new AbortController()
    const run = client.install('es-419', { books: ['tit'] }, { signal: ac.signal })
    await requested(4)
    await answer(order[0]!, sample.segments.get(order[0]!)!)
    await answer(order[1]!, sample.segments.get(order[1]!)!) // xmap is complete
    await requested(4)
    ac.abort()
    await answer(order[2]!, new ClientError('E_NETWORK', 'HTTP 503', { status: 503 }))
    await answer(order[3]!, new Uint8Array([1, 2, 3])) // does not read as a segment: FormatError
    await answer(order[4]!, new Error('a bug'))
    await answer(order[5]!, sample.segments.get(order[5]!)!)
    const e = await run.catch((x) => x)
    expect(e).toBe(ac.signal.reason)
    expect((await store.getState())!.units['common/xmap']).toBeDefined()
    expect(await store.has(order[5]!)).toBe(true) // what verified after the abort is still stored
  })

  test('a network error recorded before the abort still wins, with its retryAfter', async () => {
    const { client, answer, requested } = handSource()
    const ac = new AbortController()
    const run = client.install('es-419', { books: ['tit'] }, { signal: ac.signal })
    await requested(4)
    await answer(order[0]!, new ClientError('E_NETWORK', 'rate limited', { status: 429, retryAfter: 7 }))
    ac.abort()
    for (const id of order.slice(1, 4)) await answer(id, new ClientError('E_NETWORK', 'HTTP 503', { status: 503 }))
    const e = await run.catch((x) => x)
    expect(e).toMatchObject({ code: 'E_NETWORK', status: 429, retryAfter: 7 })
  })

  test('a store failure waits for the running requests, then E_STORE with the state before', async () => {
    const { gate, client, store } = gatedSetup({}, { failPut: (n) => n === 2 })
    await client.refresh('es-419')
    const before = await store.getState()
    const run = client.install('es-419', { books: ['tit'] })
    const box = settled(run)
    await gate.until(() => gate.held.size === 4)
    await gate.release([order[1]!]) // put 1: stored; its worker asks order[4]
    await gate.until(() => gate.calls.length === 5)
    await gate.release([order[0]!]) // put 2 throws
    expect(box.done).toBe(false)
    expect(gate.calls.length).toBe(5)
    await gate.release([order[2]!, order[3]!, order[4]!])
    const e = await run.catch((x) => x)
    expect(e).toMatchObject({ code: 'E_STORE' })
    expect(gate.calls).toEqual(order.slice(0, 5)) // no request after the failure
    expect(await store.getState()).toEqual(before) // map was complete, but nothing is activated after a store failure
  })

  test('a progress callback that throws does not break a parallel install', async () => {
    const { gate, client } = gatedSetup()
    gate.openAll()
    const report = await client.install('es-419', { books: ['tit'] }, {
      onProgress: () => {
        throw new Error('the screen is gone')
      },
    })
    expect(report.waiting).toEqual([])
    expect(report.fetched.length).toBe(order.length)
  })
})

// An old pack of a book is built with an originals pack of format 1.1, whose manifest lists no `books` (spec/tests/data/README.md).
// The local catalog lists the book, its map and its `orig`, so with no network and no common catalog the book is active and readable.
const DATA = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests', 'data')
const dataFile = (name: string) => new Uint8Array(readFileSync(join(DATA, name)))
const OLD_PACKS = process.env.LP3_OLD_PACKS
const OLD = { device: 'test-device', now: '2026-11-01T10:00:00Z' }
/** A device with no network: no source at all. */
const offlineDevice = () => createClient({ store: memoryStore(), trust })

describe('importOldPack with an originals pack', () => {
  test('importOldPack builds the book with an originals pack whose manifest lists no books', async () => {
    const originals = await zipSource(dataFile('originals-tit.langpack.zip'))
    const client = offlineDevice()
    const r = await client.importOldPack(dataFile('es-419-tit.langpack.zip'), { originals, ...OLD })
    expect(r.activated).toContain('es-419/book:tit')
    expect(r.activated).toContain('es-419/orig:tit')
    expect(r.waiting).toEqual([])
    expect(r.missing).toEqual([])
    const passage = await (await client.open('es-419')).passage('tit 2:11')
    expect(passage.data).not.toBeNull()
    const glt = passage.data!.texts.find((t) => t.res === 'es-419_gl/es-419/glt')
    expect(glt!.text).toBe('Porque la gracia salvadora de Dios fue manifestada a todos los hombres,')
    expect(passage.data!.notes.length).toBeGreaterThan(0)
  })

  test('a published install later replaces the local catalog and still reads', async () => {
    // Without the book stamps of catalog.json (an older originals pack) the bridged orig is known by the release tag, so it is not
    // the published one: its segment is the bridge's own, and prune must remove it.
    const zipped = await zipSource(dataFile('originals-tit.langpack.zip'))
    const originals: RowSource = {
      rows: (f) => zipped.rows(f),
      resources: async (lang) => (await zipped.resources(lang)).map(({ bookStamps: _, ...ref }) => ref),
    }
    const srv = startFakeServer(sample)
    server?.stop()
    server = srv
    const store = memoryStore()
    const client = createClient({ store, source: httpSource({ base: srv.url }), trust })
    await client.importOldPack(dataFile('es-419-tit.langpack.zip'), { originals, ...OLD })
    const bridged = (await store.getState())!
    const localId = bridged.active['es-419']!.id
    expect(bridged.active['es-419']!.origin).toBe('local')
    const bridgedOrig = bridged.units['es-419/orig:tit']!.segments
    expect(bridged.units['es-419/orig:tit']!.local).toBe(true)
    await client.refresh('es-419')
    const inst = await client.install('es-419', { books: ['tit'] })
    expect(inst.waiting).toEqual([])
    const state = (await store.getState())!
    expect(state.active['es-419']?.origin).toBe('published')
    expect(state.units['common/orig:tit']).toBeDefined()
    // The published catalog replaced the local one: the bridged orig is no longer installed, and no unit keeps the local catalog.
    expect(state.units['es-419/orig:tit']).toBeUndefined()
    expect(Object.values(state.units).some((u) => u.catalogId === localId)).toBe(false)
    const { removed } = await client.prune()
    expect(removed).toContain(localId)
    expect(await store.has(localId)).toBe(false)
    const published = new Set(Object.values(state.units).flatMap((u) => u.segments))
    for (const id of bridgedOrig) if (!published.has(id)) expect(await store.has(id)).toBe(false)
    expect(bridgedOrig.some((id) => !published.has(id))).toBe(true) // the bridged orig is not the published one here
    expect((await (await client.open('es-419')).passage('tit 2:11')).data).not.toBeNull()
  })

  test('with the same rows and book stamps, the bridged orig is the published one', async () => {
    const originals = await zipSource(dataFile('originals-tit.langpack.zip'))
    const srv = startFakeServer(sample)
    server?.stop()
    server = srv
    const store = memoryStore()
    const client = createClient({ store, source: httpSource({ base: srv.url }), trust })
    await client.importOldPack(dataFile('es-419-tit.langpack.zip'), { originals, ...OLD })
    const bridgedOrig = (await store.getState())!.units['es-419/orig:tit']!.segments
    expect(bridgedOrig).toEqual(segsOf['common/orig:tit']!)
    await client.refresh('es-419')
    const inst = await client.install('es-419', { books: ['tit'] })
    expect(inst.fetched).not.toContain(bridgedOrig[0]!) // already stored: the bridge made the same bytes
    expect((await store.getState())!.units['es-419/orig:tit']).toBeUndefined()
    await client.prune()
    expect(await store.has(bridgedOrig[0]!)).toBe(true) // common/orig:tit uses it
    expect((await (await client.open('es-419')).passage('tit 2:11')).data).not.toBeNull()
  })

  test('with no common catalog, a published book does not activate against the bridged orig', async () => {
    const originals = await zipSource(dataFile('originals-tit.langpack.zip'))
    const srv = startFakeServer(sample, { noCommon: true })
    server?.stop()
    server = srv
    const store = memoryStore()
    const client = createClient({ store, source: httpSource({ base: srv.url }), trust })
    await client.importOldPack(dataFile('es-419-tit.langpack.zip'), { originals, ...OLD })
    const localBook = (await store.getState())!.units['es-419/book:tit']!
    await client.refresh('es-419')
    const inst = await client.install('es-419', { books: ['tit'] })
    expect(inst.waiting.find((w) => w.key === 'es-419/book:tit')?.missing).toContain('es-419/orig:tit')
    const state = (await store.getState())!
    expect(state.active['es-419']?.origin).toBe('published') // map and topics came from the published catalog
    expect(state.units['es-419/book:tit']).toEqual(localBook) // the bridged book stays, with the orig it needs
    expect(state.units['es-419/orig:tit']).toBeDefined()
    await client.prune()
    expect((await (await client.open('es-419')).passage('tit 2:11')).data).not.toBeNull()
  })

  // LP3_OLD_PACKS=<folder with originals.langpack.zip and es-419-tit.langpack.zip as prepare-language writes them>
  test.skipIf(!OLD_PACKS || !existsSync(join(OLD_PACKS, 'originals.langpack.zip')))('the real packs of prepare-language build Titus with no network', async () => {
    const real = (name: string) => new Uint8Array(readFileSync(join(OLD_PACKS!, name)))
    const originals = await zipSource(real('originals.langpack.zip'))
    expect((await originals.resources('originals')).find((r) => r.key === 'unfoldingWord/el-x-koine/ugnt')!.books).toContain('tit')
    const store = memoryStore()
    const client = createClient({ store, trust })
    const r = await client.importOldPack(real('es-419-tit.langpack.zip'), { originals, ...OLD })
    expect(r.activated).toContain('es-419/book:tit')
    expect(r.waiting).toEqual([])
    // The bridged orig carries Titus's MACULA (sentence trees and referents), as the published one does.
    const [origId] = (await store.getState())!.units['es-419/orig:tit']!.segments
    const orig = origView((await readSegment((await store.get(origId!))!, { known: KNOWN.orig })).seg)
    expect(orig.macula?.trees).toBeDefined()
    expect(orig.macula?.referents).toBeDefined()
    const passage = await (await client.open('es-419')).passage('tit 2:11')
    expect(passage.data!.texts.find((t) => t.res === 'es-419_gl/es-419/glt')!.text).toBe('Porque la gracia salvadora de Dios fue manifestada a todos los hombres,')
  }, 300_000)
})
