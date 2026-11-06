import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readSegment, CATALOG_TABLES, catalogView } from '@bt-synergy/language-pack-v3'
import { startFakeServer, type FakeServer } from '../../test/fakeServer'
import { buildSample, type Sample } from '../../test/sample'
import { ClientError } from '../errors'
import { httpSource } from './http'

let sample: Sample
let server: FakeServer
const idOf = async (bytes: Uint8Array) => (await readSegment(bytes, { known: CATALOG_TABLES, expectedClass: 'catalog' })).id

beforeAll(async () => {
  sample = await buildSample()
  server = startFakeServer(sample)
}, 60000)
afterAll(() => server.stop())

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ClientError
  }
  throw new Error('did not reject')
}

describe('httpSource against the fake server', () => {
  test('gets the language catalog, the common catalog and a segment by id', async () => {
    const source = httpSource({ base: server.url })
    const lang = await source.catalog('es-419')
    if (lang === 'not-modified') throw new Error('unexpected')
    expect(await idOf(lang.bytes)).toBe(await idOf(sample.langCatalog))
    expect(catalogView((await readSegment(lang.bytes, { known: CATALOG_TABLES, expectedClass: 'catalog' })).seg).about.catalog).toBe('es-419')
    expect(lang.etag).toMatch(/^"/)
    const common = await source.catalog('common')
    if (common === 'not-modified') throw new Error('unexpected')
    expect(await idOf(common.bytes)).toBe(await idOf(sample.commonCatalog))
    const [id, bytes] = [...sample.segments][0]
    expect(await source.segment(id)).toEqual(bytes)
  })

  test('the second catalog request with the ETag is not-modified', async () => {
    const source = httpSource({ base: server.url })
    const first = await source.catalog('es-419')
    if (first === 'not-modified') throw new Error('unexpected')
    expect(await source.catalog('es-419', { etag: first.etag })).toBe('not-modified')
  })

  test('an unknown language is E_NO_PACK', async () => {
    const e = await failure(httpSource({ base: server.url }).catalog('qq-zz'))
    expect(e.code).toBe('E_NO_PACK')
  })

  test('a missing segment is E_NETWORK 404', async () => {
    const e = await failure(httpSource({ base: server.url }).segment('0'.repeat(64)))
    expect([e.code, e.status]).toEqual(['E_NETWORK', 404])
  })

  test('429 carries retryAfter; a thrown fetch is E_NETWORK', async () => {
    const limited = httpSource({ base: 'http://x', fetch: (async () => new Response('{}', { status: 429, headers: { 'Retry-After': '7' } })) as unknown as typeof fetch })
    const e = await failure(limited.segment('a'.repeat(64)))
    expect([e.code, e.status, e.retryAfter]).toEqual(['E_NETWORK', 429, 7])
    const thrown = httpSource({ base: 'http://x', fetch: (async () => { throw new TypeError('down') }) as unknown as typeof fetch })
    expect((await failure(thrown.catalog('es-419'))).code).toBe('E_NETWORK')
  })

  test('an aborted signal rejects', async () => {
    const ctl = new AbortController()
    ctl.abort()
    await expect(httpSource({ base: server.url }).catalog('es-419', { signal: ctl.signal })).rejects.toBeDefined()
    await expect(httpSource({ base: server.url }).segment([...sample.segments.keys()][0], ctl.signal)).rejects.toBeDefined()
  })
})

describe('the fake server follows serving.md', () => {
  const CORS = ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-expose-headers']

  test('400 bad pack path: uppercase hex, trailing slash, extra element', async () => {
    const id = [...sample.segments.keys()][0]
    for (const path of [`/v3/packs/seg/${id.toUpperCase()}`, '/v3/packs/es-419/catalog/', '/v3/packs/es-419/catalog/x', '/v3/packs/seg/short']) {
      const res = await fetch(server.url + path)
      expect([path, res.status]).toEqual([path, 400])
      expect(await res.json()).toEqual({ error: 'bad pack path' })
      expect(res.headers.get('cache-control')).toBe('no-store')
    }
    // seg/catalog is the catalog of the language seg, not a segment
    const seg = await fetch(`${server.url}/v3/packs/seg/catalog`)
    expect([seg.status, await seg.json()]).toEqual([404, { error: 'catalog not found' }])
  })

  test('405 with Allow, OPTIONS 204, both with CORS', async () => {
    const post = await fetch(`${server.url}/v3/packs/common/catalog`, { method: 'POST' })
    expect(post.status).toBe(405)
    expect(post.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    expect(await post.json()).toEqual({ error: 'method not allowed' })
    const options = await fetch(`${server.url}/v3/packs/common/catalog`, { method: 'OPTIONS' })
    expect(options.status).toBe(204)
    for (const h of CORS) expect(options.headers.get(h)).not.toBeNull()
  })

  test('CORS and Cache-Control on catalogs, segments, 304 and errors', async () => {
    const cat = await fetch(`${server.url}/v3/packs/es/catalog`)
    expect(cat.status).toBe(200)
    expect(cat.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(cat.headers.get('content-type')).toBe('application/octet-stream')
    const etag = cat.headers.get('etag')!
    for (const h of CORS) expect(cat.headers.get(h)).not.toBeNull()
    const again = await fetch(`${server.url}/v3/packs/es-419/catalog`, { headers: { 'If-None-Match': `W/${etag}, "other"` } })
    expect(again.status).toBe(304)
    for (const h of CORS) expect(again.headers.get(h)).not.toBeNull()
    const id = [...sample.segments.keys()][0]
    const seg = await fetch(`${server.url}/v3/packs/seg/${id}`)
    expect(seg.headers.get('cache-control')).toBe('public, max-age=31536000, immutable, no-transform')
    const missing = await fetch(`${server.url}/v3/packs/seg/${'0'.repeat(64)}`)
    expect([missing.status, await missing.json()]).toEqual([404, { error: 'segment not found' }])
    for (const h of CORS) expect(missing.headers.get(h)).not.toBeNull()
    expect(server.hits.length).toBeGreaterThan(0)
  })

  test('failSegment, noCommon and set', async () => {
    const id = [...sample.segments.keys()][0]
    const s = startFakeServer(sample, { noCommon: true, failSegment: (_i, n) => (n === 1 ? 'corrupt' : n === 2 ? 404 : 'ok') })
    try {
      const a = new Uint8Array(await (await fetch(`${s.url}/v3/packs/seg/${id}`)).arrayBuffer())
      expect(a).not.toEqual(sample.segments.get(id)!)
      expect(a.length).toBe(sample.segments.get(id)!.length)
      expect((await fetch(`${s.url}/v3/packs/seg/${id}`)).status).toBe(404)
      expect(new Uint8Array(await (await fetch(`${s.url}/v3/packs/seg/${id}`)).arrayBuffer())).toEqual(sample.segments.get(id)!)
      expect((await fetch(`${s.url}/v3/packs/common/catalog`)).status).toBe(404)
      s.set({ ...sample, langCatalog: sample.commonCatalog })
      const swapped = new Uint8Array(await (await fetch(`${s.url}/v3/packs/es-419/catalog`)).arrayBuffer())
      expect(swapped).toEqual(sample.commonCatalog)
    } finally {
      s.stop()
    }
  })

  test('a dropped body is E_NETWORK in the source', async () => {
    const id = [...sample.segments.keys()][0]
    const s = startFakeServer(sample, { failSegment: () => 'drop' })
    try {
      const e = await failure(httpSource({ base: s.url }).segment(id))
      expect(e.code).toBe('E_NETWORK')
    } finally {
      s.stop()
    }
  })
})
