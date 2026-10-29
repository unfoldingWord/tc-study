import { describe, expect, it } from 'bun:test'
import { buildLanguagePack, type CacheRow, type PackSource } from '@bt-synergy/language-pack'
import {
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  resourceContentStamp,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { PACK_VERSIONS } from '@bt-synergy/resource-pipeline/language/packVersions'
import { openLanguagePacks, type PackStores } from './openLanguagePacks'

const GLT = 'es-419_gl/es-419/glt'
const TN = 'es-419_gl/es-419/tn'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'
const USJ = String(PACK_VERSIONS.sot.usjProcessing)

const release = (tag: string, at: string) => ({ tag_name: tag, published_at: at })
const META: Record<string, ResourceMetadata> = Object.fromEntries(
  (
    [
      [GLT, 'scripture', 'Bible', release('v42', '2026-08-11T12:22:03Z')],
      [TN, 'notes', 'TSV Translation Notes', release('v66', '2024-07-17T20:13:08Z')],
      [UGNT, 'scripture', 'Greek New Testament', release('v0.34', '2023-09-27T02:19:31Z')],
    ] as const
  ).map(([key, type, subject, rel]) => {
    const [owner, language, resourceId] = key.split('/')
    return [key, { resourceKey: key, owner, language, resourceId, type, subject, title: key, release: rel } as unknown as ResourceMetadata]
  })
)
const stamp = (key: string) => resourceContentStamp(META[key])
const receipt = (key: string): CacheRow => ({
  key: `resource:${key}`,
  entry: {
    content: {},
    metadata: {
      downloadComplete: true,
      releaseStamp: expectedIngestReleaseStamp(META[key]),
      ingestSchema: ingestSchemaForResourceType(String(META[key].type), USJ),
    },
  },
})
const row = (key: string): CacheRow => ({ key, entry: { content: key, timestamp: 1, version: 1 } })
const QUOTE = `helps-quote:${TN}@${stamp(TN)}:${UGNT}@${stamp(UGNT)}+${USJ}:tit:1`

/** A device that has es-419 Titus (text and notes, with quotes built on UGNT) and UGNT. */
const source: PackSource = (() => {
  const rows: CacheRow[] = [
    receipt(GLT),
    row(`scripture-usj:${GLT}:tit`),
    row(`scripture-usj:${GLT}:tit:1`),
    row(`prepared:scripture:${GLT}:tit:1:full`),
    receipt(TN),
    row(`tn:${TN}:tit`),
    row(`tn:${TN}:tit:1`),
    row(`prepared:notes:${TN}:tit:1:full`),
    row(QUOTE),
    receipt(UGNT),
    row(`scripture-usj:${UGNT}:tit:1`),
  ]
  return {
    rowsByPrefix: async (prefix) => rows.filter((r) => r.key.startsWith(prefix)),
    catalogRow: async (key) => META[key] ?? null,
    catalogRows: async () => Object.values(META),
  }
})()

const pack = async (name: string, params: Partial<Parameters<typeof buildLanguagePack>[0]> = {}) => {
  const built = await buildLanguagePack({ source, language: 'es-419', versions: PACK_VERSIONS, ...params })
  return { name, bytes: built.bytes }
}

/** The app's two stores, as `IndexedDBCacheAdapter` and `IndexedDBCatalogAdapter` answer. */
function device(catalogRows: Record<string, ResourceMetadata> = {}, cacheRows: CacheRow[] = []) {
  const rows = new Map<string, unknown>(cacheRows.map((r) => [r.key, r.entry]))
  const catalog = new Map<string, ResourceMetadata>(Object.entries(catalogRows))
  const catalogWrites: string[] = []
  const stores: PackStores = {
    cache: {
      getByPrefix: async (prefix) => [...rows].filter(([key]) => key.startsWith(prefix)).map(([key, entry]) => ({ key, entry })),
      putRawMany: async (list) => {
        for (const r of list) rows.set(r.key, r.entry)
      },
      hasRawKeys: async (keys) => new Set(keys.filter((key) => rows.has(key))),
      get: async (key) => (rows.get(key) ?? null) as never,
      delete: async (key) => {
        rows.delete(key)
      },
    },
    catalog: {
      get: async (key) => catalog.get(key) ?? null,
      getAll: async () => [...catalog.keys()],
      set: async (key, metadata) => {
        catalogWrites.push(key)
        catalog.set(key, metadata)
      },
    },
  }
  return { stores, rows, catalog, catalogWrites }
}

describe('openLanguagePacks', () => {
  it('opens a language pack into the app stores', async () => {
    const { stores, rows, catalog } = device()
    const [opened] = await openLanguagePacks(stores, [await pack('es-419.langpack.zip')])

    expect(opened.name).toBe('es-419.langpack.zip')
    if (!('result' in opened)) throw new Error(`refused: ${opened.refused}`)
    expect(opened.kind).toBe('language')
    expect([...catalog.keys()].sort()).toEqual([GLT, TN])
    expect(rows.has(`resource:${GLT}`)).toBe(true)
    expect(rows.has(`resource:${TN}`)).toBe(true)
    expect(rows.has(`scripture-usj:${GLT}:tit:1`)).toBe(true)
    expect(opened.result.byLayer.receipt).toBe(2)
    expect(opened.result.written).toBe(rows.size)
    expect(opened.result.originals).toEqual([{ key: UGNT, stamp: stamp(UGNT), status: 'missing' }])
  })

  it('opens the originals before the packs that need them', async () => {
    const { stores, catalogWrites } = device()
    const book = await pack('es-419-tit.langpack.zip', { kind: 'book', books: ['tit'] })
    const originals = await pack('originals.langpack.zip', { kind: 'originals', language: 'originals' })

    const opened = await openLanguagePacks(stores, [book, originals])

    expect(opened.map((o) => o.name)).toEqual(['originals.langpack.zip', 'es-419-tit.langpack.zip'])
    expect(catalogWrites[0]).toBe(UGNT)
    const bookResult = opened[1]
    if (!('result' in bookResult)) throw new Error(`refused: ${bookResult.refused}`)
    expect(bookResult.kind).toBe('book')
    expect(bookResult.result.originals.map((o) => o.status)).toEqual(['present'])
  })

  it('a book pack records the books it brought on each resource it brought, and two packs add up', async () => {
    const { stores, catalog } = device()
    const books = (key: string) => (catalog.get(key)?.contentMetadata as { downloadedIngredients?: string[] } | undefined)?.downloadedIngredients

    await openLanguagePacks(stores, [await pack('es-419-tit.langpack.zip', { kind: 'book', books: ['tit'] })])
    expect(books(GLT)).toEqual(['tit'])
    expect(books(TN)).toEqual(['tit'])

    const held = catalog.get(GLT)!
    catalog.set(GLT, { ...held, contentMetadata: { ...held.contentMetadata, downloadedIngredients: ['rut'] } } as ResourceMetadata)
    await openLanguagePacks(stores, [await pack('es-419-tit.langpack.zip', { kind: 'book', books: ['tit'] })])
    expect(books(GLT)).toEqual(['rut', 'tit'])
  })

  it('a language pack does not touch the books held: its receipt says the resource is complete', async () => {
    const { stores, catalog } = device()
    await openLanguagePacks(stores, [await pack('es-419.langpack.zip')])
    expect((catalog.get(GLT)?.contentMetadata as { downloadedIngredients?: string[] } | undefined)?.downloadedIngredients).toBeUndefined()
  })

  it('refuses a pack made with another source-text version and writes nothing', async () => {
    const { stores, rows, catalog } = device()
    const other = await pack('es-419.langpack.zip', {
      versions: { ...PACK_VERSIONS, sot: { usjProcessing: '1.0.0-usj' } },
    })

    const [opened] = await openLanguagePacks(stores, [other])

    expect(opened).toMatchObject({ name: 'es-419.langpack.zip', refused: 'other-version' })
    expect(rows.size).toBe(0)
    expect(catalog.size).toBe(0)
  })

  it('refuses a file that is not a pack and writes nothing', async () => {
    const { stores, rows, catalog } = device()
    const [opened] = await openLanguagePacks(stores, [{ name: 'photo.zip', bytes: new Uint8Array([1, 2, 3, 4]) }])

    expect(opened).toMatchObject({ name: 'photo.zip', refused: 'not-a-pack' })
    expect(rows.size).toBe(0)
    expect(catalog.size).toBe(0)
  })

  it('opens a pack with another quote version without its quote rows', async () => {
    const { stores, rows } = device()
    const other = await pack('es-419.langpack.zip', {
      versions: { ...PACK_VERSIONS, quote: { helpsQuote: Number(PACK_VERSIONS.quote.helpsQuote) + 1 } },
    })

    const [opened] = await openLanguagePacks(stores, [other])

    if (!('result' in opened)) throw new Error(`refused: ${opened.refused}`)
    expect(opened.result.skippedLayers).toEqual(['quote'])
    expect(rows.has(QUOTE)).toBe(false)
    expect(rows.has(`resource:${TN}`)).toBe(true)
  })

  it('replaces a failed-download marker with the pack receipt', async () => {
    const failed: CacheRow = {
      key: `resource:${GLT}`,
      entry: { content: {}, metadata: { downloadComplete: false, downloadError: 'Failed to fetch' } },
    }
    const { stores, rows } = device({ [GLT]: META[GLT] }, [failed])

    await openLanguagePacks(stores, [await pack('es-419.langpack.zip')])

    expect((rows.get(`resource:${GLT}`) as { metadata: { downloadComplete: boolean } }).metadata.downloadComplete).toBe(true)
  })

  it('reports progress of each pack', async () => {
    const { stores } = device()
    const seen: Array<{ name: string; done: number; total: number }> = []

    await openLanguagePacks(stores, [await pack('es-419.langpack.zip')], {
      onProgress: (p) => seen.push({ name: p.name, done: p.done, total: p.total }),
    })

    expect(seen.length).toBeGreaterThan(0)
    const last = seen[seen.length - 1]
    expect(last.name).toBe('es-419.langpack.zip')
    expect(last.done).toBe(last.total)
  })
})
