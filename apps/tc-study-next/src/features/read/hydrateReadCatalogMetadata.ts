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
import { asString, catalogIdentity, type CatalogEntry } from './readCatalogIdentity'

export function collectCatalogMetadataPromises(options: {
  catalogResults: CatalogEntry[]
  languageCode: string
  target: CatalogLoadTarget
  catalogManager: CatalogManager
  resourceTypeRegistry: ResourceTypeRegistry
  viewerRegistry: { hasViewer: (typeId: string) => boolean }
}): Array<Promise<ResourceInfo | null>> {
  const {
    catalogResults,
    languageCode,
    target,
    catalogManager,
    resourceTypeRegistry,
    viewerRegistry,
  } = options

  return catalogResults.map(async (entry): Promise<ResourceInfo | null> => {
    const id = catalogIdentity(entry, languageCode)
    if (!id) return null
    const { item, ownerStr, langStr, resourceId, resourceKey, subject, repoName } = id
    const type = resourceTypeRegistry.getTypeForSubject(subject)
    if (!type) return null

    const typeDef = resourceTypeRegistry.get(type)
    const hasViewer = viewerRegistry.hasViewer(type)
    const assignment = panelAssignmentForContentRole(typeDef?.contentRole, target, hasViewer)
    if (assignment.kind === 'skip') return null

    const release = item.release ?? item.catalog?.prod
    if (!release?.tag_name) return null

    try {
      const abbreviation = asString(item.abbreviation).trim() || undefined
      const door43Resource = {
        id: resourceId,
        name: repoName,
        title: item.title ?? entry.title ?? resourceKey,
        ...(abbreviation ? { abbreviation } : {}),
        owner: ownerStr,
        language: langStr,
        language_title: item.language_title,
        subject,
        version: release.tag_name,
        format: item.content_format ?? item.format,
        content_format: item.content_format ?? item.format,
        metadata_url: item.metadata_url ?? entry.metadata_url,
        description: item.description ?? item.repo?.description,
        ingredients: item.ingredients ?? item.repo?.ingredients,
        release,
        server: 'git.door43.org',
        html_url: item.html_url ?? entry.html_url ?? release?.html_url,
      }

      const metadata = await createResourceMetadata(door43Resource as Door43Resource, {
        resourceTypeRegistry,
        getResourceType: () => type,
        catalogAdapter: catalogManager.catalogAdapter,
        debug: false,
      })

      await catalogManager.addResourceToCatalog(metadata)

      const existingResource = useAppStore.getState().loadedResources[resourceKey]
      if (existingResource) {
        return {
          ...existingResource,
          ...metadata,
          id: existingResource.id,
          key: existingResource.key,
          toc: existingResource.toc,
        }
      }
      return null
    } catch (error) {
      console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
      return null
    }
  })
}
