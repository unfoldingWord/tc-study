import { useCallback } from 'react'
import { useAppStore } from '../../contexts/AppContext'
import { getResourceBadgeLabel } from '../tabs/tabShortLabel'

export interface PanelDnDResources {
  resourceKeys: string[]
  reorderResource: (resourceKey: string, newIndex: number) => void
}

/**
 * Read panel tab labels for TabDnDProvider overlay / placeholders.
 * Tab drag FSM is owned by TabDnDProvider.
 */
export function useReadPanelDnD() {
  const loadedResources = useAppStore((s) => s.loadedResources)

  const getResourceLabel = useCallback(
    (resourceKey: string) => {
      const resource = loadedResources[resourceKey]
      return getResourceBadgeLabel(resourceKey, resource)
    },
    [loadedResources]
  )

  return { getResourceLabel }
}
