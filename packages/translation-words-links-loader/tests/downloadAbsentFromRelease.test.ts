import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import { TranslationWordsLinksLoader } from '../src/TranslationWordsLinksLoader'

function createCache(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial))
  return {
    store,
    async get(key: string) {
      return store.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      store.set(key, entry)
    },
  }
}

function metadata(ingredients = [
  { identifier: 'tit', path: './tit.tsv' },
  { identifier: 'frt', path: './frt.tsv' },
]) {
  return {
    resourceKey: 'unfoldingWord/en/twl',
    subject: 'TSV Translation Words Links',
    type: 'words-links',
    language: 'en',
    resourceId: 'twl',
    release: {
      zipball_url: 'https://git.door43.org/unfoldingWord/en_twl/archive/v85.zip',
      tag_name: 'v85',
    },
    contentMetadata: { ingredients },
  }
}

async function zipWithTitOnly(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file(
    'en_twl/tit.tsv',
    'Reference\tID\tTags\tOrigWords\tOccurrence\tTWLink\n1:1\tabc\t\tPaul\t1\trc://*/tw/dict/bible/names/paul\n'
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('TranslationWordsLinksLoader absentFromRelease', () => {
  test('skips zip when only incomplete books are absent from the release tree', async () => {
    const resourceKey = 'unfoldingWord/en/twl'
    const cache = createCache({
      [`twl:${resourceKey}:tit`]: { links: [{ Reference: '1:1' }] },
    })
    const catalogStore = new Map<string, unknown>([[resourceKey, metadata()]])
    let zipCalls = 0
    const loader = new TranslationWordsLinksLoader({
      cacheAdapter: cache,
      catalogAdapter: {
        get: async (key: string) => catalogStore.get(key) ?? null,
        set: async (key: string, entry: unknown) => {
          catalogStore.set(key, entry)
        },
      },
      door43Client: {
        async downloadZipball() {
          zipCalls += 1
          return zipWithTitOnly()
        },
        async fetchRepoTreePaths() {
          return new Set(['tit.tsv'])
        },
      },
      debug: false,
    })

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(zipCalls).toBe(0)
    const receipt = cache.store.get(`resource:${resourceKey}`) as {
      metadata: Record<string, unknown>
    }
    expect(receipt.metadata.downloadComplete).toBe(true)
    expect(receipt.metadata.absentFromRelease).toEqual(['frt'])
    const pruned = catalogStore.get(resourceKey) as {
      contentMetadata: { ingredients: Array<{ identifier: string }> }
    }
    expect(pruned.contentMetadata.ingredients.map((i) => i.identifier)).toEqual(['tit'])
  })

  test('zip extract does not treat missing-from-zip books as failedBooks', async () => {
    const resourceKey = 'unfoldingWord/en/twl'
    const cache = createCache()
    const catalogMeta = metadata()
    let zipCalls = 0
    const loader = new TranslationWordsLinksLoader({
      cacheAdapter: cache,
      catalogAdapter: {
        get: async () => catalogMeta,
        set: async () => {},
      },
      door43Client: {
        async downloadZipball() {
          zipCalls += 1
          return zipWithTitOnly()
        },
      },
      debug: false,
    })

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(zipCalls).toBe(1)
    const receipt = cache.store.get(`resource:${resourceKey}`) as {
      metadata: Record<string, unknown>
      content: { downloaded?: boolean; failedBooks?: string[] }
    }
    expect(receipt.metadata.downloadComplete).toBe(true)
    expect(receipt.content.failedBooks).toBeUndefined()
    expect(receipt.metadata.absentFromRelease).toEqual(['frt'])
    expect(cache.store.has(`twl:${resourceKey}:tit`)).toBe(true)
  })
})
