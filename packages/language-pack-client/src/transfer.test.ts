import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOG_TABLES, KNOWN, readSegment, readTransfer, writeTransfer, type BuiltSegment, type KnownTables } from '@bt-synergy/language-pack-v3'
import { partsSource } from '../../language-pack-v3/src/node/partsSource'
import { createClient, type LanguagePackClient } from './client'
import { httpSource } from './source/http'
import { memoryStore } from './store/memory'
import type { BlobStore } from './store/types'
import { verifyCatalogFile } from './verify'
import { type FakeServer, startFakeServer } from '../test/fakeServer'
import { buildSample, rewordTitusNote, type Sample } from '../test/sample'

const SPEC = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests')
const file = (...p: string[]) => new Uint8Array(readFileSync(join(SPEC, ...p)))
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
const hexOf = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

let sample: Sample
let sample2: Sample
let trust: { trustedKeys: Record<string, Uint8Array> }
/** segment ids by catalog name and unit id */
const unitSegs = async (cat: Uint8Array, unit: string): Promise<string[]> => {
  const c = await verifyCatalogFile(cat, {}, { from: 'store' })
  const u = c.catalog.units.find((x) => x.id === unit)!
  return u.segments.map((i) => hexOf(c.catalog.segments[i]!.id))
}

beforeAll(async () => {
  sample = await buildSample()
  sample2 = await buildSample({ revision: 2, tweak: rewordTitusNote() })
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

let server: FakeServer | undefined
afterEach(() => server?.stop())

/** A client with Titus installed from the fake server (which is stopped again: the client keeps no source use). */
async function installed(content: Sample): Promise<{ client: LanguagePackClient; store: BlobStore }> {
  const srv = startFakeServer(content)
  const store = memoryStore()
  const client = createClient({ store, source: httpSource({ base: srv.url }), trust })
  try {
    await client.install('es-419', { books: ['tit'] })
  } finally {
    srv.stop()
  }
  return { client, store }
}
const offline = (store: BlobStore = memoryStore(), t: { trustedKeys?: Record<string, Uint8Array> } = trust) => createClient({ store, trust: t })
const installedUnits = async (c: LanguagePackClient) => (await c.status('es-419')).units.filter((u) => u.installed)
const idsOf = async (bytes: Uint8Array) => {
  const { index, entries } = await readTransfer(bytes, { known: KNOWN as KnownTables })
  return { index, segments: entries.filter((e) => !index.catalogs.includes(e.id)).map((e) => e.id).sort() }
}
const built = async (bytes: Uint8Array, known: Record<string, number[]>): Promise<BuiltSegment> => {
  const r = await readSegment(bytes, { known })
  return { seg: r.seg, bytes, id: r.id, inputs: '' }
}

describe('export and import', () => {
  test('full: a second client with no source reads what the first does', async () => {
    const a = await installed(sample)
    const bytes = await a.client.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] })
    const b = offline()
    const report = await b.importTransfer(bytes)
    expect(report.rejected).toEqual([])
    expect(report.missing).toEqual([])
    expect(report.waiting).toEqual([])
    expect(report.activated).toContain('es-419/book:tit')
    expect(await installedUnits(b)).toEqual(await installedUnits(a.client))
    expect((await installedUnits(b)).length).toBeGreaterThan(3)
  })

  test('full without a book list holds every active unit and the common catalog', async () => {
    const a = await installed(sample)
    const bytes = await a.client.exportTransfer({ lang: 'es-419', mode: 'full' })
    const { index } = await idsOf(bytes)
    expect(index.mode).toBe('full')
    expect(index.catalogs.length).toBe(2)
    const b = offline()
    await b.importTransfer(bytes)
    expect(await installedUnits(b)).toEqual(await installedUnits(a.client))
  })

  test('only active segments travel: the old book segment, still stored, stays home', async () => {
    const srv = startFakeServer(sample)
    server = srv
    const client = createClient({ store: memoryStore(), source: httpSource({ base: srv.url }), trust })
    await client.install('es-419', { books: ['tit'] })
    srv.set(sample2)
    await client.refresh('es-419')
    await client.install('es-419', { books: ['tit'] })
    const newBook = await unitSegs(sample2.langCatalog, 'book:tit')
    const dropped = (await unitSegs(sample.langCatalog, 'book:tit')).filter((id) => !newBook.includes(id))
    expect(dropped.length).toBeGreaterThan(0)
    const { segments } = await idsOf(await client.exportTransfer({ lang: 'es-419', mode: 'full' }))
    for (const id of dropped) expect(segments).not.toContain(id)
    for (const id of newBook) expect(segments).toContain(id)
  })

  test('update: only the new segments of the changed unit travel, and the unit moves with what it needs', async () => {
    const a = await installed(sample)
    const bStore = memoryStore()
    const b = offline(bStore)
    await b.importTransfer(await a.client.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] }))

    const srv = startFakeServer(sample2)
    server = srv
    const a2 = createClient({ store: memoryStore(), source: httpSource({ base: srv.url }), trust })
    await a2.install('es-419', { books: ['tit'] })
    const update = await a2.exportTransfer({ lang: 'es-419', mode: 'update', books: ['tit'], base: [sample.langCatalog, sample.commonCatalog] })

    const { index, segments } = await idsOf(update)
    expect(index.mode).toBe('update')
    expect(index.base).toEqual([['es-419', 1], ['common', 1]])
    const fresh = [...sample2.segments.keys()].filter((id) => !sample.segments.has(id))
    expect(segments.length).toBeGreaterThan(0)
    for (const id of segments) expect(fresh).toContain(id)
    for (const id of await unitSegs(sample2.langCatalog, 'book:tit')) if (fresh.includes(id)) expect(segments).toContain(id)

    const r = await b.importTransfer(update)
    expect(r.waiting).toEqual([])
    expect(r.activated).toContain('es-419/book:tit')
    const c2 = await verifyCatalogFile(sample2.langCatalog, {}, { from: 'store' })
    const status = await b.status('es-419')
    expect(status.active?.id).toBe(c2.id)
    // the unit and the units it needs are all on the new catalog together
    const state = (await bStore.getState())!
    const lang = Object.entries(state.units).filter(([k]) => k.startsWith('es-419/'))
    expect(lang.length).toBeGreaterThan(3)
    for (const [, u] of lang) expect(u.catalogId).toBe(c2.id)
    expect(status.updates).toEqual([])
  })

  test('update into an empty client is E_NO_BASE and writes nothing', async () => {
    const a = await installed(sample)
    const update = await a.client.exportTransfer({ lang: 'es-419', mode: 'update', books: ['tit'], base: [sample.langCatalog, sample.commonCatalog] })
    const store = memoryStore()
    await expect(offline(store).importTransfer(update)).rejects.toMatchObject({ code: 'E_NO_BASE' })
    expect(await store.ids()).toEqual([])
    expect(await store.getState()).toBeUndefined()
  })

  test('update without a usable base is E_ARG; a language that is not active is E_NOT_INSTALLED', async () => {
    const a = await installed(sample)
    await expect(a.client.exportTransfer({ lang: 'es-419', mode: 'update' })).rejects.toMatchObject({ code: 'E_ARG' })
    await expect(a.client.exportTransfer({ lang: 'fr', mode: 'full' })).rejects.toMatchObject({ code: 'E_NOT_INSTALLED' })
  })

  test('a newer catalog with holes leaves the older complete unit active', async () => {
    const a = await installed(sample)
    const bStore = memoryStore()
    const b = offline(bStore)
    await b.importTransfer(await a.client.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] }))
    const oldBook = await unitSegs(sample.langCatalog, 'book:tit')

    const newBook = await unitSegs(sample2.langCatalog, 'book:tit')
    const fresh = [...sample2.segments.keys()].filter((id) => !sample.segments.has(id))
    const withheld = newBook.filter((id) => fresh.includes(id))
    expect(withheld.length).toBeGreaterThan(0)
    const classOf = new Map<string, string>()
    for (const bytes of [sample2.langCatalog, sample2.commonCatalog]) {
      const c = await verifyCatalogFile(bytes, {}, { from: 'store' })
      for (const e of c.catalog.segments) classOf.set(hexOf(e.id), e.class)
    }
    const entries: BuiltSegment[] = []
    for (const id of fresh.filter((x) => !withheld.includes(x) && classOf.has(x))) {
      entries.push(await built(sample2.segments.get(id)!, (KNOWN as Record<string, Record<string, number[]>>)[classOf.get(id)!]!))
    }
    const file2 = writeTransfer({
      mode: 'update',
      catalogs: [await built(sample2.langCatalog, CATALOG_TABLES)],
      entries,
      base: [['es-419', 1], ['common', 1]],
      made: '2026-11-02T00:00:00Z',
      by: 'test',
    })
    const r = await b.importTransfer(file2)
    expect(r.waiting.map((w) => w.key)).toContain('es-419/book:tit')
    const status = await b.status('es-419')
    expect(status.published?.revision).toBe(2)
    const unit = status.units.find((u) => u.key === 'es-419/book:tit')!
    expect(unit.installed).toBe(true)
    expect(unit.revision).toBe(1)
    // the older segments are still the active ones
    expect((await bStore.getState())!.units['es-419/book:tit']!.segments).toEqual(oldBook)
  })

  test('a lower revision is E_DOWNGRADE unless confirmed, and nothing changes', async () => {
    const a1 = await installed(sample)
    const a2 = await installed(sample2)
    const older = await a1.client.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] })
    const store = memoryStore()
    const b = offline(store)
    await b.importTransfer(await a2.client.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] }))
    const before = await store.getState()
    const ids = await store.ids()
    await expect(b.importTransfer(older)).rejects.toMatchObject({ code: 'E_DOWNGRADE' })
    expect(await store.getState()).toEqual(before)
    expect(await store.ids()).toEqual(ids)
    const r = await b.importTransfer(older, { confirmDowngrade: true })
    expect(r.catalogs.find((c) => c.name === 'es-419')?.revision).toBe(1)
    expect((await b.status('es-419')).active?.revision).toBe(1)
  })

  test('importing the same file twice changes nothing', async () => {
    const a = await installed(sample)
    const bytes = await a.client.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] })
    const store = memoryStore()
    const b = offline(store)
    await b.importTransfer(bytes)
    const state = await store.getState()
    const r = await b.importTransfer(bytes)
    expect(r.activated).toEqual([])
    expect(await store.getState()).toEqual(state)
  })

  test('a store that fails mid-import gives E_STORE, the state before, and keeps the segments written', async () => {
    const a = await installed(sample)
    const bytes = await a.client.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] })
    const inner = memoryStore()
    let puts = 0
    const store: BlobStore = {
      has: (id) => inner.has(id),
      get: (id) => inner.get(id),
      ids: () => inner.ids(),
      delete: (id) => inner.delete(id),
      getState: () => inner.getState(),
      setState: (s) => inner.setState(s),
      async put(id, b) {
        if (++puts === 3) throw new Error('QuotaExceededError')
        return inner.put(id, b)
      },
    }
    await expect(offline(store).importTransfer(bytes)).rejects.toMatchObject({ code: 'E_STORE' })
    expect(await inner.getState()).toBeUndefined()
    expect((await inner.ids()).length).toBe(2)
    const r = await offline(inner).importTransfer(bytes)
    expect(r.activated).toContain('es-419/book:tit')
  })

  test('a corrupt entry is rejected, not stored', async () => {
    const a = await installed(sample)
    const bytes = (await a.client.exportTransfer({ lang: 'es-419', mode: 'full', books: ['tit'] })).slice()
    const { segments } = await idsOf(bytes)
    // flip a byte inside the last entry
    bytes[bytes.length - 5] = bytes[bytes.length - 5]! ^ 0xff
    const store = memoryStore()
    const r = await offline(store).importTransfer(bytes)
    expect(r.rejected.length + r.missing.length).toBeGreaterThan(0)
    for (const x of r.rejected) expect(await store.has(x.id)).toBe(false)
    expect(segments.length).toBeGreaterThan(0)
  })
})

describe('the spec fixtures', () => {
  test('a cut file: whole entries are stored, the cut one is missing, and nothing is activated from a unit that lacks it', async () => {
    const store = memoryStore()
    const r = await offline(store, {}).importTransfer(file('transferencia-cortada', 'cut.tcpack'))
    expect(r.missing).toEqual(['12e4f2c8c44626fda329709ee53f852cef3d93046a36f145f2196738f794469b'])
    expect(r.stored.some((id) => id.startsWith('644fd73e'))).toBe(true)
    expect(r.stored).not.toContain(r.missing[0]!)
    expect(r.catalogs.map((c) => c.name)).toEqual(['es-419'])
    expect(r.activated).toEqual([])
    expect(r.waiting.map((w) => w.key)).toEqual(['es-419/book:tit'])
    expect(await store.has(r.missing[0]!)).toBe(false)
  })

  test('a local catalog in a transfer file is E_SIGNATURE with keys, and nothing is stored', async () => {
    const keys = JSON.parse(readFileSync(join(SPEC, 'transferencia-catalogo-local', 'local.keys.json'), 'utf8')) as Record<string, string>
    const t = { trustedKeys: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, bytesOf(v)])) }
    const store = memoryStore()
    await expect(offline(store, t).importTransfer(file('transferencia-catalogo-local', 'local.tcpack'))).rejects.toMatchObject({ code: 'E_SIGNATURE' })
    expect(await store.ids()).toEqual([])
    expect(await store.getState()).toBeUndefined()
  })
})

describe('importOldPack', () => {
  test('a local catalog; the book waits for its original until the published catalogs come, then activates', async () => {
    const data = join(SPEC, 'data')
    const originals = await partsSource({ list: join(data, 'originals', 'list.json'), partsDir: join(data, 'parts') })
    const srv = startFakeServer(sample)
    server = srv
    const store = memoryStore()
    const client = createClient({ store, source: httpSource({ base: srv.url }), trust })
    const r = await client.importOldPack(file('data', 'es-419-tit.langpack.zip'), { originals, device: 'test-device', now: '2026-11-01T10:00:00Z' })
    expect(r.catalogs).toHaveLength(1)
    expect(r.catalogs[0]).toMatchObject({ name: 'es-419', origin: 'local', publisher: 'local:test-device' })
    expect(r.activated).toContain('es-419/map')
    expect(r.waiting).toEqual([{ key: 'es-419/book:tit', missing: ['es-419/orig:tit'] }])
    expect(srv.hits).toEqual([])

    await client.refresh('es-419')
    const inst = await client.install('es-419', { books: ['tit'] })
    expect(inst.waiting).toEqual([])
    const state = (await store.getState())!
    expect(state.active['es-419']?.origin).toBe('published')
    expect(state.units['es-419/book:tit']?.catalogId).toBe(state.published['es-419']!.id)
    expect(state.units['common/orig:tit']).toBeDefined()
  })

  test('bytes that are not an old pack are refused', async () => {
    await expect(offline().importOldPack(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(Error)
  })
})
