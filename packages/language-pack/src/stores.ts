/**
 * Wiring a pack to an app's stores. Written against the shapes the adapters already have (the IndexedDB cache
 * adapter and any catalog adapter), so this package depends on neither.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { CacheRow, PackSource, PackTarget, RawFound, RawRead, RawWrite } from './types'

/** The cache adapter methods a pack uses: raw rows by prefix to make one, raw writes to open one. */
export type RawCacheStore = {
  getByPrefix(prefix: string): Promise<CacheRow[]>
  putRawMany?(rows: CacheRow[]): Promise<void>
  hasRawKeys?(keys: string[]): Promise<Set<string>>
  /** One readwrite transaction that reads, decides and writes: what applying parts needs (`PackTarget.transactRaw`). */
  transactRaw?(read: RawRead, decide: (found: RawFound) => RawWrite): Promise<void>
}

/**
 * The catalog adapter methods a pack uses. tc-study's `IndexedDBCatalogAdapter` lists keys and saves one row at a
 * time (`getAll(): string[]`, `set`); `BaseCatalogStorageAdapter` returns a map and saves many. Both work.
 */
export type CatalogStore = {
  get(key: string): Promise<ResourceMetadata | null>
  getAll(): Promise<string[] | Map<string, ResourceMetadata>>
  set?(key: string, metadata: ResourceMetadata): Promise<void>
  saveMany?(items: Array<{ key: string; metadata: ResourceMetadata }>): Promise<void>
}

async function allCatalogRows(catalog: CatalogStore): Promise<ResourceMetadata[]> {
  const all = await catalog.getAll()
  if (all instanceof Map) return [...all.values()]
  const rows = await Promise.all(all.map((key) => catalog.get(key)))
  return rows.filter((row): row is ResourceMetadata => Boolean(row))
}

export function packSourceFrom(stores: { cache: RawCacheStore; catalog: CatalogStore }): PackSource {
  return {
    rowsByPrefix: (prefix) => stores.cache.getByPrefix(prefix),
    catalogRow: (key) => stores.catalog.get(key),
    catalogRows: () => allCatalogRows(stores.catalog),
  }
}

export function packTargetFrom(stores: { cache: RawCacheStore; catalog: CatalogStore }): PackTarget {
  const { cache, catalog } = stores
  if (!cache.putRawMany) throw new Error('El almacén de la caché no puede escribir filas tal como vienen (falta putRawMany).')
  if (!catalog.saveMany && !catalog.set) throw new Error('El catálogo no puede guardar filas (falta set o saveMany).')
  return {
    putRows: (rows) => cache.putRawMany!(rows),
    ...(cache.hasRawKeys ? { existingKeys: (keys: string[]) => cache.hasRawKeys!(keys) } : {}),
    putCatalogRows: async (rows) => {
      if (catalog.saveMany) return catalog.saveMany(rows)
      for (const row of rows) await catalog.set!(row.key, row.metadata)
    },
    catalogRow: (key) => catalog.get(key),
    ...(cache.transactRaw ? { transactRaw: (read: RawRead, decide: (found: RawFound) => RawWrite) => cache.transactRaw!(read, decide) } : {}),
  }
}
