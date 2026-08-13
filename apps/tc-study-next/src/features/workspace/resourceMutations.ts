/**
 * Single public mutation API for workspace panel membership (Unlock 3).
 *
 * UI (wizard, DnD, restore helpers, Read/Studio hooks) call these — never
 * AppStore membership writers (sealed off the public store). Workspace is the
 * only layout membership SoT; AppStore `loadedResources` is a read model
 * projected via {@link projectPanelResourcesToAppStore} after assign / layout
 * mutations.
 *
 * Modal-only `addResource(info)` without `panelId` is intentional: package-only,
 * no AppStore membership and no phantom panel keys until assign (entry modals
 * fall back to catalog metadata).
 */

import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  collectPanelResourceKeys,
  existingPanelInstanceId,
  generateInstanceId,
  projectPanelResourcesToAppStore,
} from './projectPanelResourcesToAppStore'

export {
  existingPanelInstanceId,
  generateInstanceId,
  getBaseResourceKey,
} from './projectPanelResourcesToAppStore'

/** Project current workspace panels → AppStore (explicit restore / CombinedHelps sync). */
export function projectCurrentWorkspacePanels(options?: {
  pruneKeys?: Iterable<string>
}) {
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return { projected: [] as string[], missing: [] as string[], pruned: [] as string[] }
  return projectPanelResourcesToAppStore({
    panels: pkg.panels,
    resources: pkg.resources,
    pruneKeys: options?.pruneKeys,
  })
}

/**
 * Add resource metadata to the workspace package (sidebar / collection).
 * CombinedHelps ensure + panel projection run inside workspaceStore.
 */
export function addResourceToPackage(resource: ResourceInfo): void {
  useWorkspaceStore.getState().addResourceToPackage(resource)
}

/**
 * Add to package (and optionally a panel). Returns the instance id used in panels.
 *
 * Without `panelId`, package-only (no AppStore membership write). Prefer
 * `{ panelId }` so assign → projector owns the AppStore upsert.
 */
export function addResource(
  resource: ResourceInfo,
  options: {
    allowMultipleInstances?: boolean
    panelId?: string
    index?: number
  } = {}
): string {
  const { allowMultipleInstances = false, panelId, index } = options
  const ws = useWorkspaceStore.getState()

  if (panelId) {
    const dest = ws.currentPackage?.panels.find((p) => p.id === panelId)
    const already = existingPanelInstanceId(dest?.resourceKeys, resource.key)
    if (already) {
      if (!ws.hasResourceInPackage(resource.key)) {
        ws.addResourceToPackage(resource)
      }
      return already
    }
  }

  let instanceId = resource.key
  if (allowMultipleInstances) {
    const panelKeys = ws.currentPackage
      ? collectPanelResourceKeys(ws.currentPackage.panels)
      : new Set<string>()
    const existingIds = new Set([
      ...Object.keys(useAppStore.getState().loadedResources),
      ...panelKeys,
    ])
    instanceId = generateInstanceId(resource.key, existingIds)
  }

  if (!ws.hasResourceInPackage(resource.key)) {
    ws.addResourceToPackage(resource)
  }

  if (panelId) {
    ws.assignResourceToPanel(instanceId, panelId, index)
  }

  return instanceId
}

export function assignResourceToPanel(
  resourceKey: string,
  panelId: string,
  index?: number
): void {
  useWorkspaceStore.getState().assignResourceToPanel(resourceKey, panelId, index)
}

export function removeResourceFromPanel(resourceKey: string, panelId: string): void {
  useWorkspaceStore.getState().removeResourceFromPanel(resourceKey, panelId)
}

export function moveResourceBetweenPanels(
  resourceKey: string,
  fromPanelId: string,
  toPanelId: string,
  insertIndex?: number
): void {
  useWorkspaceStore
    .getState()
    .moveResourceBetweenPanels(resourceKey, fromPanelId, toPanelId, insertIndex)
}

export function reorderResourceInPanel(
  resourceKey: string,
  panelId: string,
  newIndex: number
): void {
  useWorkspaceStore.getState().reorderResourceInPanel(resourceKey, panelId, newIndex)
}

export function removeResourceFromPackage(resourceKey: string): void {
  // Workspace slice removes panel membership + projects/prunes AppStore
  useWorkspaceStore.getState().removeResourceFromPackage(resourceKey)
}
