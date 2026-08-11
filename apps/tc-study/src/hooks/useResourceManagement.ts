/**
 * React facade over {@link ../features/workspace/resourceMutations}.
 * Prefer these helpers (or the mutations module) for all add/assign/remove/move.
 */

import { useCallback } from 'react'
import { useAppStore } from '../contexts/AppContext'
import type { ResourceInfo } from '../contexts/types'
import {
  addResource as addResourceMutation,
  addResourceToPackage,
  assignResourceToPanel,
  moveResourceBetweenPanels,
  removeResourceFromPackage,
  removeResourceFromPanel,
} from '../features/workspace/resourceMutations'

export { getBaseResourceKey } from '../features/workspace/resourceMutations'

export function useResourceManagement() {
  const loadedResources = useAppStore((s) => s.loadedResources)

  const addResource = useCallback(
    (
      resource: ResourceInfo,
      options:
        | boolean
        | {
            allowMultipleInstances?: boolean
            panelId?: string
            index?: number
          } = false
    ): string => {
      // Prefer options object with `{ panelId }` (atomic assign). Boolean overload is legacy.
      if (typeof options === 'boolean') {
        return addResourceMutation(resource, { allowMultipleInstances: options })
      }
      return addResourceMutation(resource, options)
    },
    []
  )

  const getResourceUsageCount = useCallback(
    (baseResourceKey: string): number => {
      const escapedKey = baseResourceKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const instancePattern = new RegExp(`^${escapedKey}(#\\d+)?$`)
      return Object.keys(loadedResources).filter((id) => instancePattern.test(id)).length
    },
    [loadedResources]
  )

  return {
    addResource,
    assignResourceToPanel,
    removeResourceFromPanel,
    moveResourceBetweenPanels,
    removeResourceFromPackage,
    addResourceToPackage,
    getResourceUsageCount,
  }
}

/**
 * Static helper: package/collection only (sidebar). Projection runs if CombinedHelps
 * injects into a panel inside workspaceStore.
 */
export function addResourceToWorkspace(resource: ResourceInfo) {
  addResourceToPackage(resource)
}
