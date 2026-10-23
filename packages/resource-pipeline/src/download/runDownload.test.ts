import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { LoaderRegistry } from '../loaders/LoaderRegistry'
import { ResourceCompletenessChecker } from './ResourceCompletenessChecker'
import { runDownload, type DownloadThreadMessage } from './runDownload'

function memoryStore() {
  const rows = new Map<string, unknown>()
  return {
    rows,
    async get(key: string) {
      return rows.get(key) ?? null
    },
    async set(key: string, entry: unknown) {
      rows.set(key, entry)
    },
    async delete(key: string) {
      rows.delete(key)
    },
    async has(key: string) {
      return rows.has(key)
    },
    async getAll() {
      return [...rows.keys()]
    },
    async clear() {
      rows.clear()
    },
  }
}

describe('runDownload sin pantalla', () => {
  test('arma el catálogo y los cargadores con los almacenes que recibe y avisa el principio y el fin', async () => {
    const messages: DownloadThreadMessage[] = []
    await runDownload({
      resourceKeys: [],
      skipExisting: true,
      runId: 7,
      post: (m) => messages.push(m),
      isCurrentRun: () => true,
      cacheAdapter: memoryStore() as never,
      catalogAdapter: memoryStore() as never,
      door43Client: {},
    })
    expect(messages.map((m) => m.type)).toEqual(['queue-updated', 'complete'])
    expect(messages.every((m) => m.runId === 7)).toBe(true)
  })

  test('un recurso que el catálogo no conoce se salta sin escribir nada', async () => {
    const cache = memoryStore()
    const messages: DownloadThreadMessage[] = []
    await runDownload({
      resourceKeys: ['nadie/xx/tn'],
      skipExisting: true,
      runId: 1,
      post: (m) => messages.push(m),
      isCurrentRun: () => true,
      cacheAdapter: cache as never,
      catalogAdapter: memoryStore() as never,
      door43Client: { getResourceMetadata: async () => null },
    })
    expect(messages.map((m) => m.type)).toEqual(['queue-updated', 'complete'])
    expect(cache.rows.size).toBe(0)
  })
})

describe('runDownload records the book blobs', () => {
  const KEY = 'unfoldingWord/en/tn'
  const SHA = '0123456789abcdef0123456789abcdef01234567'
  const spies: Array<{ mockRestore(): void }> = []
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
  })

  /** A catalog row of a book-scoped resource at release v91, and a run whose loader and completeness check succeed. */
  async function runCompleteDownload(door43Client: unknown, options: { skipExisting?: boolean } = {}) {
    const catalog = memoryStore()
    catalog.rows.set(KEY, {
      resourceKey: KEY,
      owner: 'unfoldingWord',
      language: 'en',
      resourceId: 'tn',
      type: 'notes',
      release: { tag_name: 'v91' },
      locations: [{ path: 'https://git.door43.org/unfoldingWord/en_tn' }],
      contentMetadata: { ingredients: [{ identifier: 'rut', path: './tn_RUT.tsv' }] },
    })
    const before = structuredClone(catalog.rows.get(KEY))
    const downloaded: string[] = []
    spies.push(
      spyOn(LoaderRegistry.prototype, 'getLoaderForResource').mockReturnValue({
        downloadResource: async (key: string) => {
          downloaded.push(key)
        },
      } as never),
      spyOn(ResourceCompletenessChecker.prototype, 'markCompleteIfVerified').mockResolvedValue(true),
      spyOn(ResourceCompletenessChecker.prototype, 'checkResource').mockResolvedValue({ isComplete: true } as never)
    )
    const messages: DownloadThreadMessage[] = []
    await runDownload({
      resourceKeys: [KEY],
      skipExisting: options.skipExisting ?? false,
      runId: 1,
      post: (m) => messages.push(m),
      isCurrentRun: () => true,
      cacheAdapter: memoryStore() as never,
      catalogAdapter: catalog as never,
      door43Client,
    })
    return { row: catalog.rows.get(KEY) as any, before, downloaded, messages }
  }

  test('a completed download records the book blobs of a book-scoped resource', async () => {
    const asked: string[][] = []
    const { row, messages } = await runCompleteDownload({
      fetchRepoTreeBlobs: async (owner: string, repo: string, ref: string) => {
        asked.push([owner, repo, ref])
        return new Map([['tn_RUT.tsv', SHA]])
      },
    })
    expect(asked).toEqual([['unfoldingWord', 'en_tn', 'v91']])
    expect(row.contentMetadata.bookBlobs).toEqual({ rut: SHA })
    expect(row.contentMetadata.bookBlobsRef).toBe('v91')
    expect(messages.map((m) => m.type)).toContain('resource-complete')
  })

  test('an already-complete resource (skipExisting) gets its book blobs recorded without a download', async () => {
    const { row, downloaded } = await runCompleteDownload(
      { fetchRepoTreeBlobs: async () => new Map([['tn_RUT.tsv', SHA]]) },
      { skipExisting: true }
    )
    expect(downloaded).toEqual([])
    expect(row.contentMetadata.bookBlobs).toEqual({ rut: SHA })
    expect(row.contentMetadata.bookBlobsRef).toBe('v91')
  })

  test('a failing tree request leaves the download complete and the row unchanged', async () => {
    const { row, before, messages } = await runCompleteDownload({
      fetchRepoTreeBlobs: async () => {
        throw new Error('Door43 unreachable')
      },
    })
    expect(row).toEqual(before)
    const types = messages.map((m) => m.type)
    expect(types).toContain('resource-complete')
    expect(types).not.toContain('error')
    const done = messages.find((m) => m.type === 'complete')!.payload as { failedResources: number }
    expect(done.failedResources).toBe(0)
  })

  test('a download that did not verify as complete records nothing', async () => {
    let asked = 0
    const catalog = memoryStore()
    catalog.rows.set(KEY, {
      owner: 'unfoldingWord',
      language: 'en',
      resourceId: 'tn',
      type: 'notes',
      release: { tag_name: 'v91' },
      contentMetadata: { ingredients: [{ identifier: 'rut', path: './tn_RUT.tsv' }] },
    })
    spies.push(
      spyOn(LoaderRegistry.prototype, 'getLoaderForResource').mockReturnValue({
        downloadResource: async () => {},
      } as never),
      spyOn(ResourceCompletenessChecker.prototype, 'markCompleteIfVerified').mockResolvedValue(false)
    )
    await runDownload({
      resourceKeys: [KEY],
      skipExisting: false,
      runId: 1,
      post: () => {},
      isCurrentRun: () => true,
      cacheAdapter: memoryStore() as never,
      catalogAdapter: catalog as never,
      door43Client: {
        fetchRepoTreeBlobs: async () => {
          asked += 1
          return new Map([['tn_RUT.tsv', SHA]])
        },
      },
    })
    expect(asked).toBe(0)
    expect((catalog.rows.get(KEY) as any).contentMetadata.bookBlobs).toBeUndefined()
  })
})

describe('runDownload one book at a time', () => {
  const KEY = 'unfoldingWord/en/tn'
  const spies: Array<{ mockRestore(): void }> = []
  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore()
  })

  async function runBooks(downloadResource: (key: string, options: unknown) => Promise<void>) {
    const catalog = memoryStore()
    catalog.rows.set(KEY, {
      resourceKey: KEY,
      owner: 'unfoldingWord',
      language: 'en',
      resourceId: 'tn',
      type: 'notes',
      release: { tag_name: 'v91', zipball_url: 'https://git.door43.org/unfoldingWord/en_tn/archive/v91.zip' },
      contentMetadata: { ingredients: [{ identifier: 'rut', path: './tn_RUT.tsv' }] },
    })
    const before = structuredClone(catalog.rows.get(KEY))
    const cache = memoryStore()
    const checks = { check: 0, verify: 0, trees: 0 }
    spies.push(
      spyOn(LoaderRegistry.prototype, 'getLoaderForResource').mockReturnValue({ downloadResource } as never),
      spyOn(ResourceCompletenessChecker.prototype, 'checkResource').mockImplementation(async () => {
        checks.check += 1
        return { isComplete: true } as never
      }),
      spyOn(ResourceCompletenessChecker.prototype, 'markCompleteIfVerified').mockImplementation(async () => {
        checks.verify += 1
        return true
      })
    )
    const messages: DownloadThreadMessage[] = []
    await runDownload({
      resourceKeys: [KEY],
      skipExisting: true,
      books: ['rut'],
      runId: 1,
      post: (m) => messages.push(m),
      isCurrentRun: () => true,
      cacheAdapter: cache as never,
      catalogAdapter: catalog as never,
      door43Client: {
        fetchRepoTreeBlobs: async () => {
          checks.trees += 1
          return new Map()
        },
      },
    })
    return { cache, catalog, before, checks, messages }
  }

  test('passes the books to the loader and leaves the receipt and the catalog row to the caller', async () => {
    const asked: unknown[] = []
    const { cache, catalog, before, checks, messages } = await runBooks(async (_key, options) => {
      asked.push(options)
    })

    expect(asked).toEqual([{ method: 'zip', skipExisting: true, books: ['rut'] }])
    // Not "already complete" (that would skip the book) and not marked complete (one book is not the resource).
    expect(checks).toEqual({ check: 0, verify: 0, trees: 0 })
    expect(cache.rows.size).toBe(0)
    expect(catalog.rows.get(KEY)).toEqual(before)
    expect(messages.map((m) => m.type)).toContain('resource-complete')
  })

  test('a book that fails is reported, without an error receipt in the book’s database', async () => {
    const { cache, messages } = await runBooks(async () => {
      throw new Error(`${KEY}: rut could not be processed`)
    })

    expect(cache.rows.size).toBe(0)
    const error = messages.find((m) => m.type === 'error')
    expect(error?.payload).toEqual({ resourceKey: KEY, error: `${KEY}: rut could not be processed` })
    const done = messages.find((m) => m.type === 'complete')!.payload as { failedResources: number }
    expect(done.failedResources).toBe(1)
  })
})
