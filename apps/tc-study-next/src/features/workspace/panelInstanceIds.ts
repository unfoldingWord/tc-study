/**
 * Per-panel instance ids (`ult` vs `ult#2`) for LinkedPanels / ResourceTabs.
 * Selection uses the instance id; content lookup may fall back to the base key.
 */

import type { ResourceInfo } from '../../contexts/types'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  generateInstanceId,
  getBaseResourceKey,
} from './projectPanelResourcesToAppStore'
import { projectCurrentWorkspacePanels } from './resourceMutations'

export function stampResourceInstanceId(
  resource: ResourceInfo,
  instanceId: string
): ResourceInfo {
  if (resource.id === instanceId) return resource
  return { ...resource, id: instanceId }
}

/** Match a panel instance key to package resources (index first, then base). */
export function matchResourceForInstanceKey(
  instanceKey: string,
  rawKeys: readonly string[],
  rawResources: readonly ResourceInfo[]
): ResourceInfo | undefined {
  const index = rawKeys.indexOf(instanceKey)
  if (index >= 0 && rawResources[index]) {
    return stampResourceInstanceId(rawResources[index], instanceKey)
  }
  const base = getBaseResourceKey(instanceKey)
  const found = rawResources.find(
    (resource) =>
      resource.id === instanceKey ||
      resource.key === instanceKey ||
      resource.id === base ||
      resource.key === base
  )
  return found ? stampResourceInstanceId(found, instanceKey) : undefined
}

export function panelKeysOverlap(
  panel1Keys: readonly string[],
  panel2Keys: readonly string[]
): string[] {
  return panel1Keys.filter((key) => panel2Keys.includes(key))
}

/**
 * If two panels share the same instance id, remint later panels (`ult` → `ult#2`).
 * No-ops when ids are already unique so it is safe to call from an effect.
 */
export function ensureUniqueCrossPanelInstanceIds(): string[] {
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return []

  const used = new Set<string>()
  const reminted: string[] = []
  const planned: Array<{ panelId: string; next: string[]; nextActive: number }> = []

  for (const panel of pkg.panels) {
    const prevActiveKey = panel.resourceKeys[panel.activeIndex]
    const next: string[] = []
    let panelChanged = false
    for (const key of panel.resourceKeys) {
      if (!key) continue
      if (!used.has(key)) {
        used.add(key)
        next.push(key)
        continue
      }
      const instanceId = generateInstanceId(getBaseResourceKey(key), used)
      used.add(instanceId)
      next.push(instanceId)
      reminted.push(instanceId)
      panelChanged = true
    }
    if (!panelChanged) {
      for (const key of next) used.add(key)
      continue
    }
    const moved = prevActiveKey ? next.indexOf(prevActiveKey) : -1
    const nextActive =
      moved >= 0
        ? moved
        : panel.activeIndex >= next.length
          ? Math.max(0, next.length - 1)
          : panel.activeIndex
    planned.push({ panelId: panel.id, next, nextActive })
  }

  if (planned.length === 0) return []

  useWorkspaceStore.setState((state) => {
    if (!state.currentPackage) return
    for (const { panelId, next, nextActive } of planned) {
      const panel = state.currentPackage.panels.find((p) => p.id === panelId)
      if (!panel) continue
      panel.resourceKeys = next
      panel.activeIndex = nextActive
    }
    state.isPackageModified = true
  })
  projectCurrentWorkspacePanels()
  return reminted
}
