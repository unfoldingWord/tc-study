import type { LinkedPanelsConfig } from '@bt-synergy/resource-panels'
import { useCallback, useMemo, useRef } from 'react'
import { useViewerRegistry } from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { useEntryModalStore } from '../entries'
import { resolveViewerForResource } from '../read/resolveViewerForResource'
import { linkedPanelsConfigMembershipKey } from '../read/useReadLinkedPanelsConfig'
import { createStudioPluginRegistry } from './createStudioPluginRegistry'

/**
 * Linked-panels config + entry modal open handler for Studio.
 */
export function useStudioPanelConfig(options: {
  panel1ResourceKeys: string[]
  panel2ResourceKeys: string[]
  panel1ActiveIndex: number
  panel2ActiveIndex: number
}) {
  const {
    panel1ResourceKeys,
    panel2ResourceKeys,
    panel1ActiveIndex,
    panel2ActiveIndex,
  } = options

  const loadedResources = useAppStore((s) => s.loadedResources)
  const viewerRegistry = useViewerRegistry()
  const openModal = useEntryModalStore((s) => s.openModal)
  const plugins = useMemo(() => createStudioPluginRegistry(), [])

  const scriptureResources = useMemo(() => {
    return Object.values(loadedResources)
      .filter((r) => r.category === 'scripture' || r.type === 'scripture')
      .map((r) => ({ id: r.id, title: r.title }))
  }, [loadedResources])

  const handleOpenEntry = useCallback(
    (resourceId: string, entryId?: string) => {
      const resourceKey = entryId ? `${resourceId}#${entryId}` : resourceId
      openModal(resourceKey)
    },
    [openModal]
  )

  const generateResourceComponent = useCallback(
    (resource: { id: string; key?: string; type?: string; category?: string; server?: string; owner?: string; language?: string }) => {
      const isAnchor = resource.id === scriptureResources[0]?.id
      const resourceKey = resource.key || resource.id
      const isScripture = resource.type === 'scripture' || resource.category === 'scripture'
      return resolveViewerForResource({
        resource: resource as ResourceInfo,
        resourceKey,
        viewerRegistry,
        onEntryLinkClick: handleOpenEntry,
        extraProps: isScripture
          ? {
              server: resource.server,
              owner: resource.owner,
              language: resource.language,
              isAnchor,
            }
          : undefined,
      })
    },
    [scriptureResources, handleOpenEntry, viewerRegistry]
  )

  const panelConfig: LinkedPanelsConfig = useMemo(() => {
    const allResourceIds = [...new Set([...panel1ResourceKeys, ...panel2ResourceKeys])]
    const resources = allResourceIds
      .map((id) => {
        const resource = loadedResources[id]
        if (!resource) {
          console.warn(`⚠️ Resource ${id} not found in loadedResources`)
          return null
        }
        return {
          id: resource.id,
          title: resource.title,
          description: `${resource.type} resource`,
          category: resource.category || resource.type,
          component: generateResourceComponent(resource),
        }
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r)) as LinkedPanelsConfig['resources']

    return {
      resources,
      panels: {
        'panel-1': {
          resourceIds: panel1ResourceKeys,
          initialIndex: panel1ActiveIndex,
        },
        'panel-2': {
          resourceIds: panel2ResourceKeys,
          initialIndex: panel2ActiveIndex,
        },
      },
    }
  }, [
    panel1ResourceKeys,
    panel2ResourceKeys,
    panel1ActiveIndex,
    panel2ActiveIndex,
    loadedResources,
    generateResourceComponent,
  ])

  const prevRef = useRef<{ key: string; config: LinkedPanelsConfig } | null>(null)
  const membershipKey = linkedPanelsConfigMembershipKey(panelConfig)
  const stablePanelConfig =
    prevRef.current?.key === membershipKey ? prevRef.current.config : panelConfig
  if (prevRef.current?.key !== membershipKey) {
    prevRef.current = { key: membershipKey, config: panelConfig }
  }

  return { panelConfig: stablePanelConfig, plugins, handleOpenEntry, loadedResources }
}
