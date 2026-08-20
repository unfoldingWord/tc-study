import { useCallback, useState } from 'react'
import { useCatalogManager } from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import { useResourceManagement } from '../../hooks'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  addResourceKeysToPanel,
  getDragOverlayLabel,
  parseResourceKeysFromDataTransfer,
  type StudioPanelId,
} from './studioDnDHelpers'

export interface PanelDnDResources {
  resourceKeys: string[]
  reorderResource: (resourceKey: string, newIndex: number) => void
  moveResource: (resourceKey: string, targetPanelId: string) => void
}

/**
 * Studio HTML5 sidebar drag/drop/click-to-add + overlay labels.
 * Panel tab reorder/move is owned by TabDnDProvider (pointer FSM).
 */
export function useStudioDnD(options: {
  panel1Resources: PanelDnDResources
  panel2Resources: PanelDnDResources
  panel1ResourceKeys: string[]
  panel2ResourceKeys: string[]
}) {
  const { panel1ResourceKeys, panel2ResourceKeys } = options
  const loadedResources = useAppStore((s) => s.loadedResources)
  const catalogManager = useCatalogManager()
  const { addResource } = useResourceManagement()
  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)

  const [_draggedResource, setDraggedResource] = useState<{
    resourceId: string | string[]
    sourcePanelId: string | 'sidebar'
  } | null>(null)
  const [dragOverPanel, setDragOverPanel] = useState<StudioPanelId | null>(null)
  const [selectedResourceKey, setSelectedResourceKey] = useState<string | null>(null)
  const [selectedResourceKeys, setSelectedResourceKeys] = useState<string[]>([])

  const getResourceLabel = useCallback(
    (resourceKey: string) => getDragOverlayLabel(resourceKey, loadedResources[resourceKey]),
    [loadedResources]
  )

  const handleSidebarDragEnd = useCallback(() => {
    setDraggedResource(null)
    setDragOverPanel(null)
  }, [])

  const handleSidebarDragStart = useCallback((resourceKeys: string[]) => {
    setDraggedResource({
      resourceId: resourceKeys.length === 1 ? resourceKeys[0] : resourceKeys,
      sourcePanelId: 'sidebar',
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedResourceKey(null)
    setSelectedResourceKeys([])
  }, [])

  const addKeysToPanel = useCallback(
    async (resourceKeys: string[], targetPanelId: StudioPanelId) => {
      if (resourceKeys.length === 0 || !resourceKeys[0]) return
      await addResourceKeysToPanel({
        resourceKeys,
        targetPanelId,
        targetResourceKeys: targetPanelId === 'panel-1' ? panel1ResourceKeys : panel2ResourceKeys,
        catalog: catalogManager,
        addResource,
        setActiveResourceInPanel,
      })
    },
    [catalogManager, addResource, setActiveResourceInPanel, panel1ResourceKeys, panel2ResourceKeys]
  )

  const handlePanelDrop = useCallback(
    async (e: React.DragEvent, targetPanelId: StudioPanelId) => {
      e.preventDefault()
      setDragOverPanel(null)
      const resourceKeys = parseResourceKeysFromDataTransfer(e.dataTransfer)
      if (resourceKeys.length === 0 || !resourceKeys[0]) {
        console.warn('⚠️ No resource keys in drop data')
        return
      }
      await addKeysToPanel(resourceKeys, targetPanelId)
      setDraggedResource(null)
      clearSelection()
    },
    [addKeysToPanel, clearSelection]
  )

  const handlePanelClick = useCallback(
    async (targetPanelId: StudioPanelId) => {
      const resourceKeys =
        selectedResourceKeys.length > 0
          ? selectedResourceKeys
          : selectedResourceKey
            ? [selectedResourceKey]
            : []
      if (resourceKeys.length === 0) return
      await addKeysToPanel(resourceKeys, targetPanelId)
      clearSelection()
    },
    [selectedResourceKey, selectedResourceKeys, addKeysToPanel, clearSelection]
  )

  const handlePanelDragOver = useCallback((e: React.DragEvent, panelId: StudioPanelId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOverPanel(panelId)
  }, [])

  const handlePanelDragLeave = useCallback(() => {
    setDragOverPanel(null)
  }, [])

  return {
    dragOverPanel,
    selectedResourceKey,
    setSelectedResourceKey,
    selectedResourceKeys,
    setSelectedResourceKeys,
    getResourceLabel,
    handleSidebarDragStart,
    handleSidebarDragEnd,
    handlePanelDrop,
    handlePanelClick,
    handlePanelDragOver,
    handlePanelDragLeave,
  }
}
