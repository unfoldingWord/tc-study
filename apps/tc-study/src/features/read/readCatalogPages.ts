/**
 * Read's catalog hits: Door43 first, then the device's own catalog when Door43 cannot be searched or finds nothing,
 * so a language opened from a language pack loads with no internet.
 *
 * Hits from the device skip the metadata phase (`collectCatalogMetadataPromises`), which builds metadata from Door43
 * and writes it over the catalog row: the row the device holds is already the metadata, and a pack's row must stay.
 */

import {
  localCatalogHitsForTarget,
  type LocalCatalogRow,
} from '@bt-synergy/resource-pipeline/discover/localCatalogHits'
import { catalogIdentity, type CatalogEntry } from '@bt-synergy/resource-pipeline/discover/readCatalogIdentity'
import type { CatalogLoadTarget } from '@bt-synergy/resource-pipeline/discover/readCatalogSearch'
import type { ResourceInfo } from '../../contexts/types'
import { loadedResourcesForCatalogKey, mergeCatalogMetadataOntoLoaded } from './hydrateReadCatalogMetadata'

export type ReadCatalogPage = { hydrateTarget: CatalogLoadTarget; catalogResults: CatalogEntry[] }

export interface ReadCatalogRequest {
  languageCode: string
  target: CatalogLoadTarget
  navigationScope: string
  helpsSubjects?: readonly string[]
}

const hasHits = (pages: readonly ReadCatalogPage[]): boolean =>
  pages.some((page) => page.catalogResults.length > 0)

export async function readCatalogPagesOrDevice(options: {
  request: ReadCatalogRequest
  searchDoor43: () => Promise<ReadCatalogPage[]>
  deviceRows: () => Promise<LocalCatalogRow[]>
}): Promise<{ pages: ReadCatalogPage[]; fromDevice: boolean }> {
  let door43: ReadCatalogPage[] = []
  let failure: unknown
  try {
    door43 = await options.searchDoor43()
    if (hasHits(door43)) return { pages: door43, fromDevice: false }
  } catch (error) {
    failure = error
  }
  const rows = await options.deviceRows().catch(() => [])
  const local = localCatalogHitsForTarget(rows, options.request)
  if (hasHits(local)) return { pages: local, fromDevice: true }
  if (failure !== undefined) throw failure
  return { pages: door43, fromDevice: false }
}

/** Every catalog row the device holds. */
export async function deviceCatalogRows(catalog: {
  getAllResourceKeys(): Promise<string[]>
  getResourceMetadata(key: string): Promise<unknown>
}): Promise<LocalCatalogRow[]> {
  const keys = await catalog.getAllResourceKeys()
  const rows = await Promise.all(keys.map((key) => catalog.getResourceMetadata(key)))
  return rows.filter(
    (row): row is LocalCatalogRow =>
      Boolean(row) && typeof row === 'object' && typeof (row as LocalCatalogRow).resourceKey === 'string'
  )
}

/** Phase 2 for hits from the device: the loaded resources get the catalog row as it is, and nothing is written. */
export function deviceMetadataPromises(options: {
  catalogResults: CatalogEntry[]
  languageCode: string
  getResourceMetadata: (key: string) => Promise<unknown>
  loadedResources: () => Record<string, ResourceInfo | undefined>
}): Array<Promise<ResourceInfo[]>> {
  return options.catalogResults.map(async (entry) => {
    const id = catalogIdentity(entry, options.languageCode)
    if (!id) return []
    const metadata = await options.getResourceMetadata(id.resourceKey).catch(() => null)
    if (!metadata) return []
    return loadedResourcesForCatalogKey(options.loadedResources(), id.resourceKey).map((existing) =>
      mergeCatalogMetadataOntoLoaded(existing, metadata as ResourceInfo)
    )
  })
}
