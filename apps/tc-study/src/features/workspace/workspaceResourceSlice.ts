/**
 * Package resources + panel membership + read helpers.
 * Projection to AppStore runs after layout-changing mutations.
 */

import type { ResourceInfo } from '../../contexts/types'
import { createResourceInfo } from '../../utils/resourceInfo'
import { ensureCombinedHelpsInWorkspace } from '../helps/ensureCombinedHelps'
import { existingPanelInstanceId, getBaseResourceKey } from './projectPanelResourcesToAppStore'
import { projectPanelsFromPackage } from './workspaceProjection'
import { scheduleWorkspacePersist } from './workspacePersistSchedule'
import { finishResourceWrite, type ResourceWriteOptions } from './resourceWriteOptions'
import type { PanelConfig, WorkspaceGet, WorkspaceSet, WorkspaceStore } from './workspaceTypes'

export type ResourceSlice = Pick<
  WorkspaceStore,
  | 'addResourceToPackage'
  | 'removeResourceFromPackage'
  | 'assignResourceToPanel'
  | 'removeResourceFromPanel'
  | 'moveResourceBetweenPanels'
  | 'reorderResourceInPanel'
  | 'setActiveResourceInPanel'
  | 'hasResourceInPackage'
  | 'getPanel'
  | 'getPanels'
  | 'getResourcesForPanel'
  | 'getActiveResourceForPanel'
>

function extractBaseKey(key: string): string {
  return getBaseResourceKey(key)
}

/** Original-language adds (UGNT/UHB) must not steer CombinedHelps pairing. */
function gatewayLanguageHint(resource: ResourceInfo): string | undefined {
  const type = String(resource.type || '')
  // Primary text resources must not steer CombinedHelps (split text vs helps languages).
  if (type === 'scripture' || type === 'obs') return undefined

  const raw = String(resource.languageCode || resource.language || '')
    .trim()
    .toLowerCase()
  // Check full codes before segmenting — `el-x-koine` must not become gateway `el`
  if (!raw || raw === 'und' || raw === 'el-x-koine' || raw === 'hbo' || raw.startsWith('el-x-')) {
    return undefined
  }
  const code = raw.split(/[-_/]/)[0]!
  if (!code || code === 'und') return undefined
  return code
}

/** Inject/reconcile CombinedHelps after panel/package membership changes. */
function reconcileCombinedHelps(
  pkg: { resources: Map<string, ResourceInfo>; panels: PanelConfig[] },
  languageCode?: string
): string[] {
  const ensured = ensureCombinedHelpsInWorkspace({
    resources: pkg.resources,
    panels: pkg.panels,
    languageCode,
  })
  pkg.resources = ensured.resources
  pkg.panels = ensured.panels as PanelConfig[]
  return ensured.removed
}

export function createResourceSlice(set: WorkspaceSet, get: WorkspaceGet): ResourceSlice {
  return {
    addResourceToPackage: (resource, options?: ResourceWriteOptions) => {
      const resourceInfo =
        resource.resourceKey && resource.catalogedAt
          ? (resource as ResourceInfo)
          : createResourceInfo(resource as Parameters<typeof createResourceInfo>[0])

      set((state) => {
        if (state.currentPackage) {
          state.currentPackage.resources.set(resourceInfo.key, resourceInfo)
          // Only pass gateway langs — UGNT (el-x-koine) / UHB must not drop GL CombinedHelps
          if (!options?.skipEnsure) {
            reconcileCombinedHelps(state.currentPackage, gatewayLanguageHint(resourceInfo))
          }
          state.isPackageModified = true
        }
      })
      finishResourceWrite(get, options)
    },

    removeResourceFromPackage: (resourceKey) => {
      const pruneKeys = new Set<string>([resourceKey])
      const pkg = get().currentPackage
      if (pkg) {
        for (const panel of pkg.panels) {
          for (const key of panel.resourceKeys) {
            if (key === resourceKey || extractBaseKey(key) === resourceKey) {
              pruneKeys.add(key)
            }
          }
        }
      }
      set((state) => {
        if (state.currentPackage) {
          // Drop panel membership for base + instance keys, then package entry
          for (const panel of state.currentPackage.panels) {
            panel.resourceKeys = panel.resourceKeys.filter(
              (k) => k !== resourceKey && extractBaseKey(k) !== resourceKey
            )
            panel.entries = (panel.entries ?? []).filter(
              (e) => e.instanceId !== resourceKey && extractBaseKey(e.instanceId) !== resourceKey
            )
          }
          state.currentPackage.resources.delete(resourceKey)
          for (const id of reconcileCombinedHelps(state.currentPackage)) {
            pruneKeys.add(id)
          }
          state.isPackageModified = true
        }
      })
      projectPanelsFromPackage(get().currentPackage, pruneKeys)
      get().autoSaveWorkspace()
    },

    assignResourceToPanel: (resourceKey, panelId, index, options?: ResourceWriteOptions) => {
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find((p) => p.id === panelId)
          if (
            panel &&
            !panel.resourceKeys.includes(resourceKey) &&
            !existingPanelInstanceId(panel.resourceKeys, resourceKey)
          ) {
            if (index !== undefined && index >= 0 && index <= panel.resourceKeys.length) {
              panel.resourceKeys.splice(index, 0, resourceKey)
            } else {
              panel.resourceKeys.push(resourceKey)
            }
            if (!options?.skipEnsure) reconcileCombinedHelps(state.currentPackage)
            state.isPackageModified = true
          }
        }
      })
      finishResourceWrite(get, options)
    },

    removeResourceFromPanel: (resourceKey, panelId) => {
      const pruneKeys = new Set<string>([resourceKey])
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find((p) => p.id === panelId)
          if (panel) {
            panel.resourceKeys = panel.resourceKeys.filter((k) => k !== resourceKey)
            panel.entries = (panel.entries ?? []).filter((e) => e.instanceId !== resourceKey)
            for (const id of reconcileCombinedHelps(state.currentPackage)) {
              pruneKeys.add(id)
            }
            state.isPackageModified = true
          }
        }
      })
      projectPanelsFromPackage(get().currentPackage, pruneKeys)
      get().autoSaveWorkspace()
    },

    moveResourceBetweenPanels: (resourceKey, fromPanelId, toPanelId, insertIndex) => {
      set((state) => {
        if (state.currentPackage) {
          const fromPanel = state.currentPackage.panels.find((p) => p.id === fromPanelId)
          const toPanel = state.currentPackage.panels.find((p) => p.id === toPanelId)

          if (fromPanel && toPanel && !existingPanelInstanceId(toPanel.resourceKeys, resourceKey)) {
            fromPanel.resourceKeys = fromPanel.resourceKeys.filter((k) => k !== resourceKey)
            fromPanel.entries = (fromPanel.entries ?? []).filter((e) => e.instanceId !== resourceKey)
            if (fromPanel.activeIndex >= fromPanel.resourceKeys.length) {
              fromPanel.activeIndex = Math.max(0, fromPanel.resourceKeys.length - 1)
            }
            if (!toPanel.resourceKeys.includes(resourceKey)) {
              if (
                insertIndex !== undefined &&
                insertIndex >= 0 &&
                insertIndex <= toPanel.resourceKeys.length
              ) {
                toPanel.resourceKeys.splice(insertIndex, 0, resourceKey)
              } else {
                toPanel.resourceKeys.push(resourceKey)
              }
            }
            reconcileCombinedHelps(state.currentPackage)
            // Active follows the dragged key on the destination panel
            const dest = state.currentPackage.panels.find((p) => p.id === toPanelId)
            if (dest) {
              const idx = dest.resourceKeys.indexOf(resourceKey)
              if (idx >= 0) dest.activeIndex = idx
            }
            state.isPackageModified = true
          }
        }
      })
      projectPanelsFromPackage(get().currentPackage)
      get().autoSaveWorkspace()
    },

    reorderResourceInPanel: (resourceKey, panelId, newIndex) => {
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find((p) => p.id === panelId)
          if (panel) {
            const currentIndex = panel.resourceKeys.indexOf(resourceKey)
            if (currentIndex !== -1 && newIndex >= 0 && newIndex < panel.resourceKeys.length) {
              panel.resourceKeys.splice(currentIndex, 1)
              // Rightward: after remove, indices above currentIndex shift down by 1
              const insertAt = newIndex > currentIndex ? newIndex - 1 : newIndex
              panel.resourceKeys.splice(insertAt, 0, resourceKey)
              if (panel.entries && panel.entries.length > 0) {
                const byId = new Map(panel.entries.map((e) => [e.instanceId, e]))
                const ordered = panel.resourceKeys
                  .map((k) => byId.get(k))
                  .filter((e): e is NonNullable<typeof e> => Boolean(e))
                const rest = panel.entries.filter((e) => !panel.resourceKeys.includes(e.instanceId))
                panel.entries = [...ordered, ...rest]
              }
              // Active follows the dragged key
              panel.activeIndex = panel.resourceKeys.indexOf(resourceKey)
              state.isPackageModified = true
            }
          }
        }
      })
      get().autoSaveWorkspace()
    },

    setActiveResourceInPanel: (panelId, index) => {
      const current = get().currentPackage?.panels.find((p) => p.id === panelId)
      if (!current || current.activeIndex === index) return
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find((p) => p.id === panelId)
          if (panel) {
            panel.activeIndex = index
            state.isPackageModified = true
          }
        }
      })
      scheduleWorkspacePersist(() => get().currentPackage)
    },

    hasResourceInPackage: (resourceKey) => {
      const pkg = get().currentPackage
      return pkg ? pkg.resources.has(resourceKey) : false
    },

    getPanel: (panelId) => {
      const pkg = get().currentPackage
      return pkg?.panels.find((p) => p.id === panelId)
    },

    getPanels: () => {
      const pkg = get().currentPackage
      return pkg?.panels.sort((a, b) => a.position - b.position) || []
    },

    getResourcesForPanel: (panelId) => {
      const pkg = get().currentPackage
      if (!pkg) return []

      const panel = pkg.panels.find((p) => p.id === panelId)
      if (!panel || !panel.resourceKeys) return []

      return panel.resourceKeys
        .map((instanceKey) => {
          return pkg.resources.get(instanceKey) || pkg.resources.get(extractBaseKey(instanceKey))
        })
        .filter((r): r is ResourceInfo => r !== undefined)
    },

    getActiveResourceForPanel: (panelId) => {
      const pkg = get().currentPackage
      if (!pkg) return null

      const panel = pkg.panels.find((p) => p.id === panelId)
      if (!panel || !panel.resourceKeys || panel.resourceKeys.length === 0) return null

      const activeIndex =
        typeof panel.activeIndex === 'number' &&
        panel.activeIndex >= 0 &&
        panel.activeIndex < panel.resourceKeys.length
          ? panel.activeIndex
          : 0

      const activeInstanceKey = panel.resourceKeys[activeIndex]
      if (!activeInstanceKey) return null
      return (
        pkg.resources.get(activeInstanceKey) ||
        pkg.resources.get(extractBaseKey(activeInstanceKey)) ||
        null
      )
    },
  }
}
