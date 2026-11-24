import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { CATALOG_TABLES, KNOWN, readSegment, readTransfer, writeTransfer, type KnownTables } from '@bt-synergy/language-pack-v3'
import { createClient, type LanguagePackClient } from './client'
import { sha256Hex } from './complements'
import { ClientError } from './errors'
import { httpSource, type PackSource } from './source/http'
import { memoryStore } from './store/memory'
import type { BlobStore } from './store/types'
import { type FakeServer, startFakeServer } from '../test/fakeServer'
import { buildSample, type Sample } from '../test/sample'

const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
const NO_OBS = ['xmap', 'map', 'xtopics', 'topics']

let sample: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
let basemapId: string
let basemap: Uint8Array

beforeAll(async () => {
  sample = await buildSample({ geo: true })
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
  const entry = [...sample.complements!.entries()][0]!
  basemapId = entry[0]
  basemap = entry[1]
}, 120_000)

let server: FakeServer | undefined
afterEach(() => server?.stop())

/** The fake server for catalogs and segments, plus a `complement` that answers as `answer` says (a number is an HTTP failure). */
function source(answer: (id: string) => Uint8Array | number = () => basemap): { src: PackSource; calls: string[] } {
  server?.stop()
  server = startFakeServer(sample)
  const inner = httpSource({ base: server.url })
  const calls: string[] = []
  const src: PackSource = {
    ...inner,
    async complement(id) {
      calls.push(id)
      const a = answer(id)
      if (typeof a === 'number') throw new ClientError('E_NETWORK', `HTTP ${a}`, { status: a })
      return a
    },
  }
  return { src, calls }
}

async function installed(src: PackSource): Promise<{ client: LanguagePackClient; store: BlobStore }> {
  const store = memoryStore()
  const client = createClient({ store, source: src, trust })
  await client.install('es-419', { books: ['tit'], defaults: false, units: NO_OBS })
  return { client, store }
}

const flip = (b: Uint8Array): Uint8Array => {
  const c = b.slice()
  c[0] = c[0]! ^ 1
  return c
}

describe('fetchComplements', () => {
  test('downloads once, then reports it present', async () => {
    const { src, calls } = source()
    const { client, store } = await installed(src)
    expect(await client.fetchComplements('es-419')).toEqual({ fetched: [basemapId], present: [], missing: [] })
    expect(await store.get(basemapId)).toEqual(basemap)
    expect(await client.fetchComplements('es-419')).toEqual({ fetched: [], present: [basemapId], missing: [] })
    expect(calls).toEqual([basemapId])
  })

  test('kinds: a kind the catalogs do not list asks for nothing', async () => {
    const { src, calls } = source()
    const { client } = await installed(src)
    expect(await client.fetchComplements('es-419', { kinds: ['nothing'] })).toEqual({ fetched: [], present: [], missing: [] })
    expect(calls).toEqual([])
    expect((await client.fetchComplements('es-419', { kinds: ['basemap'] })).fetched).toEqual([basemapId])
  })

  test('wrong bytes or wrong size are recorded in missing and never stored', async () => {
    for (const wrong of [basemap.slice(0, 10), flip(basemap)]) {
      const { src } = source(() => wrong)
      const { client, store } = await installed(src)
      const r = await client.fetchComplements('es-419')
      expect(r.fetched).toEqual([])
      expect(r.missing).toHaveLength(1)
      expect(r.missing[0]!.id).toBe(basemapId)
      expect(r.missing[0]!.kind).toBe('basemap')
      expect(r.missing[0]!.reason).toContain('E_ID')
      expect(await store.has(basemapId)).toBe(false)
    }
  })

  test('a 404 or a source without complement is recorded, and install is unaffected', async () => {
    const a = source(() => 404)
    const first = await installed(a.src)
    const r = await first.client.fetchComplements('es-419')
    expect(r.missing).toHaveLength(1)
    expect(r.missing[0]!.reason).toContain('404')

    server?.stop()
    server = startFakeServer(sample)
    const plain = httpSource({ base: server.url })
    const second = await installed({ catalog: plain.catalog, segment: plain.segment })
    const r2 = await second.client.fetchComplements('es-419')
    expect(r2.fetched).toEqual([])
    expect(r2.missing).toHaveLength(1)
  })

  test('an object of the wrong size in the store is fetched again', async () => {
    const { src } = source()
    const { client, store } = await installed(src)
    await store.put(basemapId, new Uint8Array([1, 2, 3]))
    expect((await client.fetchComplements('es-419')).fetched).toEqual([basemapId])
    expect(await store.get(basemapId)).toEqual(basemap)
  })
})

describe('prune, verify, transfer', () => {
  test('prune keeps the listed complement and removes an unlisted object; verify is clean', async () => {
    const { src } = source()
    const { client, store } = await installed(src)
    await client.fetchComplements('es-419')
    const stray = new Uint8Array([9, 9, 9])
    const strayId = 'ab'.repeat(32)
    await store.put(strayId, stray)
    expect((await client.verify()).bad).toEqual([strayId])
    const { removed } = await client.prune()
    expect(removed).toContain(strayId)
    expect(removed).not.toContain(basemapId)
    expect(await store.has(basemapId)).toBe(true)
    expect(await client.verify()).toEqual({ bad: [] })
  })

  test('verify reports a damaged complement', async () => {
    const { src } = source()
    const { client, store } = await installed(src)
    await client.fetchComplements('es-419')
    await store.put(basemapId, flip(basemap))
    expect((await client.verify()).bad).toEqual([basemapId])
  })

  test('export then import into a fresh store carries the complement; one not downloaded is skipped', async () => {
    const { src } = source()
    const { client } = await installed(src)
    const without = await client.exportTransfer({ lang: 'es-419', mode: 'full' })
    await client.fetchComplements('es-419')
    const full = await client.exportTransfer({ lang: 'es-419', mode: 'full' })
    expect(full.length).toBeGreaterThan(without.length)

    expect((await createClient({ store: memoryStore(), trust }).importTransfer(without)).complements).toEqual([])

    const store = memoryStore()
    const fresh = createClient({ store, trust })
    const report = await fresh.importTransfer(full)
    expect(report.complements).toEqual([basemapId])
    expect(report.rejected).toEqual([])
    expect(await store.get(basemapId)).toEqual(basemap)
    expect(await fresh.fetchComplements('es-419')).toEqual({ fetched: [], present: [basemapId], missing: [] })
  })

  test('update mode carries it too, and complements: false carries none', async () => {
    const { src } = source()
    const { client } = await installed(src)
    await client.fetchComplements('es-419')
    const update = await readTransfer(await client.exportTransfer({ lang: 'es-419', mode: 'update', base: [sample.langCatalog, sample.commonCatalog] }), { known: KNOWN as KnownTables })
    expect(update.entries.some((e) => e.id === basemapId && e.kind === 'complement')).toBe(true)
    const none = await readTransfer(await client.exportTransfer({ lang: 'es-419', mode: 'full', complements: false }), { known: KNOWN as KnownTables })
    expect(none.entries.some((e) => e.id === basemapId)).toBe(false)
    const full = await readTransfer(await client.exportTransfer({ lang: 'es-419', mode: 'full' }), { known: KNOWN as KnownTables })
    expect(full.entries.some((e) => e.id === basemapId && e.kind === 'complement')).toBe(true)
  })

  test('prune keeps the complement of a required catalog that is no longer published (older common)', async () => {
    const { src } = source()
    const { client, store } = await installed(src)
    await client.fetchComplements('es-419')
    const state = (await store.getState())!
    // The common catalog is now reached only through the language catalog that requires it by id.
    delete state.published['common']
    delete state.active['common']
    await store.setState(state)
    const { removed } = await client.prune()
    expect(removed).not.toContain(basemapId)
    expect(await store.has(basemapId)).toBe(true)
    expect(await client.verify()).toEqual({ bad: [] })
    expect((await client.fetchComplements('es-419')).present).toEqual([basemapId])
  })

  test('prune keeps the complement of a catalog only a kept catalog requires', async () => {
    const { src } = source()
    const { client, store } = await installed(src)
    await client.fetchComplements('es-419')
    const state = (await store.getState())!
    delete state.published['common']
    delete state.active['common']
    for (const [k, u] of Object.entries(state.units)) if (u.catalog === 'common') delete state.units[k]
    await store.setState(state)
    expect((await client.prune()).removed).not.toContain(basemapId)
    expect(await store.has(basemapId)).toBe(true)
  })

  test('prune keeps the complement of a catalog only a kept unit came from', async () => {
    const { src } = source()
    const { client, store } = await installed(src)
    await client.fetchComplements('es-419')
    const state = (await store.getState())!
    for (const n of ['common', 'es-419']) {
      delete state.published[n]
      delete state.active[n]
    }
    for (const [k, u] of Object.entries(state.units)) if (u.catalog !== 'common') delete state.units[k]
    expect(Object.keys(state.units).length).toBeGreaterThan(0)
    await store.setState(state)
    expect((await client.prune()).removed).not.toContain(basemapId)
    expect(await store.has(basemapId)).toBe(true)
  })

  test('import: a store that fails on a complement records E_STORE and does not throw', async () => {
    const { src } = source()
    const { client } = await installed(src)
    await client.fetchComplements('es-419')
    const full = await client.exportTransfer({ lang: 'es-419', mode: 'full' })
    const inner = memoryStore()
    const store: BlobStore = { ...inner, put: async (id, b) => (id === basemapId ? Promise.reject(new Error('quota')) : inner.put(id, b)) }
    const report = await createClient({ store, trust }).importTransfer(full)
    expect(report.complements).toEqual([])
    expect(report.rejected).toEqual([{ id: basemapId, code: 'E_STORE' }])
    expect(report.activated.length).toBeGreaterThan(0)
  })

  test('verify: an orphan complement is good, a damaged segment is still bad', async () => {
    const { src } = source()
    const { client, store } = await installed(src)
    const orphan = new Uint8Array([4, 5, 6, 7])
    await store.put(await sha256Hex(orphan), orphan)
    expect(await client.verify()).toEqual({ bad: [] })
    const id = (await Promise.all([...sample.segments.keys()].map(async (k) => ((await store.has(k)) ? k : undefined)))).find((x) => x !== undefined)
    await store.put(id, flip((await store.get(id))!))
    expect((await client.verify()).bad).toEqual([id])
  })
})

describe('import of complement entries', () => {
  const file = async (entries: { id: string; bytes: Uint8Array }[]) => {
    const built = async (bytes: Uint8Array) => {
      const r = await readSegment(bytes, { known: CATALOG_TABLES, expectedClass: 'catalog' })
      return { seg: r.seg, bytes, id: r.id, inputs: '' }
    }
    return writeTransfer({
      mode: 'full',
      catalogs: [await built(sample.langCatalog), await built(sample.commonCatalog)],
      entries: entries.map((e) => ({ ...e, kind: 'complement' as const })),
      made: '2026-11-02T00:00:00Z',
      by: 'test',
    })
  }

  test('an entry no catalog of the file lists is ignored: not stored, not rejected', async () => {
    const stray = new Uint8Array([1, 1, 2, 3])
    const strayId = await sha256Hex(stray)
    const store = memoryStore()
    const report = await createClient({ store, trust }).importTransfer(await file([{ id: strayId, bytes: stray }, { id: basemapId, bytes: basemap }]))
    expect(report.complements).toEqual([basemapId])
    expect(report.rejected).toEqual([])
    expect(await store.has(strayId)).toBe(false)
  })

  test('a listed entry whose bytes are not its id is rejected and not stored', async () => {
    const store = memoryStore()
    const report = await createClient({ store, trust }).importTransfer(await file([{ id: basemapId, bytes: flip(basemap) }]))
    expect(report.complements).toEqual([])
    expect(report.rejected.map((r) => r.id)).toEqual([basemapId])
    expect(await store.has(basemapId)).toBe(false)
  })

  test('complements do not disturb activation', async () => {
    const { src } = source()
    const { client } = await installed(src)
    const without = await client.exportTransfer({ lang: 'es-419', mode: 'full' })
    await client.fetchComplements('es-419')
    const withC = await client.exportTransfer({ lang: 'es-419', mode: 'full' })
    const a = await createClient({ store: memoryStore(), trust }).importTransfer(without)
    const b = await createClient({ store: memoryStore(), trust }).importTransfer(withC)
    expect(b.activated).toEqual(a.activated)
    expect(b.waiting).toEqual(a.waiting)
    expect(a.complements).toEqual([])
  })
})
