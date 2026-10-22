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
  async function runCompleteDownload(door43Client: unknown) {
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
    spies.push(
      spyOn(LoaderRegistry.prototype, 'getLoaderForResource').mockReturnValue({
        downloadResource: async () => {},
      } as never),
      spyOn(ResourceCompletenessChecker.prototype, 'markCompleteIfVerified').mockResolvedValue(true)
    )
    const messages: DownloadThreadMessage[] = []
    await runDownload({
      resourceKeys: [KEY],
      skipExisting: false,
      runId: 1,
      post: (m) => messages.push(m),
      isCurrentRun: () => true,
      cacheAdapter: memoryStore() as never,
      catalogAdapter: catalog as never,
      door43Client,
    })
    return { row: catalog.rows.get(KEY) as any, messages }
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

  test('a failing tree request leaves the download complete and the row unchanged', async () => {
    const { row, messages } = await runCompleteDownload({
      fetchRepoTreeBlobs: async () => {
        throw new Error('Door43 unreachable')
      },
    })
    expect(row.contentMetadata.bookBlobs).toBeUndefined()
    expect(row.contentMetadata.bookBlobsRef).toBeUndefined()
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
