import { afterEach, describe, expect, test } from 'bun:test'
import { Door43ApiClient } from './Door43ApiClient'
import { door43Fetch } from './door43Fetch'

const realFetch = globalThis.fetch
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

function deviceOnline(onLine: boolean | undefined) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: onLine === undefined ? undefined : { onLine } })
}

afterEach(() => {
  globalThis.fetch = realFetch
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator)
})

describe('door43Fetch', () => {
  test('with the device offline it asks nothing and fails as fetch does with no network', async () => {
    let asked = 0
    globalThis.fetch = (async () => {
      asked++
      return new Response('[]')
    }) as typeof fetch
    deviceOnline(false)
    await expect(door43Fetch('https://git.door43.org/api/v1/catalog/search')).rejects.toBeInstanceOf(TypeError)
    expect(asked).toBe(0)
  })

  test('online, or with no navigator (Node), it is fetch', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (url: string) => {
      urls.push(String(url))
      return new Response('ok')
    }) as typeof fetch
    deviceOnline(true)
    expect(await (await door43Fetch('https://a.example/1')).text()).toBe('ok')
    deviceOnline(undefined)
    expect(await (await door43Fetch('https://a.example/2')).text()).toBe('ok')
    expect(urls).toEqual(['https://a.example/1', 'https://a.example/2'])
  })

  test("the client's requests go through it: offline, a catalog search asks nothing", async () => {
    let asked = 0
    globalThis.fetch = (async () => {
      asked++
      return new Response('{"data":[]}')
    }) as typeof fetch
    deviceOnline(false)
    const client = new Door43ApiClient()
    await expect(client.searchCatalog({ lang: 'es-419', stage: 'prod' } as never)).rejects.toThrow()
    await expect(client.getLanguages({ stage: 'prod' } as never)).rejects.toThrow()
    await expect(client.fetchRepoTreeBlobs('es-419_gl', 'es-419_glt', 'v42')).rejects.toThrow()
    expect(asked).toBe(0)
  })
})
