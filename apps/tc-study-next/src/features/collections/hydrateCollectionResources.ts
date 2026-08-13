/**
 * Resolve collection resource pointers into workspace ResourceInfo entries.
 * Prefers local catalog metadata; fetches from Door43 when missing.
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import type { ResourceInfo } from '../../contexts/types'
import { createResourceMetadata } from '../../lib/services/ResourceMetadataFactory'
import { createResourceInfo } from '../../utils/resourceInfo'

export type DownloadProgress = { current: number; total: number; name: string }

export interface HydrateCollectionDeps {
  catalogManager: CatalogManager
  resourceTypeRegistry: ResourceTypeRegistry
  onProgress?: (progress: DownloadProgress | null) => void
}

/** Parse `owner/language/resourceId` keys; invalid shapes are skipped. */
export function parseResourceKeyParts(
  resourceKey: string
): { owner: string; language: string; resourceId: string } | null {
  const parts = resourceKey.split('/')
  if (parts.length !== 3) return null
  const [owner, language, resourceId] = parts
  if (!owner || !language || !resourceId) return null
  return { owner, language, resourceId }
}

async function fetchAndCatalogResource(
  resourceKey: string,
  deps: HydrateCollectionDeps
): Promise<ResourceInfo | null> {
  const parts = parseResourceKeyParts(resourceKey)
  if (!parts) {
    console.error(`   ❌ Invalid resource key format: ${resourceKey}`)
    return null
  }

  const { owner, language, resourceId } = parts
  const door43Client = getDoor43ApiClient()
  const searchResults = await door43Client.searchCatalog({
    owner,
    language,
    subject: resourceId,
    stage: 'prod',
  })

  if (searchResults.length === 0) {
    console.error(`   ❌ Resource not found on Door43: ${resourceKey}`)
    return null
  }

  const resourceMetadata = await createResourceMetadata(searchResults[0], {
    includeEnrichment: true,
    resourceTypeRegistry: deps.resourceTypeRegistry,
    debug: true,
  })
  await deps.catalogManager.addResourceToCatalog(resourceMetadata)
  return createResourceInfo(resourceMetadata)
}

/**
 * Hydrate a set of resource keys into a Map for WorkspacePackage.resources.
 * Mutates `target` when provided; otherwise returns a new Map.
 */
export async function hydrateCollectionResources(
  resourceKeys: Iterable<string>,
  deps: HydrateCollectionDeps,
  target: Map<string, ResourceInfo> = new Map()
): Promise<Map<string, ResourceInfo>> {
  const keys = [...resourceKeys]
  const total = keys.length
  let current = 0

  for (const resourceKey of keys) {
    current++
    try {
      const metadata = await deps.catalogManager.getResourceMetadata(resourceKey)
      if (metadata) {
        const unfrozen = JSON.parse(JSON.stringify(metadata))
        target.set(resourceKey, createResourceInfo(unfrozen))
        continue
      }

      console.warn(`   ⚠️  Resource not in catalog: ${resourceKey}, fetching from Door43...`)
      deps.onProgress?.({ current, total, name: resourceKey })

      try {
        const info = await fetchAndCatalogResource(resourceKey, deps)
        if (info) target.set(resourceKey, info)
      } catch (fetchError) {
        console.error(`   ❌ Failed to fetch resource from Door43: ${resourceKey}`, fetchError)
      } finally {
        deps.onProgress?.(null)
      }
    } catch (err) {
      console.error(`   ❌ Failed to load resource ${resourceKey}:`, err)
    }
  }

  deps.onProgress?.(null)
  return target
}

/** Collect resource keys from package pointer list or workspace panels/resources. */
export function collectResourceKeysFromPointers(
  resources: Array<{ owner: string; language: string; resourceId: string }> | undefined
): Set<string> {
  const keys = new Set<string>()
  if (!resources) return keys
  for (const resource of resources) {
    keys.add(`${resource.owner}/${resource.language}/${resource.resourceId}`)
  }
  return keys
}

export function collectResourceKeysFromWorkspace(workspace: {
  resources?: Map<string, unknown>
  panels: Array<{ resourceKeys?: string[] }>
}): Set<string> {
  const keys = new Set<string>()
  if (workspace.resources && workspace.resources.size > 0) {
    for (const key of workspace.resources.keys()) keys.add(key)
    return keys
  }
  for (const panel of workspace.panels) {
    for (const key of panel.resourceKeys || []) keys.add(key)
  }
  return keys
}
