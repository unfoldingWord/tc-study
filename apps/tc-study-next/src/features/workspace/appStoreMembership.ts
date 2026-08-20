/**
 * Projector-only AppStore membership writers (Unlock 3 seal).
 *
 * Not on the public `useAppStore` action surface. Layout membership SoT is
 * `workspaceStore`; `loadedResources` is a **read model** updated here after
 * panel projection (and pruned here). Runtime enrichment uses public
 * `patchLoadedResources` (patch-by-key only — never creates membership).
 *
 * Production callers: `projectPanelResourcesToAppStore` only.
 * Tests may import these helpers to seed membership without reopening the
 * public store API.
 */

import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'

/** Upsert one loadedResources key (instance id = resource.id). */
export function upsertLoadedResourceMembership(resource: ResourceInfo): void {
  useAppStore.setState((state) => {
    state.loadedResources[resource.id] = resource
  })
}

/** Remove one loadedResources key if present. */
export function removeLoadedResourceMembership(resourceId: string): void {
  useAppStore.setState((state) => {
    delete state.loadedResources[resourceId]
  })
}
