import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import { TranslationWordsLinksLoader } from '../src/TranslationWordsLinksLoader'

const RESOURCE = 'unfoldingWord/en/twl'
const HEADER = 'Reference\tID\tTags\tOrigWords\tOccurrence\tTWLink\n'

function createCache(initial: Record<string, unknown> = {}, failOn?: string) {
  const store = new Map<string, unknown>(Object.entries(initial))
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      if (key === failOn) throw new Error(`disk full writing ${key}`)
      store.set(key, entry)
    },
  }
}

function metadata() {
  return {
    resourceKey: RESOURCE,
    subject: 'TSV Translation Words Links',
    type: 'words-links',
    language: 'en',
    resourceId: 'twl',
    release: { zipball_url: 'https://git.door43.org/unfoldingWord/en_twl/archive/v85.zip', tag_name: 'v85' },
    contentMetadata: {
      ingredients: [
        { identifier: 'rut', path: './twl_RUT.tsv' },
        { identifier: 'jon', path: './twl_JON.tsv' },
      ],
    },
  }
}

async function zipWithRuthAndJonah(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('en_twl/twl_RUT.tsv', `${HEADER}1:1\tabc\t\tNaomi\t1\trc://*/tw/dict/bible/names/naomi\n`)
  zip.file('en_twl/twl_JON.tsv', `${HEADER}1:1\tdef\t\tJonah\t1\trc://*/tw/dict/bible/names/jonah\n`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

function loaderOver(cache: ReturnType<typeof createCache>) {
  const catalogWrites: string[] = []
  const loader = new TranslationWordsLinksLoader({
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
        return new Set(['twl_RUT.tsv', 'twl_JON.tsv'])
      },
    },
    debug: false,
  })
  return { loader, catalogWrites }
}

describe('TranslationWordsLinksLoader with books', () => {
  test('writes only the asked book and no receipt', async () => {
    const cache = createCache()
    const { loader, catalogWrites } = loaderOver(cache)

    await loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true, books: ['RUT'] })

    expect([...cache.store.keys()]).toEqual([`twl:${RESOURCE}:rut`])
    expect(catalogWrites).toEqual([])
  })

  test('a book the receipt lists as absent from the release stays out even when asked and in the zip', async () => {
    const prior = { content: {}, metadata: { absentFromRelease: ['JON'] } }
    const cache = createCache({ [`resource:${RESOURCE}`]: prior })
    const { loader } = loaderOver(cache)

    await loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true, books: ['rut', 'jon'] })

    expect([...cache.store.keys()].sort()).toEqual([`resource:${RESOURCE}`, `twl:${RESOURCE}:rut`])
    expect(cache.store.get(`resource:${RESOURCE}`)).toBe(prior)
  })

  test('a book that fails is an error, since no receipt will remember it', async () => {
    const cache = createCache({}, `twl:${RESOURCE}:rut`)
    const { loader } = loaderOver(cache)

    await expect(
      loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true, books: ['rut'] })
    ).rejects.toThrow(/rut/)
    expect(cache.store.has(`resource:${RESOURCE}`)).toBe(false)
  })

  test('without books, every book and the receipt are written as before', async () => {
    const cache = createCache()
    const { loader } = loaderOver(cache)

    await loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true })

    expect([...cache.store.keys()].sort()).toEqual([
      `resource:${RESOURCE}`,
      `twl:${RESOURCE}:jon`,
      `twl:${RESOURCE}:rut`,
    ])
  })
})
