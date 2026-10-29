import { afterEach, describe, expect, test } from 'bun:test'
import { sha256Hex } from '@bt-synergy/language-pack'
import { fetchList, fetchOriginals, fetchPart, RETRY } from './packsClient'

const SERVER = 'https://packs.example/v2/packs/'
const COMPAT = 'f2.0-u2.3.0-p6000230-q9-a12-t1'
const SHA = 'a'.repeat(64)

const list = (language: string) => ({ schema: 2, language, resources: [], parts: [{ sha256: SHA, bytes: 3 }] })

function fake(status: number, body: BodyInit | null, headers: Record<string, string> = {}) {
  const asked: Array<{ url: string; init?: RequestInit }> = []
  const fetch = (async (url: string, init?: RequestInit) => {
    asked.push({ url: String(url), init })
    return new Response(body, { status, headers })
  }) as unknown as typeof globalThis.fetch
  return { fetch, asked }
}

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
afterEach(() => {
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator)
})

describe('fetchList', () => {
  test('a 200 with a schema-2 list of this language is ready, with its ETag, at the list path', async () => {
    const { fetch, asked } = fake(200, JSON.stringify(list('es-419')), { ETag: '"v1"' })
    const got = await fetchList(SERVER, COMPAT, 'es-419', null, { fetch })
    expect(got).toMatchObject({ kind: 'ready', etag: '"v1"', list: { language: 'es-419' } })
    expect(asked[0].url).toBe(`${SERVER}${COMPAT}/es-419`)
  })

  test('the ETag goes as If-None-Match, and a 304 is the same list', async () => {
    const { fetch, asked } = fake(304, null)
    expect(await fetchList(SERVER, COMPAT, 'en', '"v1"', { fetch })).toEqual({ kind: 'same' })
    expect(new Headers(asked[0].init?.headers).get('If-None-Match')).toBe('"v1"')
  })

  test('a captive portal (HTML with a 200), or another language, is not a list', async () => {
    expect((await fetchList(SERVER, COMPAT, 'en', null, fake(200, '<html>login</html>'))).kind).toBe('unavailable')
    expect((await fetchList(SERVER, COMPAT, 'en', null, fake(200, JSON.stringify(list('fr'))))).kind).toBe('unavailable')
  })

  test('the server is preparing it: wait as long as it says', async () => {
    expect(await fetchList(SERVER, COMPAT, 'en', null, fake(202, '{}', { 'Retry-After': '120' }))).toEqual({ kind: 'preparing', retryAfter: 120 })
    expect(await fetchList(SERVER, COMPAT, 'en', null, fake(202, '{}'))).toEqual({ kind: 'preparing', retryAfter: RETRY.preparing })
  })

  test('404 says why: no packs for the language, an app too old, or parts switched off', async () => {
    expect(await fetchList(SERVER, COMPAT, 'xx', null, fake(404, JSON.stringify({ error: 'no packs for this language' })))).toEqual({ kind: 'no-language' })
    expect(await fetchList(SERVER, COMPAT, 'en', null, fake(404, JSON.stringify({ state: 'unavailable', reason: 'old-compat' })))).toEqual({ kind: 'update-app' })
    expect((await fetchList(SERVER, COMPAT, 'en', null, fake(404, JSON.stringify({ state: 'unavailable', reason: 'parts-off' })))).kind).toBe('unavailable')
  })

  test('429 waits; 503 waits longer when the server says a person must act', async () => {
    expect(await fetchList(SERVER, COMPAT, 'en', null, fake(429, '{}'))).toEqual({ kind: 'wait', retryAfter: RETRY.rateLimited })
    expect(await fetchList(SERVER, COMPAT, 'en', null, fake(503, JSON.stringify({ reason: 'paused' })))).toEqual({ kind: 'unavailable', retryAfter: RETRY.stopped })
  })

  test('a network failure is unavailable, never a throw', async () => {
    const fetch = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof globalThis.fetch
    expect((await fetchList(SERVER, COMPAT, 'en', null, { fetch })).kind).toBe('unavailable')
  })

  test('offline it asks nothing', async () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
    const { fetch, asked } = fake(200, JSON.stringify(list('en')))
    expect((await fetchList(SERVER, COMPAT, 'en', null, { fetch })).kind).toBe('unavailable')
    expect(asked).toEqual([])
  })
})

describe('fetchPart and fetchOriginals', () => {
  test('a part is ready only when its bytes hash to its name', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const sha = await sha256Hex(bytes)
    const { fetch, asked } = fake(200, bytes)
    expect(await fetchPart(SERVER, sha, { fetch })).toEqual({ kind: 'ready', bytes })
    expect(asked[0].url).toBe(`${SERVER}parts/${sha}`)
    expect(await fetchPart(SERVER, SHA, fake(200, bytes))).toEqual({ kind: 'failed' })
    expect(await fetchPart(SERVER, sha, fake(404, null))).toEqual({ kind: 'gone' })
  })

  test('an originals list must hash to its name and be the originals', async () => {
    const body = new TextEncoder().encode(JSON.stringify(list('originals')))
    const sha = await sha256Hex(body)
    const { fetch, asked } = fake(200, body)
    expect(await fetchOriginals(SERVER, COMPAT, sha, { fetch })).toMatchObject({ kind: 'ready', list: { language: 'originals' } })
    expect(asked[0].url).toBe(`${SERVER}${COMPAT}/originals/${sha}`)
    const notOriginals = new TextEncoder().encode(JSON.stringify(list('en')))
    expect(await fetchOriginals(SERVER, COMPAT, await sha256Hex(notOriginals), fake(200, notOriginals))).toEqual({ kind: 'failed' })
  })

  test('a link that sends nothing for too long is given up', async () => {
    const fetch = ((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))))) as unknown as typeof globalThis.fetch
    expect(await fetchPart(SERVER, SHA, { fetch, idleMs: 20 })).toEqual({ kind: 'failed' })
  })
})
