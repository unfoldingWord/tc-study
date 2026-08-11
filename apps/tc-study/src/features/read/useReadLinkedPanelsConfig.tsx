/**
 * Build LinkedPanelsConfig for Read — stable deps (keys + active indices only).
 */

import { useMemo } from 'react'
import type { LinkedPanelsConfig } from '@bt-synergy/resource-panels'
import type { ViewerRegistry } from '@bt-synergy/catalog-manager'
import { ResourcePanelByKey } from './ResourcePanelByKey'

export function useReadLinkedPanelsConfig(args: {
  filteredPanel1Keys: string[]
  filteredPanel2Keys: string[]
  panel1ResourceKeys: string[]
  panel2ResourceKeys: string[]
  panel1ActiveIndex: number
  panel2ActiveIndex: number
  viewerRegistry: ViewerRegistry
  onEntryLinkClick: (resourceId: string, entryId?: string) => void
}): LinkedPanelsConfig {
  const {
    filteredPanel1Keys,
    filteredPanel2Keys,
    panel1ResourceKeys,
    panel2ResourceKeys,
    panel1ActiveIndex,
    panel2ActiveIndex,
    viewerRegistry,
    onEntryLinkClick,
  } = args

  const allResourceIds = useMemo(
    () => [...new Set([...filteredPanel1Keys, ...filteredPanel2Keys])],
    [filteredPanel1Keys, filteredPanel2Keys]
  )

  return useMemo((): LinkedPanelsConfig => {
    const resources = allResourceIds.map((id) => ({
      id,
      title: '',
      description: 'resource',
      category: 'resource',
      component: (
        <ResourcePanelByKey
          resourceId={id}
          viewerRegistry={viewerRegistry}
          onEntryLinkClick={onEntryLinkClick}
        />
      ),
    })) as LinkedPanelsConfig['resources']

    const p1ActiveKey = panel1ResourceKeys[panel1ActiveIndex]
    const p1FilteredIdx = p1ActiveKey ? filteredPanel1Keys.indexOf(p1ActiveKey) : -1
    const p2ActiveKey = panel2ResourceKeys[panel2ActiveIndex]
    const p2FilteredIdx = p2ActiveKey ? filteredPanel2Keys.indexOf(p2ActiveKey) : -1

    return {
      resources,
      panels: {
        'panel-1': {
          resourceIds: filteredPanel1Keys,
          initialIndex: p1FilteredIdx >= 0 ? p1FilteredIdx : 0,
        },
        'panel-2': {
          resourceIds: filteredPanel2Keys,
          initialIndex: p2FilteredIdx >= 0 ? p2FilteredIdx : 0,
        },
      },
    }
  }, [
    allResourceIds,
    filteredPanel1Keys,
    filteredPanel2Keys,
    panel1ResourceKeys,
    panel2ResourceKeys,
    panel1ActiveIndex,
    panel2ActiveIndex,
    viewerRegistry,
    onEntryLinkClick,
  ])
}
