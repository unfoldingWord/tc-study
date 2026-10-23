import { describe, expect, test } from 'bun:test'
import { CatalogManager } from '@bt-synergy/catalog-manager/core'
import { BackgroundDownloadManager } from './BackgroundDownloadManager'
import { recordBlobsAfterComplete } from './recordBlobsAfterComplete'

const KEY = 'unfoldingWord/en/tn'
const SHA = '0123456789abcdef0123456789abcdef01234567'

function row() {
  return {
    resourceKey: KEY,
    owner: 'unfoldingWord',
    language: 'en',
    resourceId: 'tn',
    type: 'notes',
    release: { tag_name: 'v91' },
    locations: [{ path: 'https://git.door43.org/unfoldingWord/en_tn' }],
    contentMetadata: { ingredients: [{ identifier: 'rut', path: './tn_RUT.tsv' }] },
  }
}

function catalogStore() {
  const rows = new Map<string, unknown>([[KEY, row()]])
  return {
    rows,
    async get(key: string) {
      return rows.get(key) ?? null
    },
    async set(key: string, value: unknown) {
      rows.set(key, value)
    },
  }
}

function treeClient() {
  const asked: string[][] = []
  return {
    asked,
    fetchRepoTreeBlobs: async (owner: string, repo: string, ref: string) => {
      asked.push([owner, repo, ref])
      return new Map([['tn_RUT.tsv', SHA]])
    },
  }
}

describe('recordBlobsAfterComplete', () => {
  test('a complete resource gets its book blobs recorded', async () => {
    const catalog = catalogStore()
    const client = treeClient()
    const outcome = await recordBlobsAfterComplete({
      complete: true,
      door43Client: client,
      catalogAdapter: catalog,
      resourceKey: KEY,
    })
    expect(outcome).toBe('recorded')
    expect((catalog.rows.get(KEY) as any).contentMetadata.bookBlobs).toEqual({ rut: SHA })
  })

  test('a resource that is not complete is left alone and Door43 is not asked', async () => {
    const catalog = catalogStore()
    const client = treeClient()
    const before = structuredClone(catalog.rows.get(KEY))
    const outcome = await recordBlobsAfterComplete({
      complete: false,
      door43Client: client,
      catalogAdapter: catalog,
      resourceKey: KEY,
    })
    expect(outcome).toBe('incomplete')
    expect(client.asked).toEqual([])
    expect(catalog.rows.get(KEY)).toEqual(before)
  })
})

describe('BackgroundDownloadManager records the book blobs once a download is verified', () => {
  async function download(verified: boolean) {
    const catalog = catalogStore()
    const client = treeClient()
    const catalogManager = {
      catalogAdapter: catalog,
      door43Client: client,
      getResourceMetadata: async (key: string) => catalog.rows.get(key),
    }
    const loaderRegistry = { getLoaderForResource: () => ({ downloadResource: async () => {} }) }
    const checker = {
      markCompleteIfVerified: async () => verified,
      markError: async () => {},
    }
    const manager = new BackgroundDownloadManager(
      loaderRegistry as never,
      catalogManager as never,
      { get: () => undefined },
      { debug: false },
      checker as never
    )
    ;(manager as any).tasks.set(KEY, { resourceKey: KEY, priority: 1, status: 'pending', progress: 0 })
    await manager.downloadResource(KEY)
    return { row: catalog.rows.get(KEY) as any, client }
  }

  test('a verified completion records', async () => {
    const { row, client } = await download(true)
    expect(client.asked).toEqual([['unfoldingWord', 'en_tn', 'v91']])
    expect(row.contentMetadata.bookBlobs).toEqual({ rut: SHA })
    expect(row.contentMetadata.bookBlobsRef).toBe('v91')
  })

  test('an unverified completion does not', async () => {
    const { row, client } = await download(false)
    expect(client.asked).toEqual([])
    expect(row.contentMetadata.bookBlobs).toBeUndefined()
  })
})

describe('CatalogManager.downloadResource (wizard and library) records the book blobs', () => {
  test('after the loader finishes', async () => {
    const catalog = catalogStore()
    const client = treeClient()
    const manager = new CatalogManager({
      catalogAdapter: catalog as never,
      cacheAdapter: {} as never,
      door43Client: client,
    } as never)
    manager.registerResourceType({
      resourceType: 'notes',
      canHandle: () => true,
      downloadResource: async () => {},
    } as never)
    await manager.downloadResource(KEY, { method: 'zip' })
    expect((catalog.rows.get(KEY) as any).contentMetadata.bookBlobs).toEqual({ rut: SHA })
  })

  test('not when the loader fails', async () => {
    const catalog = catalogStore()
    const client = treeClient()
    const manager = new CatalogManager({
      catalogAdapter: catalog as never,
      cacheAdapter: {} as never,
      door43Client: client,
    } as never)
    manager.registerResourceType({
      resourceType: 'notes',
      canHandle: () => true,
      downloadResource: async () => {
        throw new Error('boom')
      },
    } as never)
    await expect(manager.downloadResource(KEY)).rejects.toThrow('boom')
    expect(client.asked).toEqual([])
  })
})
