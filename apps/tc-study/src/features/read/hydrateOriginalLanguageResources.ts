/**
 * UGNT/UHB stay on the text pane. Book-scoped: NT → UGNT, OT → UHB.
 * Never hydrate on a helps-only load.
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import {
  createResourceMetadata,
  type Door43Resource,
} from '../../lib/services/ResourceMetadataFactory'
import { useNavigationStore } from '../nav/navigationStore'
import {
  loadedResourcesForCatalogKey,
  mergeCatalogMetadataOntoLoaded,
} from './hydrateReadCatalogMetadata'
import { originalLanguageSpecForBook, type OriginalLanguageSpec } from './originalLanguageForBook'
import { syncOriginalLanguageOnScripturePanels } from './originalLanguagePanelMembership'
import type { ReadPanelId } from './readPanelModel'

export { ORIGINAL_LANGUAGE_RESOURCE_KEYS } from './originalLanguageForBook'

export interface HydrateOriginalLanguageDeps {
  catalogManager: CatalogManager
  resourceTypeRegistry: ResourceTypeRegistry
  destPanelId?: ReadPanelId
  currentBook?: string
}

function metadataForSpec(
  orig: OriginalLanguageSpec,
  catalogManager: CatalogManager,
  resourceTypeRegistry: ResourceTypeRegistry
): Promise<ResourceInfo[]> {
  const resourceKey = `unfoldingWord/${orig.lang}/${orig.id}`
  return (async (): Promise<ResourceInfo[]> => {
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

          return loadedResourcesForCatalogKey(
            useAppStore.getState().loadedResources,
            resourceKey
          ).map((existing) => mergeCatalogMetadataOntoLoaded(existing, metadata as ResourceInfo))
        }
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load metadata for ${resourceKey}:`, error)
    }
    return []
  })()
}

export function hydrateOriginalLanguageResources(deps: HydrateOriginalLanguageDeps): {
  loadedKeys: string[]
  metadataPromises: Array<Promise<ResourceInfo[]>>
} {
  const currentBook =
    deps.currentBook ?? useNavigationStore.getState().currentReference.book ?? ''
  const spec = originalLanguageSpecForBook(currentBook)
  const destPanelId = deps.destPanelId ?? 'panel-1'
  const loadedKeys = syncOriginalLanguageOnScripturePanels({
    bookCode: currentBook,
    scripturePanelIds: [destPanelId],
  })

  if (!spec) {
    return { loadedKeys, metadataPromises: [] }
  }

  return {
    loadedKeys,
    metadataPromises: [metadataForSpec(spec, deps.catalogManager, deps.resourceTypeRegistry)],
  }
}
