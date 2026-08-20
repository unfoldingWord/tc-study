/**
 * Studio Resources Hook
 * Manages resources in panels with drag-and-drop, reordering, and navigation.
 *
 * Unlock 1: panel.resourceKeys omit raw TN/TWL when CombinedHelps is present
 * (ensureCombinedHelps strips them). Policy here is defensive for stale keys only —
 * painted tabs should match store keys (single tab space).
 */

import { useCallback, useMemo, useRef } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import type { ResourceInfo } from '../contexts/types'
import { applyDualScopeHelpsPolicy } from '../features/helps/helpsPanelPolicy'
import { matchResourceForInstanceKey } from '../features/workspace/panelInstanceIds'
import {
  assignResourceToPanel as assignResourceMutation,
  moveResourceBetweenPanels as moveResourceMutation,
  removeResourceFromPanel as removeResourceMutation,
  reorderResourceInPanel as reorderResourceMutation,
} from '../features/workspace/resourceMutations'

export interface PanelResource {
  id: string
  title: string
  type: string
  category?: string
  metadata?: ResourceInfo
}

const EMPTY_RESOURCE_KEYS: string[] = []

function stabilizeKeys(next: string[], prevRef: { current: string[] }): string[] {
  const prev = prevRef.current
  if (next.length === prev.length && next.every((k, i) => k === prev[i])) return prev
  prevRef.current = next
  return next
}

export function useStudioResources(panelId: string) {
  const currentPackage = useWorkspaceStore((s) => s.currentPackage)
  const setActiveResourceInPanel = useWorkspaceStore((s) => s.setActiveResourceInPanel)
  const getResourcesForPanel = useWorkspaceStore((s) => s.getResourcesForPanel)
  const getActiveResourceForPanel = useWorkspaceStore((s) => s.getActiveResourceForPanel)
  const getPanel = useWorkspaceStore((s) => s.getPanel)

  const panel = currentPackage?.panels.find((p) => p.id === panelId)
  const rawResources = getResourcesForPanel(panelId)
  const rawKeys = panel?.resourceKeys ?? EMPTY_RESOURCE_KEYS
  const rawActiveIndex = panel?.activeIndex || 0

  const policy = useMemo(() => {
    if (panelId !== 'panel-2') {
      return {
        visibleKeys: rawKeys,
        activeKey: rawKeys[rawActiveIndex] ?? null,
        hiddenKeys: [] as string[],
      }
    }
    const refs = rawKeys.map((instanceKey, i) => ({
      key: instanceKey,
      type: rawResources[i]?.type,
    }))
    return applyDualScopeHelpsPolicy(refs)
  }, [panelId, rawKeys, rawResources, rawActiveIndex])

  const visibleKeysRef = useRef<string[]>(EMPTY_RESOURCE_KEYS)
  const resourceKeys = stabilizeKeys(policy.visibleKeys, visibleKeysRef)
  const resources = useMemo(
    () =>
      resourceKeys
        .map((instanceKey) => matchResourceForInstanceKey(instanceKey, rawKeys, rawResources))
        .filter(Boolean) as ResourceInfo[],
    [resourceKeys, rawKeys, rawResources]
  )

  const rawActiveKey = rawKeys[rawActiveIndex]
  const activeIndex = Math.max(
    0,
    resourceKeys.indexOf(rawActiveKey && resourceKeys.includes(rawActiveKey) ? rawActiveKey : resourceKeys[0] || '')
  )
  const activeResource = resources[activeIndex] || getActiveResourceForPanel(panelId)

  const setVisibleIndex = useCallback(
    (visibleIndex: number) => {
      const key = resourceKeys[visibleIndex]
      if (!key || !panel?.resourceKeys) return
      const rawIndex = panel.resourceKeys.indexOf(key)
      if (rawIndex >= 0) setActiveResourceInPanel(panelId, rawIndex)
    },
    [resourceKeys, panel, panelId, setActiveResourceInPanel]
  )

  const goToPrevious = useCallback(() => {
    if (resourceKeys.length === 0) return
    const newIndex = activeIndex > 0 ? activeIndex - 1 : resourceKeys.length - 1
    setVisibleIndex(newIndex)
  }, [resourceKeys.length, activeIndex, setVisibleIndex])

  const goToNext = useCallback(() => {
    if (resourceKeys.length === 0) return
    const newIndex = activeIndex < resourceKeys.length - 1 ? activeIndex + 1 : 0
    setVisibleIndex(newIndex)
  }, [resourceKeys.length, activeIndex, setVisibleIndex])

  const goToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= resourceKeys.length) return
      setVisibleIndex(index)
    },
    [resourceKeys.length, setVisibleIndex]
  )

  const addResource = useCallback(
    (resourceKey: string, index?: number) => {
      assignResourceMutation(resourceKey, panelId, index)
    },
    [panelId]
  )

  const removeResource = useCallback(() => {
    const key = resourceKeys[activeIndex]
    if (!key) return
    removeResourceMutation(key, panelId)
    if (activeIndex >= resourceKeys.length - 1) {
      setVisibleIndex(Math.max(0, resourceKeys.length - 2))
    }
  }, [resourceKeys, activeIndex, panelId, setVisibleIndex])

  const moveResource = useCallback(
    (resourceKey: string, targetPanelId: string) => {
      if (targetPanelId === panelId) return
      moveResourceMutation(resourceKey, panelId, targetPanelId)
      const newSourceIndex = activeIndex === 0 ? 0 : activeIndex - 1
      setVisibleIndex(newSourceIndex)
      const targetPanel = getPanel(targetPanelId)
      if (targetPanel?.resourceKeys?.length) {
        setActiveResourceInPanel(targetPanelId, targetPanel.resourceKeys.length - 1)
      }
    },
    [panelId, activeIndex, setVisibleIndex, getPanel, setActiveResourceInPanel]
  )

  const reorderResource = useCallback(
    (resourceKey: string, newIndex: number) => {
      reorderResourceMutation(resourceKey, panelId, newIndex)
    },
    [panelId]
  )

  return {
    resources,
    resourceKeys,
    /** Unfiltered workspace keys (DnD commit / store mutations) */
    rawResourceKeys: rawKeys,
    activeResource,
    activeIndex,
    resourceCount: resourceKeys.length,
    hasMultipleResources: resourceKeys.length > 1,
    hasPrevious: activeIndex > 0,
    hasNext: activeIndex < resourceKeys.length - 1,
    goToPrevious,
    goToNext,
    goToIndex,
    addResource,
    removeResource,
    moveResource,
    reorderResource,
  }
}
