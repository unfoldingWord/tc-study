/** The indexed `renderings` answers exactly as the scan it replaced, on every Strong key of the sample and on position queries. */
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createClient } from '../client'
import { httpSource } from '../source/http'
import { memoryStore } from '../store/memory'
import { type FakeServer, startFakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
import type { PackReader } from '../reader'
import { renderingsQuery } from './renderings'
import { legacyRenderingsQuery } from '../../test/renderingsLegacy'

let sample: Sample
let server: FakeServer | undefined
const bytesOf = (h: string) => Uint8Array.from(h.match(/../g)!, (p) => parseInt(p, 16))
afterEach(() => server?.stop())
beforeAll(async () => {
  sample = await buildSample()
}, 120_000)

describe('renderings: indexed and scan agree', () => {
  test('every key of Titus, twice (the second call uses the index), and by position', async () => {
    server = startFakeServer(sample, {})
    const trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
    const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await client.install('es-419', { books: ['tit'] })
    const reader = await client.open('es-419')
    const orig = (await reader.orig('tit'))!
    const keys = [...new Set(orig.words.map((w) => w.strong))]
    expect(keys.length).toBeGreaterThan(20)
    let nonEmpty = 0
    for (const strong of [...keys, 'G3972', 'G99999']) {
      const old = await legacyRenderingsQuery(reader, { strong })
      for (let pass = 0; pass < 2; pass++) {
        const now = await renderingsQuery(reader, { strong })
        expect(now).toEqual(old)
      }
      if (old.data!.renderings.length > 0) nonEmpty++
    }
    expect(nonEmpty).toBeGreaterThan(10)
    for (const word of [0, 1, 5, orig.words.length - 1]) {
      expect(await renderingsQuery(reader, { book: 'tit', word })).toEqual(await legacyRenderingsQuery(reader, { book: 'tit', word }))
    }
  })

  async function open(books: string[]): Promise<PackReader> {
    server?.stop()
    server = startFakeServer(sample, {})
    const trust = { trustedKeys: { [sample.keys.keyId]: bytesOf(sample.keys.publicKey) } }
    const client = createClient({ store: memoryStore(), source: httpSource({ base: server.url }), trust })
    await client.install('es-419', { books })
    return client.open('es-419')
  }
  const same = async (r: PackReader, q: { strong: string }) => {
    const old = await legacyRenderingsQuery(r, q)
    expect(await renderingsQuery(r, q)).toEqual(old)
    expect(await renderingsQuery(r, q)).toEqual(old)
    return old
  }

  test('a stale book: an original of another stamp', async () => {
    const reader = await open(['tit'])
    const stale: PackReader = { ...reader, orig: async (b) => ((o) => (o === undefined ? undefined : { ...o, stamp: 'g' + '0'.repeat(40) }))(await reader.orig(b)) }
    const old = await same(stale, { strong: 'G39720' })
    expect(old.data!.renderings).toEqual([])
    expect(old.notInstalled).toContainEqual(expect.objectContaining({ book: 'tit', unit: 'orig:tit', what: 'stale' }))
  })

  test('a book that is not installed (the units are listed)', async () => {
    const none = await open([])
    expect(none.installed('book:tit')).toBe(false)
    const a = await same(none, { strong: 'G39720' })
    expect(a.data!.renderings).toEqual([])
    const reader = await open(['tit'])
    const hidden: PackReader = { ...reader, installed: (u) => (u === 'book:tit' ? false : reader.installed(u)) }
    const b = await same(hidden, { strong: 'G39720' })
    expect(b.notInstalled).toContainEqual(expect.objectContaining({ book: 'tit', unit: 'book:tit' }))
  })

  test('the alt key: no xmap, a four-digit Greek key also matches the words keyed with a 0 added', async () => {
    const reader = await open(['tit'])
    const noMap: PackReader = { ...reader, mapsOf: async () => ({ revision: 1 }) as Awaited<ReturnType<PackReader['mapsOf']>> }
    const a = await same(noMap, { strong: 'G3972' })
    expect(a.data!.strong).toBe('G3972')
    expect(a.data!.renderings.length).toBeGreaterThan(0)
  })
})
