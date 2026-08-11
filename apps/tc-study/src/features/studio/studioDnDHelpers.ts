import type { ResourceMetadata as CatalogResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts'
import { getBaseResourceKey } from '../../hooks'
import { getTabShortLabel } from '../tabs/tabShortLabel'
import {
  minimalResourceInfoFallback,
  resourceInfoFromCatalogMetadata,
} from './studioResourceInfo'

export type StudioPanelId = 'panel-1' | 'panel-2'

type CatalogLookup = {
  getResourceMetadata: (key: string) => Promise<CatalogResourceMetadata | null>
}

export function panelOwningKey(
  key: string,
  panel1Keys: string[],
  panel2Keys: string[]
): StudioPanelId | null {
  if (panel1Keys.includes(key)) return 'panel-1'
  if (panel2Keys.includes(key)) return 'panel-2'
  return null
}

/** Resolve cross-panel hover target + insert index from a droppable/tab id. */
export function resolveCrossPanelHover(
  overKey: string,
  panel1Keys: string[],
  panel2Keys: string[]
): { targetPanelId: StudioPanelId; dropIndex: number } | null {
  if (overKey === 'panel-1-droppable') {
    return { targetPanelId: 'panel-1', dropIndex: panel1Keys.length }
  }
  if (overKey === 'panel-2-droppable') {
    return { targetPanelId: 'panel-2', dropIndex: panel2Keys.length }
  }
  if (panel1Keys.includes(overKey)) {
    return { targetPanelId: 'panel-1', dropIndex: panel1Keys.indexOf(overKey) }
  }
  if (panel2Keys.includes(overKey)) {
    return { targetPanelId: 'panel-2', dropIndex: panel2Keys.indexOf(overKey) }
  }
  return null
}

export function parseResourceKeysFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const resourceKeysJson =
    dataTransfer.getData('application/resource-keys') || dataTransfer.getData('text/plain')
  try {
    const parsed = JSON.parse(resourceKeysJson)
    if (Array.isArray(parsed)) return parsed.filter(Boolean)
    if (typeof parsed === 'string' && parsed) return [parsed]
  } catch {
    // Fallback for old single-resource format
  }
  const singleKey = dataTransfer.getData('application/resource-key') || resourceKeysJson
  return singleKey ? [singleKey] : []
}

/** Compact label for DragOverlay tabs (DCS abbrev, key segment, then title heuristics). */
export function getDragOverlayLabel(
  resourceKey: string,
  resource?: { title?: string; type?: string; abbreviation?: string } | null
): string {
  return getTabShortLabel({
    key: resourceKey,
    title: resource?.title,
    type: resource?.type,
    abbreviation: resource?.abbreviation,
  })
}

async function resolveResourceInfoForAdd(
  resourceKey: string,
  catalog: CatalogLookup
): Promise<ResourceInfo> {
  try {
    const metadata = await catalog.getResourceMetadata(resourceKey)
    if (metadata) return resourceInfoFromCatalogMetadata(resourceKey, metadata)
    console.warn(`⚠️ Metadata not found for ${resourceKey}, using fallback`)
  } catch (error) {
    console.error(`❌ Failed to fetch metadata for ${resourceKey}:`, error)
  }
  return minimalResourceInfoFallback(resourceKey)
}

/**
 * Add sidebar-selected resources into a studio panel (atomic add+assign).
 * Skips keys already present in the target panel (base-key match).
 */
export async function addResourceKeysToPanel(options: {
  resourceKeys: string[]
  targetPanelId: StudioPanelId
  targetResourceKeys: string[]
  catalog: CatalogLookup
  addResource: (
    info: ResourceInfo,
    opts: { allowMultipleInstances: boolean; panelId: StudioPanelId }
  ) => void
  setActiveResourceInPanel: (panelId: StudioPanelId, index: number) => void
}): Promise<void> {
  const {
    resourceKeys,
    targetPanelId,
    targetResourceKeys,
    catalog,
    addResource,
    setActiveResourceInPanel,
  } = options

  for (const resourceKey of resourceKeys) {
    const baseResourceKey = getBaseResourceKey(resourceKey)
    const alreadyInPanel = targetResourceKeys.some(
      (key) => getBaseResourceKey(key) === baseResourceKey
    )
    if (alreadyInPanel) continue

    const resourceInfo = await resolveResourceInfoForAdd(resourceKey, catalog)
    addResource(resourceInfo, {
      allowMultipleInstances: true,
      panelId: targetPanelId,
    })

    const newIndex = targetResourceKeys.length
    if (resourceKeys.indexOf(resourceKey) === resourceKeys.length - 1) {
      setActiveResourceInPanel(targetPanelId, newIndex)
    }
  }
}
