import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from './client'
import { httpSource } from './source/http'
import { memoryStore } from './store/memory'
import type { BlobStore } from './store/types'
import { type FakeServer, startFakeServer } from '../test/fakeServer'
import { buildObsimgFixture, OBSIMG_META, type ObsimgFixture, withObsimg } from '../test/obsimg'
import { buildSample, type Sample } from '../test/sample'

let sample: Sample
let fixture: ObsimgFixture
let both: ReturnType<typeof withObsimg>
let trust: { trustedKeys: Record<string, Uint8Array> }
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
let server: FakeServer | undefined
afterEach(() => server?.stop())

beforeAll(async () => {
  sample = await buildSample()
  fixture = await buildObsimgFixture(sample)
  both = withObsimg(sample, fixture)
  trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
}, 120_000)

/** A store that counts the reads of the segments in `ids`. */
function counting(inner: BlobStore, ids: Set<string>): { store: BlobStore; reads: string[] } {
  const reads: string[] = []
  return {
    reads,
    store: {
      ...inner,
      has: (id) => inner.has(id),
      get: (id) => {
        if (ids.has(id)) reads.push(id)
        return inner.get(id)
      },
      put: (id, b) => inner.put(id, b),
      delete: (id) => inner.delete(id),
      ids: () => inner.ids(),
      getState: () => inner.getState(),
      setState: (s) => inner.setState(s),
    },
  }
}

function setup(content = both) {
  server?.stop()
  server = startFakeServer(content, {})
  const store = memoryStore()
  const client = createClient({ store, source: httpSource({ base: server.url }), trust })
  return { store, client }
}

const want = { units: ['obsimg'], defaults: false }

describe('obsImage', () => {
  test('refresh, install and open zxx-obsimg; obsImage and the credit answer', async () => {
    const { client } = setup()
    const r1 = await client.refresh('zxx-obsimg')
    expect(r1.catalogs.map((c) => c.name)).toEqual(['zxx-obsimg'])
    const plan = await client.install('zxx-obsimg', want)
    expect(plan.failed ?? []).toEqual([])
    const status = await client.status('zxx-obsimg')
    expect(status.units.map((u) => [u.key, u.installed, u.bytes])).toEqual([['zxx-obsimg/obsimg', true, fixture.bytes]])

    const r = await client.open('zxx-obsimg')
    expect(r.listed('obsimg')).toBe(true)
    expect(r.installed('obsimg')).toBe(true)
    expect(r.size('obsimg')).toBe(fixture.bytes)
    const a = await r.obsImage(1, 2)
    expect(a && [Array.from(a.bytes), a.media, a.w, a.h]).toEqual([[4, 5], 'image/webp', 640, 360])
    const b = await r.obsImage(2, 1)
    expect(b && Array.from(b.bytes)).toEqual([6, 7, 8, 9])
    expect(await r.obsImage(3, 1)).toBeNull()
    expect(await r.obsImage(1, 3)).toBeNull()
    expect(await r.obsImageCredit()).toEqual(OBSIMG_META)
    expect(r.problems).toEqual([])
  })

  test('not installed: null, and the credit is null', async () => {
    const { client } = setup()
    await client.refresh('zxx-obsimg')
    const r = await client.open('zxx-obsimg')
    expect(r.listed('obsimg')).toBe(true)
    expect(r.installed('obsimg')).toBe(false)
    expect(await r.obsImage(1, 1)).toBeNull()
    expect(await r.obsImageCredit()).toBeNull()
  })

  test('a reader of es-419 has no obsimg: null', async () => {
    const { client } = setup()
    await client.install('es-419', { books: [], defaults: false, units: [] })
    const r = await client.open('es-419')
    expect(await r.obsImage(1, 1)).toBeNull()
  })

  test('obsImage reads exactly one segment of the unit', async () => {
    const { client, store } = setup()
    await client.install('zxx-obsimg', want)
    const { store: spy, reads } = counting(store, new Set(fixture.segmentIds))
    const r = await createClient({ store: spy, trust }).open('zxx-obsimg')
    const img = await r.obsImage(2, 1)
    expect(img && Array.from(img.bytes)).toEqual([6, 7, 8, 9])
    expect(reads.length).toBe(1)
    await r.obsImage(2, 1)
    expect(reads.length).toBe(1)
  })

  test('a transfer of zxx-obsimg reaches a client with no other catalog', async () => {
    const { client } = setup()
    await client.install('zxx-obsimg', want)
    const bytes = await client.exportTransfer({ lang: 'zxx-obsimg', mode: 'full' })
    const fresh = createClient({ store: memoryStore(), trust })
    const report = await fresh.importTransfer(bytes)
    expect(report.catalogs.map((c) => c.name)).toEqual(['zxx-obsimg'])
    const r = await fresh.open('zxx-obsimg')
    const img = await r.obsImage(1, 1)
    expect(img && Array.from(img.bytes)).toEqual([1, 2, 3])
    expect(await r.obsImageCredit()).toEqual(OBSIMG_META)
  })

  test('installing en with defaults does not bring obsimg', async () => {
    const { client, store } = setup()
    await client.install('es-419', { books: [] })
    const state = await store.getState()
    expect(Object.keys(state!.units).filter((k) => k.includes('obsimg'))).toEqual([])
    expect(Object.keys(state!.active)).not.toContain('zxx-obsimg')
  })
})
