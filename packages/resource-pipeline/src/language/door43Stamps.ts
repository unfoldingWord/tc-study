/**
 * The stamps a language pack would be built from, read from Door43's catalog alone: discovery runs, nothing is
 * downloaded. A publisher compares them with the stamps of the stored pack to know, in seconds, whether anything
 * changed and a rebuild is worth its hour.
 */

import { CatalogManager } from '@bt-synergy/catalog-manager/core'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { ORIGINAL_LANGUAGE_KEYS, packSourceFrom } from '@bt-synergy/language-pack'
import { resourceContentStamp, type ResourceMetadata } from '@bt-synergy/resource-catalog'
import { discoverLanguage } from '../discover/discoverLanguage'
import { createHeadlessResourceTypeRegistry } from '../discover/resourceTypeRegistry'

// The same two rules prepare-and-pack uses to decide which rows the pack carries; shared so the stamps never drift.
export const isObs = (m: { subject?: unknown }) => /OBS|Open Bible Stories/i.test(String(m.subject ?? ''))
export const keyOfRow = (m: { owner?: unknown; language?: unknown; resourceId?: unknown; resourceKey?: unknown }) =>
  String(m.resourceKey ?? `${m.owner}/${m.language}/${m.resourceId}`)

export function stampsOfRows(rows: ResourceMetadata[], o: { language: string; obs: boolean }): Record<string, string> {
  const originals = new Set<string>(ORIGINAL_LANGUAGE_KEYS)
  const stamps: Record<string, string> = {}
  for (const row of rows) {
    const key = keyOfRow(row)
    const ofLanguage = row.language === o.language && (o.obs || !isObs(row))
    if (ofLanguage || originals.has(key)) stamps[key] = resourceContentStamp(row)
  }
  return stamps
}

let calls = 0

export async function door43Stamps(o: { language: string; obs: boolean }): Promise<Record<string, string>> {
  // Node has no IndexedDB; a browser keeps its own. Only fill the gap, never replace a real one.
  if (!('indexedDB' in globalThis)) await import('fake-indexeddb/auto')
  // A database of its own per call: a library must not share state with the pack build or with a second call.
  const id = `${Date.now()}-${calls++}`
  const catalogAdapter = new IndexedDBCatalogAdapter({ dbName: `door43-stamps-catalog-${id}`, storeName: 'catalog-entries', version: 1 })
  const cacheAdapter = new IndexedDBCacheAdapter({ dbName: `door43-stamps-cache-${id}`, storeName: 'cache-entries', version: 1 })
  const door43Client = getDoor43ApiClient({ baseUrl: 'https://git.door43.org', debug: false })

  const catalogManager = new CatalogManager({
    catalogAdapter: catalogAdapter as never,
    cacheAdapter: cacheAdapter as never,
    door43Client: door43Client as never,
    enableNetworkFallback: true,
    requireSecureConnection: false,
  } as never)
  const resourceTypeRegistry = createHeadlessResourceTypeRegistry(catalogManager)
  await discoverLanguage({ language: o.language, door43Client: door43Client as never, catalogManager, resourceTypeRegistry })

  const source = packSourceFrom({ cache: cacheAdapter as never, catalog: catalogAdapter as never })
  return stampsOfRows((await source.catalogRows()) as ResourceMetadata[], o)
}
