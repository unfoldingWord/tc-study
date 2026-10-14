/**
 * Phase 2: catalog metadata fetch for hits that belong to this load target.
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import {
  createResourceMetadata,
  type Door43Resource,
} from '../../lib/services/ResourceMetadataFactory'
import { panelAssignmentForContentRole, type CatalogLoadTarget } from './readCatalogPanelPolicy'
import type { ReadPanelId } from './readPanelModel'
import { catalogIdentity, type CatalogEntry } from './readCatalogIdentity'
import { catalogHitRelease, door43ResourceForHit } from '@bt-synergy/resource-pipeline/discover/catalogHits'

/** AppStore keys are instance ids (`glt#2`); catalog writes use the base key. */
export function loadedResourcesForCatalogKey(
  loaded: Record<string, ResourceInfo | undefined>,
  resourceKey: string
): ResourceInfo[] {
  const base = resourceKey.replace(/#\d+$/, '')
  const found: ResourceInfo[] = []
  for (const [id, resource] of Object.entries(loaded)) {
    if (!resource) continue
    if (id === resourceKey || id.replace(/#\d+$/, '') === base) {
      found.push(resource)
    }
  }
  return found
}

export function mergeCatalogMetadataOntoLoaded(
  existing: ResourceInfo,
  metadata: ResourceInfo
): ResourceInfo {
  return {
    ...existing,
    ...metadata,
    id: existing.id,
    key: existing.key,
    toc: existing.toc,
  }
}

export function collectCatalogMetadataPromises(options: {
  catalogResults: CatalogEntry[]
  languageCode: string
  target: CatalogLoadTarget
  destPanelId?: ReadPanelId
  catalogManager: CatalogManager
  resourceTypeRegistry: ResourceTypeRegistry
  viewerRegistry: { hasViewer: (typeId: string) => boolean }
}): Array<Promise<ResourceInfo[]>> {
  const {
    catalogResults,
    languageCode,
    target,
    destPanelId,
    catalogManager,
    resourceTypeRegistry,
    viewerRegistry,
  } = options

  return catalogResults.map(async (entry): Promise<ResourceInfo[]> => {
    const id = catalogIdentity(entry, languageCode)
    if (!id) return []
    const { resourceKey, subject } = id
    const type = resourceTypeRegistry.getTypeForSubject(subject)
    if (!type) return []

    const typeDef = resourceTypeRegistry.get(type)
    const hasViewer = viewerRegistry.hasViewer(type)
    const assignment = panelAssignmentForContentRole(
      typeDef?.contentRole,
      target,
      hasViewer,
      destPanelId
    )
    if (assignment.kind === 'skip') return []

    const release = catalogHitRelease(id)
    if (!release?.tag_name) return []

    try {
      const door43Resource = door43ResourceForHit(entry, id, release)

      const metadata = await createResourceMetadata(door43Resource as Door43Resource, {
        resourceTypeRegistry,
        getResourceType: () => type,
        catalogAdapter: catalogManager.catalogAdapter,
        debug: false,
      })

      await catalogManager.addResourceToCatalog(metadata)

      return loadedResourcesForCatalogKey(
        useAppStore.getState().loadedResources,
        resourceKey
      ).map((existing) => mergeCatalogMetadataOntoLoaded(existing, metadata as ResourceInfo))
    } catch (error) {
      console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
      return []
    }
  })
}
