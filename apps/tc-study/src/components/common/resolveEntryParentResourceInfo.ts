import type { ResourceMetadata as CatalogResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts/types'
import { resourceInfoFromCatalogMetadata } from '../../features/studio/studioResourceInfo'
import { mergeResourceInfoDocs } from '../resources/common/enrichResourceInfoDocs'
import { lookupWorkspaceResource } from '../resources/common/lookupWorkspaceResource'

function isCatalogResourceMetadata(value: unknown): value is CatalogResourceMetadata {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  // Reject EntryResourceModal's synthetic stub ({ title, type, metadata }).
  // Real catalog rows carry identity fields used by ResourceInfo + Door43 enrich.
  return (
    typeof m.resourceKey === 'string' ||
    (typeof m.owner === 'string' &&
      typeof m.language === 'string' &&
      (typeof m.resourceId === 'string' || typeof m.title === 'string'))
  )
}

/**
 * Resolve the parent TW/TA package ResourceInfo for EntryResourceModal Info.
 * Package map → loadedResources → catalog metadata (never the viewer stub).
 */
export function resolveEntryParentResourceInfo(
  resourceId: string | undefined,
  packageResources: Map<string, ResourceInfo> | Record<string, ResourceInfo> | undefined,
  loadedResources: Record<string, ResourceInfo | undefined>,
  catalogMetadata: unknown
): ResourceInfo | null {
  if (!resourceId) return null

  const fromWorkspace = lookupWorkspaceResource(resourceId, packageResources, loadedResources)
  const fromCatalog = isCatalogResourceMetadata(catalogMetadata)
    ? resourceInfoFromCatalogMetadata(resourceId, catalogMetadata)
    : undefined

  if (fromWorkspace && fromCatalog) {
    return mergeResourceInfoDocs(fromWorkspace, fromCatalog)
  }
  return fromWorkspace ?? fromCatalog ?? null
}
