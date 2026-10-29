/**
 * UGNT/UHB stay on the text pane. Book-scoped: NT → UGNT, OT → UHB.
 * Never hydrate on a helps-only load.
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { ensureOriginalLanguageInCatalog } from '@bt-synergy/resource-pipeline/discover/originalLanguageCatalog'
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
      // Already in the catalog (a download, or the originals language pack): its row is the metadata.
      const metadata =
        (await ensureOriginalLanguageInCatalog(orig, catalogManager, resourceTypeRegistry)) ??
        (await catalogManager.getResourceMetadata(resourceKey))
      if (metadata) {
        return loadedResourcesForCatalogKey(
          useAppStore.getState().loadedResources,
          resourceKey
        ).map((existing) => mergeCatalogMetadataOntoLoaded(existing, metadata as ResourceInfo))
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
