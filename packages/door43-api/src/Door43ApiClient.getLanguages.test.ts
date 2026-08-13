import { afterEach, describe, expect, test } from 'bun:test'
import { Door43ApiClient } from './Door43ApiClient'

describe('Door43ApiClient.getLanguages', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('list/languages requests a high limit so a paged catalog is not capped at ~14', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      return new Response(
        JSON.stringify({
          ok: true,
          data: [
            { lc: 'en', ln: 'English', ang: 'English', ld: 'ltr' },
            { lc: 'fr', ln: 'français', ang: 'French', ld: 'ltr' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as typeof fetch

    const client = new Door43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const langs = await client.getLanguages({ stage: 'prod', topic: 'tc-ready' })
    expect(urls[0]).toContain('/api/v1/catalog/list/languages')
    expect(urls[0]).toContain('limit=1000')
    expect(langs.map((l) => l.code).sort()).toEqual(['en', 'fr'])
  })

  test('catalog/search fallback walks pages until a short page', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('/catalog/list/languages')) {
        return new Response('fail', { status: 500 })
      }
      const page = Number(new URL(url).searchParams.get('page') || '1')
      const data =
        page === 1
          ? Array.from({ length: 500 }, (_, i) => ({
              language: `p1-${i}`,
              language_title: `Page1 ${i}`,
            }))
          : [{ language: 'fr', language_title: 'French' }]
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const client = new Door43ApiClient({ baseUrl: 'https://git.door43.org', timeout: 5000 })
    const langs = await client.getLanguages({ stage: 'prod', topic: 'tc-ready' })
    const searchUrls = urls.filter((u) => u.includes('/catalog/search'))
    expect(searchUrls.length).toBe(2)
    expect(searchUrls[0]).toContain('page=1')
    expect(searchUrls[1]).toContain('page=2')
    expect(langs).toHaveLength(501)
    expect(langs.some((l) => l.code === 'fr')).toBe(true)
  })
})
