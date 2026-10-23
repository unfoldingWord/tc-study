import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import { TranslationNotesLoader } from '../src/TranslationNotesLoader'

const RESOURCE = 'unfoldingWord/en/tn'
const HEADER = 'Reference\tID\tTags\tSupportReference\tQuote\tOccurrence\tNote\n'

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
    subject: 'TSV Translation Notes',
    type: 'notes',
    language: 'en',
    resourceId: 'tn',
    release: { zipball_url: 'https://git.door43.org/unfoldingWord/en_tn/archive/v86.zip', tag_name: 'v86' },
    contentMetadata: {
      ingredients: [
        { identifier: 'rut', path: './tn_RUT.tsv' },
        { identifier: 'jon', path: './tn_JON.tsv' },
      ],
    },
  }
}

async function zipWithRuthAndJonah(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('en_tn/tn_RUT.tsv', `${HEADER}1:1\tabc\t\t\tNaomi\t1\tA note on Ruth\n`)
  zip.file('en_tn/tn_JON.tsv', `${HEADER}1:1\tdef\t\t\tJonah\t1\tA note on Jonah\n`)
  return zip.generateAsync({ type: 'arraybuffer' })
}

function loaderOver(cache: ReturnType<typeof createCache>) {
  const catalogWrites: string[] = []
  const loader = new TranslationNotesLoader({
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
        return new Set(['tn_RUT.tsv', 'tn_JON.tsv'])
      },
    },
    debug: false,
  })
  return { loader, catalogWrites }
}

describe('TranslationNotesLoader with books', () => {
  test('writes only the asked book and no receipt', async () => {
    const cache = createCache()
    const { loader, catalogWrites } = loaderOver(cache)

    await loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true, books: ['RUT'] })

    expect([...cache.store.keys()]).toEqual([`tn:${RESOURCE}:rut`])
    expect(catalogWrites).toEqual([])
  })

  test('a book the receipt lists as absent from the release stays out even when asked and in the zip', async () => {
    const prior = { content: {}, metadata: { absentFromRelease: ['JON'] } }
    const cache = createCache({ [`resource:${RESOURCE}`]: prior })
    const { loader } = loaderOver(cache)

    await loader.downloadResource(RESOURCE, { method: 'zip', skipExisting: true, books: ['rut', 'jon'] })

    expect([...cache.store.keys()].sort()).toEqual([`resource:${RESOURCE}`, `tn:${RESOURCE}:rut`])
    expect(cache.store.get(`resource:${RESOURCE}`)).toBe(prior)
  })

  test('a book that fails is an error, since no receipt will remember it', async () => {
    const cache = createCache({}, `tn:${RESOURCE}:rut`)
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
      `tn:${RESOURCE}:jon`,
      `tn:${RESOURCE}:rut`,
    ])
  })
})
