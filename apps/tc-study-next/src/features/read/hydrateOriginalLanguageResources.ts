/**
 * UGNT/UHB stay on the text pane (panel-1). Never hydrate on a helps-only load.
 */

import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { CatalogManager } from '@bt-synergy/catalog-manager'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import {
  createResourceMetadata,
  type Door43Resource,
} from '../../lib/services/ResourceMetadataFactory'

const ORIGINAL_RESOURCES = [
  { lang: 'el-x-koine', id: 'ugnt', label: 'UGNT', subject: 'Greek New Testament' },
  { lang: 'hbo', id: 'uhb', label: 'UHB', subject: 'Hebrew Old Testament' },
] as const

export const ORIGINAL_LANGUAGE_RESOURCE_KEYS = ORIGINAL_RESOURCES.map(
  (orig) => `unfoldingWord/${orig.lang}/${orig.id}`
)

export interface HydrateOriginalLanguageDeps {
  catalogManager: CatalogManager
  resourceTypeRegistry: ResourceTypeRegistry
  getPanel: (panelId: string) => { resourceKeys: string[] } | undefined
  addResource: (
    resource: ResourceInfo,
    options?: { panelId?: string; index?: number; allowMultipleInstances?: boolean }
  ) => void
  destPanelId?: 'panel-1' | 'panel-2'
}

export function hydrateOriginalLanguageResources(deps: HydrateOriginalLanguageDeps): {
  loadedKeys: string[]
  metadataPromises: Array<Promise<ResourceInfo | null>>
} {
  const { catalogManager, resourceTypeRegistry, getPanel, addResource } = deps
  const loadedKeys: string[] = []

  for (const orig of ORIGINAL_RESOURCES) {
    const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
    const basicResourceInfo: ResourceInfo = {
      id: resourceKey,
      key: resourceKey,
      resourceKey: resourceKey,
      title: orig.label,
      type: ResourceType.SCRIPTURE,
      category: 'Bible',
      subject: orig.subject,
      owner: 'unfoldingWord',
      language: orig.lang,
      languageCode: orig.lang,
      languageName: orig.label,
      resourceId: orig.id,
      server: 'git.door43.org',
      format: ResourceFormat.USFM,
      contentType: 'text/usfm',
      contentStructure: 'book',
      version: '1.0',
      availability: { online: true, offline: false, bundled: false, partial: false },
      locations: [],
      catalogedAt: new Date().toISOString(),
      appliesToScope: 'scripture',
    }

    loadedKeys.push(resourceKey)
    const destPanelId = deps.destPanelId ?? 'panel-1'
    const currentPanel = getPanel(destPanelId)
    const currentIndex = currentPanel?.resourceKeys.length || 0
    addResource(basicResourceInfo, {
      panelId: destPanelId,
      index: currentIndex,
      allowMultipleInstances: true,
    })
  }

  const metadataPromises = ORIGINAL_RESOURCES.map(async (orig): Promise<ResourceInfo | null> => {
    const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
    try {
      const catalogEntry = await (
        catalogManager.catalogAdapter as { get: (k: string) => Promise<unknown> }
      ).get(resourceKey)

      if (!catalogEntry) {
        const results = await catalogManager.door43Client.searchCatalog({
          owner: 'unfoldingWord',
          lang: orig.lang,
          subject: orig.subject,
          stage: 'prod',
          limit: 1,
        })

        if (results && results.length > 0) {
          const door43Resource = results[0]
          const repoName = door43Resource.name ?? door43Resource.repo_name
          const extractedResourceId = repoName?.replace(`${orig.lang}_`, '') || orig.id

          const normalizedResource = {
            ...door43Resource,
            id: extractedResourceId,
            language: door43Resource.language || door43Resource.lang,
          }

          const metadata = await createResourceMetadata(normalizedResource as Door43Resource, {
            resourceTypeRegistry,
            getResourceType: () => 'scripture',
            catalogAdapter: catalogManager.catalogAdapter,
            debug: true,
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
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
    }
    return null
  })

  return { loadedKeys, metadataPromises }
}
