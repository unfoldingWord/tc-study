import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'

import { ScriptureLoader } from '../src/ScriptureLoader'

const RESOURCE = 'unfoldingWord/en/ult'

const usfm = (code: string, name: string) => `\\id ${code}
\\h ${name}
\\c 1
\\p
\\v 1 In the beginning of ${name}
`

function createCache(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial))
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async getMany(keys: string[]) {
      const out = new Map<string, unknown>()
      for (const key of keys) if (store.has(key)) out.set(key, store.get(key))
      return out
    },
    async set(key: string, entry: unknown) {
      store.set(key, entry)
    },
    async setMany(items: Array<{ key: string; entry: unknown }>) {
      for (const item of items) store.set(item.key, item.entry)
    },
    async delete() {},
  }
}

function metadata() {
  return {
    resourceKey: RESOURCE,
    subject: 'Bible',
    type: 'scripture',
    language: 'en',
    resourceId: 'ult',
    release: { zipball_url: 'https://example.test/ult.zip', tag_name: 'v1' },
    contentMetadata: {
      ingredients: [
        { identifier: 'rut', path: './08-RUT.usfm' },
        { identifier: 'jon', path: './32-JON.usfm' },
      ],
    },
  }
}

async function zipWithRuthAndJonah(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('en_ult/08-RUT.usfm', usfm('RUT', 'Ruth'))
  zip.file('en_ult/32-JON.usfm', usfm('JON', 'Jonah'))
  return zip.generateAsync({ type: 'arraybuffer' })
}

function loaderOver(cache: ReturnType<typeof createCache>) {
  const catalogWrites: string[] = []
  let treeCalls = 0
  const loader = new ScriptureLoader({
    cacheAdapter: cache,
    catalogAdapter: {
      get: async () => metadata(),
      set: async (key: string) => {
        catalogWrites.push(key)
      },
    },
    door43Client: {
      downloadZipball: zipWithRuthAndJonah,
      async fetchRepoTreePaths() {
        treeCalls += 1
        return new Set(['08-RUT.usfm', '32-JON.usfm'])
      },
    },
    debug: false,
  })
  return { loader, catalogWrites, treeCalls: () => treeCalls }
}

const keysAbout = (cache: ReturnType<typeof createCache>, book: string) =>
  [...cache.store.keys()].filter((k) => k.includes(`:${book}`))

describe('ScriptureLoader with books', () => {
  test('writes only the asked book and no receipt', async () => {
    const cache = createCache()
    const { loader, catalogWrites, treeCalls } = loaderOver(cache)

    await loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true, books: ['RUT'] })

    expect(keysAbout(cache, 'rut').length).toBeGreaterThan(0)
    // Nothing but Ruth: no Jonah, no receipt, no other resource-wide row.
    expect([...cache.store.keys()]).toEqual(keysAbout(cache, 'rut'))
    expect(catalogWrites).toEqual([])
    // The zip on disk is the release's tree: no tree request per book.
    expect(treeCalls()).toBe(0)
  })

  test('a book the receipt lists as absent from the release stays out even when asked and in the zip', async () => {
    const prior = { content: {}, metadata: { absentFromRelease: ['jon'] } }
    const cache = createCache({ [`resource:${RESOURCE}`]: prior })
    const { loader } = loaderOver(cache)

    await loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true, books: ['rut', 'jon'] })

    expect(keysAbout(cache, 'rut').length).toBeGreaterThan(0)
    expect(keysAbout(cache, 'jon')).toEqual([])
    expect(cache.store.get(`resource:${RESOURCE}`)).toBe(prior)
  })

  test('without books, every book and the receipt are written as before', async () => {
    const cache = createCache()
    const { loader } = loaderOver(cache)

    await loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true })

    expect(keysAbout(cache, 'rut').length).toBeGreaterThan(0)
    expect(keysAbout(cache, 'jon').length).toBeGreaterThan(0)
    expect(cache.store.has(`resource:${RESOURCE}`)).toBe(true)
  })
})
