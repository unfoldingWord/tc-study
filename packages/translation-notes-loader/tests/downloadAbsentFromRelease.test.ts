import { describe, expect, test } from 'bun:test'
import JSZip from 'jszip'
import { TranslationNotesLoader } from '../src/TranslationNotesLoader'

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

function metadata(
  ingredients = [
    { identifier: 'tit', path: './tn_TIT.tsv' },
    { identifier: 'frt', path: './tn_FRT.tsv' },
  ]
) {
  return {
    resourceKey: 'unfoldingWord/en/tn',
    subject: 'TSV Translation Notes',
    type: 'notes',
    language: 'en',
    resourceId: 'tn',
    release: {
      zipball_url: 'https://git.door43.org/unfoldingWord/en_tn/archive/v86.zip',
      tag_name: 'v86',
    },
    contentMetadata: { ingredients },
  }
}

async function zipWithTitOnly(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file(
    'en_tn/tn_TIT.tsv',
    'Reference\tID\tTags\tSupportReference\tQuote\tOccurrence\tNote\n1:1\tabc\t\trc://*/ta/man/translate/figs-explicit\tPaul\t1\tA note\n'
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('TranslationNotesLoader absentFromRelease', () => {
  test('skips zip when only incomplete books are absent from the release tree', async () => {
    const resourceKey = 'unfoldingWord/en/tn'
    const cache = createCache({
      [`tn:${resourceKey}:tit`]: { notes: [{ Reference: '1:1' }] },
    })
    const catalogStore = new Map<string, unknown>([[resourceKey, metadata()]])
    let zipCalls = 0
    const loader = new TranslationNotesLoader({
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
          return new Set(['tn_TIT.tsv'])
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

  test('skips zip entirely when every book is already cached', async () => {
    const resourceKey = 'unfoldingWord/en/tn'
    const cache = createCache({
      [`tn:${resourceKey}:tit`]: { notes: [{ Reference: '1:1' }] },
      [`tn:${resourceKey}:frt`]: { notes: [{ Reference: '1:1' }] },
    })
    let zipCalls = 0
    let treeCalls = 0
    const loader = new TranslationNotesLoader({
      cacheAdapter: cache,
      catalogAdapter: {
        get: async () => metadata(),
        set: async () => {},
      },
      door43Client: {
        async downloadZipball() {
          zipCalls += 1
          return zipWithTitOnly()
        },
        async fetchRepoTreePaths() {
          treeCalls += 1
          return new Set(['tn_TIT.tsv'])
        },
      },
      debug: false,
    })

    await loader.downloadResource(resourceKey, { method: 'zip', skipExisting: true })

    expect(zipCalls).toBe(0)
    expect(treeCalls).toBe(0)
    const receipt = cache.store.get(`resource:${resourceKey}`) as {
      metadata: Record<string, unknown>
    }
    expect(receipt.metadata.downloadComplete).toBe(true)
  })

  test('zip extract does not treat missing-from-zip books as failedBooks', async () => {
    const resourceKey = 'unfoldingWord/en/tn'
    const cache = createCache()
    const catalogMeta = metadata()
    let zipCalls = 0
    const loader = new TranslationNotesLoader({
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
    expect(cache.store.has(`tn:${resourceKey}:tit`)).toBe(true)
  })

  test('partial cache fills remaining books individually without zip', async () => {
    const resourceKey = 'unfoldingWord/en/tn'
    const cache = createCache({
      [`tn:${resourceKey}:tit`]: { notes: [{ Reference: '1:1' }] },
    })
    const progress: Array<{ loaded?: number; message?: string; percentage?: number }> = []
    const ingredients = [
      { identifier: 'tit', path: './tn_TIT.tsv' },
      { identifier: 'mrk', path: './tn_MRK.tsv' },
      { identifier: 'frt', path: './tn_FRT.tsv' },
    ]
    let zipCalls = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('tn_MRK')) {
        return new Response(
          'Reference\tID\tTags\tSupportReference\tQuote\tOccurrence\tNote\n1:1\tabc\t\trc://*/ta/man/translate/figs-explicit\tPaul\t1\tA note\n',
          { status: 200 }
        )
      }
      return new Response('', { status: 404 })
    }) as typeof fetch

    try {
      const loader = new TranslationNotesLoader({
        cacheAdapter: cache,
        catalogAdapter: {
          get: async () => metadata(ingredients),
          set: async () => {},
        },
        door43Client: {
          async downloadZipball() {
            zipCalls += 1
            return zipWithTitOnly()
          },
          async fetchRepoTreePaths() {
            return new Set(['tn_TIT.tsv', 'tn_MRK.tsv'])
          },
        },
        debug: false,
      })

      await loader.downloadResource(
        resourceKey,
        { method: 'zip', skipExisting: true },
        (p) => progress.push({ loaded: p.loaded, message: p.message, percentage: p.percentage })
      )

      expect(zipCalls).toBe(0)
      expect(cache.store.has(`tn:${resourceKey}:mrk`)).toBe(true)
      const cachedSeed = progress.find((p) => p.message === 'Cached 1')
      expect(cachedSeed?.loaded).toBe(1)
      const receipt = cache.store.get(`resource:${resourceKey}`) as {
        metadata: Record<string, unknown>
        content: { failedBooks?: string[] }
      }
      expect(receipt.metadata.downloadComplete).toBe(true)
      expect(receipt.metadata.absentFromRelease).toEqual(['frt'])
      expect(receipt.content.failedBooks).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
