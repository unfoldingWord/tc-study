/**
 * Wiring a pack to an app's stores. Written against the shapes the adapters already have (the IndexedDB cache
 * adapter and any catalog adapter), so this package depends on neither.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { CacheRow, PackSource, PackTarget } from './types'

/** The cache adapter methods a pack uses: raw rows by prefix to make one, raw writes to open one. */
export type RawCacheStore = {
  getByPrefix(prefix: string): Promise<CacheRow[]>
  putRawMany?(rows: CacheRow[]): Promise<void>
  hasRawKeys?(keys: string[]): Promise<Set<string>>
}

/** The catalog adapter methods a pack uses (`BaseCatalogStorageAdapter`). */
export type CatalogStore = {
  get(key: string): Promise<ResourceMetadata | null>
  getAll(): Promise<Map<string, ResourceMetadata>>
  saveMany?(items: Array<{ key: string; metadata: ResourceMetadata }>): Promise<void>
}

export function packSourceFrom(stores: { cache: RawCacheStore; catalog: CatalogStore }): PackSource {
  return {
    rowsByPrefix: (prefix) => stores.cache.getByPrefix(prefix),
    catalogRow: (key) => stores.catalog.get(key),
    catalogRows: async () => [...(await stores.catalog.getAll()).values()],
  }
}

export function packTargetFrom(stores: { cache: RawCacheStore; catalog: CatalogStore }): PackTarget {
  const { cache, catalog } = stores
  if (!cache.putRawMany) throw new Error('El almacén de la caché no puede escribir filas tal como vienen (falta putRawMany).')
  if (!catalog.saveMany) throw new Error('El catálogo no puede guardar filas (falta saveMany).')
  return {
    putRows: (rows) => cache.putRawMany!(rows),
    ...(cache.hasRawKeys ? { existingKeys: (keys: string[]) => cache.hasRawKeys!(keys) } : {}),
    putCatalogRows: (rows) => catalog.saveMany!(rows),
  }
}
