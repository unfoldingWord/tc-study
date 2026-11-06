import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from './client'
import { ClientError } from './errors'
import { httpSource, type PackSource } from './source/http'
import { memoryStore } from './store/memory'
import type { BlobStore } from './store/types'
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
    await expect(client.install('es-419', { books: ['tit'] })).rejects.toMatchObject({ code: 'E_STORE' })
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
