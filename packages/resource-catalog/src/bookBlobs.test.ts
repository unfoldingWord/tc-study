import { describe, expect, test } from 'bun:test'
import { bookBlobsFromTree, recordBookBlobs } from './bookBlobs'
import { bookContentStamp, resourceContentStamp } from './ingestReceipt'

const RUT_SHA = '3d230a0aca1f9e2b7c4d5e6f708192a3b4c5d6e7'
const GEN_SHA = '9f8e7d6c5b4a39281706f5e4d3c2b1a099887766'

describe('bookBlobsFromTree', () => {
  test('maps each ingredient to the sha of its file, leaving out books absent from the tree', () => {
    const tree = new Map([
      ['tn_RUT.tsv', RUT_SHA],
      ['08-RUT.usfm', 'ffff'],
    ])
    const blobs = bookBlobsFromTree(tree, [
      { identifier: 'rut', path: './tn_RUT.tsv' },
      { identifier: 'gen', path: 'tn_GEN.tsv' },
    ])
    expect(blobs).toEqual({ rut: RUT_SHA })
  })

  test('stores the identifier lowercase and skips ingredients without an identifier', () => {
    const tree = new Map([['tn_RUT.tsv', RUT_SHA]])
    expect(
      bookBlobsFromTree(tree, [{ identifier: 'RUT', path: 'tn_RUT.tsv' }, { path: 'tn_RUT.tsv' }])
    ).toEqual({ rut: RUT_SHA })
  })

  test('a blob whose tree entry had no sha (empty) counts as no blob', () => {
    const tree = new Map([
      ['tn_RUT.tsv', ''],
      ['tn_GEN.tsv', GEN_SHA],
    ])
    const blobs = bookBlobsFromTree(tree, [
      { identifier: 'rut', path: 'tn_RUT.tsv' },
      { identifier: 'gen', path: 'tn_GEN.tsv' },
    ])
    expect(blobs).toEqual({ gen: GEN_SHA })
  })
})

function row(overrides: Record<string, unknown> = {}) {
  return {
    release: { tag_name: 'v66', published_at: '2026-01-01T00:00:00Z' },
    contentMetadata: { bookBlobs: { rut: RUT_SHA }, bookBlobsRef: 'v66' },
    ...overrides,
  }
}

describe('bookContentStamp', () => {
  test('is g + the first ten hex characters of the book blob when it was read at the row release', () => {
    expect(bookContentStamp(row(), 'rut')).toBe('g3d230a0aca')
  })

  test('falls back to the release stamp for a book with no blob', () => {
    expect(bookContentStamp(row(), 'gen')).toBe(resourceContentStamp(row()))
  })

  test('falls back to the release stamp when the blobs were read at an older tag', () => {
    const old = row({ contentMetadata: { bookBlobs: { rut: RUT_SHA }, bookBlobsRef: 'v65' } })
    expect(bookContentStamp(old, 'rut')).toBe(resourceContentStamp(old))
  })

  test('compares the book code case-insensitively', () => {
    expect(bookContentStamp(row(), 'RUT')).toBe('g3d230a0aca')
  })

  test('falls back for an old row without blobs, and for no row', () => {
    const bare = { release: { tag_name: 'v66', published_at: '2026-01-01T00:00:00Z' } }
    expect(bookContentStamp(bare, 'rut')).toBe(resourceContentStamp(bare))
    expect(bookContentStamp(null, 'rut')).toBe('nostamp')
  })
})

function adapterWith(initial: unknown) {
  const store = new Map<string, unknown>([['a/es/tn', initial]])
  let writes = 0
  return {
    store,
    get writes() {
      return writes
    },
    get: async (key: string) => store.get(key),
    set: async (key: string, value: unknown) => {
      writes++
      store.set(key, value)
    },
  }
}

function tnRow(extra: Record<string, unknown> = {}) {
  return {
    resourceKey: 'a/es/tn',
    owner: 'a',
    language: 'es',
    resourceId: 'tn',
    release: { tag_name: 'v66', published_at: '2026-01-01T00:00:00Z' },
    contentMetadata: {
      ingredients: [{ identifier: 'rut', path: './tn_RUT.tsv' }],
      books: ['rut'],
      ...extra,
    },
  }
}

describe('recordBookBlobs', () => {
  test('writes the blobs once, then reports current without asking for the tree again', async () => {
    const catalogAdapter = adapterWith(tnRow())
    let treeCalls = 0
    const door43Client = {
      fetchRepoTreeBlobs: async (owner: string, repo: string, ref: string) => {
        treeCalls++
        expect([owner, repo, ref]).toEqual(['a', 'es_tn', 'v66'])
        return new Map([['tn_RUT.tsv', RUT_SHA]])
      },
    }
    const o = { door43Client, catalogAdapter, resourceKey: 'a/es/tn' }

    expect(await recordBookBlobs(o)).toBe('recorded')
    const written = catalogAdapter.store.get('a/es/tn') as any
    expect(written.contentMetadata.bookBlobs).toEqual({ rut: RUT_SHA })
    expect(written.contentMetadata.bookBlobsRef).toBe('v66')
    expect(written.contentMetadata.books).toEqual(['rut'])

    expect(await recordBookBlobs(o)).toBe('current')
    expect(treeCalls).toBe(1)
    expect(catalogAdapter.writes).toBe(1)
  })

  test('skips, leaving the row untouched, when the tree request throws', async () => {
    const initial = tnRow()
    const catalogAdapter = adapterWith(initial)
    const door43Client = {
      fetchRepoTreeBlobs: async () => {
        throw new Error('offline')
      },
    }
    expect(await recordBookBlobs({ door43Client, catalogAdapter, resourceKey: 'a/es/tn' })).toBe('skipped')
    expect(catalogAdapter.writes).toBe(0)
    expect(catalogAdapter.store.get('a/es/tn')).toBe(initial)
  })

  test('skips with no client, with no ingredients, or when no ingredient has a blob', async () => {
    const withTree = { fetchRepoTreeBlobs: async () => new Map([['tn_RUT.tsv', RUT_SHA]]) }
    const a = adapterWith(tnRow())
    expect(await recordBookBlobs({ door43Client: null, catalogAdapter: a, resourceKey: 'a/es/tn' })).toBe('skipped')
    expect(await recordBookBlobs({ door43Client: {}, catalogAdapter: a, resourceKey: 'a/es/tn' })).toBe('skipped')

    const none = adapterWith({ ...tnRow(), contentMetadata: {} })
    expect(await recordBookBlobs({ door43Client: withTree, catalogAdapter: none, resourceKey: 'a/es/tn' })).toBe('skipped')

    const empty = { fetchRepoTreeBlobs: async () => new Map<string, string>() }
    expect(await recordBookBlobs({ door43Client: empty, catalogAdapter: a, resourceKey: 'a/es/tn' })).toBe('skipped')
    expect(a.writes).toBe(0)
  })

  test('keeps a catalog write that lands during the tree fetch', async () => {
    const catalogAdapter = adapterWith(tnRow())
    const door43Client = {
      fetchRepoTreeBlobs: async () => {
        // A download records progress on the row while the tree is being fetched
        const live = catalogAdapter.store.get('a/es/tn') as any
        catalogAdapter.store.set('a/es/tn', {
          ...live,
          contentMetadata: { ...live.contentMetadata, downloadedIngredients: ['rut'] },
        })
        return new Map([['tn_RUT.tsv', RUT_SHA]])
      },
    }

    expect(await recordBookBlobs({ door43Client, catalogAdapter, resourceKey: 'a/es/tn' })).toBe('recorded')
    const written = catalogAdapter.store.get('a/es/tn') as any
    expect(written.contentMetadata.downloadedIngredients).toEqual(['rut'])
    expect(written.contentMetadata.bookBlobs).toEqual({ rut: RUT_SHA })
    expect(written.contentMetadata.bookBlobsRef).toBe('v66')
  })

  test('skips, leaving the row untouched, when the release tag changes during the tree fetch', async () => {
    const catalogAdapter = adapterWith(tnRow())
    let newer: unknown
    const door43Client = {
      fetchRepoTreeBlobs: async () => {
        newer = { ...tnRow(), release: { tag_name: 'v67', published_at: '2026-02-01T00:00:00Z' } }
        catalogAdapter.store.set('a/es/tn', newer)
        return new Map([['tn_RUT.tsv', RUT_SHA]])
      },
    }

    expect(await recordBookBlobs({ door43Client, catalogAdapter, resourceKey: 'a/es/tn' })).toBe('skipped')
    expect(catalogAdapter.writes).toBe(0)
    expect(catalogAdapter.store.get('a/es/tn')).toBe(newer)
  })

  test('skips when the row disappears during the tree fetch', async () => {
    const catalogAdapter = adapterWith(tnRow())
    const door43Client = {
      fetchRepoTreeBlobs: async () => {
        catalogAdapter.store.delete('a/es/tn')
        return new Map([['tn_RUT.tsv', RUT_SHA]])
      },
    }

    expect(await recordBookBlobs({ door43Client, catalogAdapter, resourceKey: 'a/es/tn' })).toBe('skipped')
    expect(catalogAdapter.writes).toBe(0)
  })
})
