/**
 * Studio Resources Hook
 * Manages resources in panels with drag-and-drop, reordering, and navigation
 */

import { useCallback } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useAppStore } from '../contexts/AppContext'
import type { ResourceInfo } from '../contexts/types'

export interface PanelResource {
  id: string
  title: string
  type: string
  category?: string
  metadata?: ResourceInfo
}

export function useStudioResources(panelId: string) {
  const currentPackage = useWorkspaceStore((s) => s.currentPackage)
  const assignResourceToPanel = useWorkspaceStore((s) => s.assignResourceToPanel)
  const removeResourceFromPanel = useWorkspaceStore((s) => s.removeResourceFromPanel)
  const moveResourceBetweenPanels = useWorkspaceStore((s) => s.moveResourceBetweenPanels)
  const reorderResourceInPanel = useWorkspaceStore((s) => s.reorderResourceInPanel)
  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)
  const getResourcesForPanel = useWorkspaceStore((s) => s.getResourcesForPanel)
  const getActiveResourceForPanel = useWorkspaceStore((s) => s.getActiveResourceForPanel)
  const getPanel = useWorkspaceStore((s) => s.getPanel)
  const removeResourceFromAppStore = useAppStore((s) => s.removeResource)

  // Get panel configuration
  const panel = currentPackage?.panels.find((p) => p.id === panelId)
  const resources = getResourcesForPanel(panelId)
  const activeResource = getActiveResourceForPanel(panelId)
  const activeIndex = panel?.activeIndex || 0

  // Navigation functions
  const goToPrevious = useCallback(() => {
    if (!panel?.resourceKeys || panel.resourceKeys.length === 0) return
    const newIndex = activeIndex > 0 ? activeIndex - 1 : panel.resourceKeys.length - 1
    setActiveResourceInPanel(panelId, newIndex)
  }, [panelId, panel, activeIndex, setActiveResourceInPanel])

  const goToNext = useCallback(() => {
    if (!panel?.resourceKeys || panel.resourceKeys.length === 0) return
    const newIndex = activeIndex < panel.resourceKeys.length - 1 ? activeIndex + 1 : 0
    setActiveResourceInPanel(panelId, newIndex)
  }, [panelId, panel, activeIndex, setActiveResourceInPanel])

  const goToIndex = useCallback(
    (index: number) => {
      if (!panel?.resourceKeys || index < 0 || index >= panel.resourceKeys.length) return
      setActiveResourceInPanel(panelId, index)
    },
    [panelId, panel, setActiveResourceInPanel]
  )

  // Resource management functions
  const addResource = useCallback(
    (resourceKey: string, index?: number) => {
      assignResourceToPanel(resourceKey, panelId, index)
    },
    [panelId, assignResourceToPanel]
  )

  const removeResource = useCallback(
    () => {
      // Get the full instance key from panel.resourceKeys[activeIndex]
      if (!panel?.resourceKeys || activeIndex >= panel.resourceKeys.length) return
      const fullInstanceKey = panel.resourceKeys[activeIndex]
      
      // Remove from panel only
      // Note: We DO NOT remove from AppStore here because the resource may still be:
      // 1. In the sidebar
      // 2. In another panel
      // The resource will be cleaned up from AppStore when removed from sidebar
      removeResourceFromPanel(fullInstanceKey, panelId)
      
      // Adjust active index if needed
      if (panel.resourceKeys && activeIndex >= panel.resourceKeys.length - 1) {
        setActiveResourceInPanel(panelId, Math.max(0, panel.resourceKeys.length - 2))
      }
    },
    [panelId, panel, activeIndex, removeResourceFromPanel, setActiveResourceInPanel]
  )

  const moveResource = useCallback(
    (resourceKey: string, targetPanelId: string) => {
      if (targetPanelId === panelId) return
      moveResourceBetweenPanels(resourceKey, panelId, targetPanelId)
      // Source panel: show previous resource (or stay at 0)
      const newSourceIndex = activeIndex === 0 ? 0 : activeIndex - 1
      setActiveResourceInPanel(panelId, newSourceIndex)
      // Target panel: show the moved resource (now last)
      const targetPanel = getPanel(targetPanelId)
      if (targetPanel?.resourceKeys?.length) {
        setActiveResourceInPanel(targetPanelId, targetPanel.resourceKeys.length - 1)
      }
    },
    [panelId, activeIndex, moveResourceBetweenPanels, setActiveResourceInPanel, getPanel]
  )

  const reorderResource = useCallback(
    (resourceKey: string, newIndex: number) => {
      reorderResourceInPanel(resourceKey, panelId, newIndex)
    },
    [panelId, reorderResourceInPanel]
  )

  return {
    // State
    resources,
    resourceKeys: panel?.resourceKeys ?? [],
    activeResource,
    activeIndex,
    resourceCount: panel?.resourceKeys?.length || 0,
    hasMultipleResources: (panel?.resourceKeys?.length || 0) > 1,
    hasPrevious: activeIndex > 0,
    hasNext: activeIndex < (panel?.resourceKeys?.length || 0) - 1,
    
    // Navigation
    goToPrevious,
    goToNext,
    goToIndex,
    
    // Management
    addResource,
    removeResource,
    moveResource,
    reorderResource,
  }
}
