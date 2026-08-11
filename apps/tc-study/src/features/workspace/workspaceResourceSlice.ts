/**
 * Package resources + panel membership + read helpers.
 * Projection to AppStore runs after layout-changing mutations.
 */

import type { ResourceInfo } from '../../contexts/types'
import { createResourceInfo } from '../../utils/resourceInfo'
import { ensureCombinedHelpsInWorkspace } from '../helps/ensureCombinedHelps'
import { getBaseResourceKey } from './projectPanelResourcesToAppStore'
import { projectPanelsFromPackage } from './workspaceProjection'
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
    addResourceToPackage: (resource) => {
      const resourceInfo =
        resource.resourceKey && resource.catalogedAt
          ? (resource as ResourceInfo)
          : createResourceInfo(resource as Parameters<typeof createResourceInfo>[0])

      set((state) => {
        if (state.currentPackage) {
          state.currentPackage.resources.set(resourceInfo.key, resourceInfo)
          // Only pass gateway langs — UGNT (el-x-koine) / UHB must not drop GL CombinedHelps
          reconcileCombinedHelps(state.currentPackage, gatewayLanguageHint(resourceInfo))
          state.isPackageModified = true
        }
      })

      projectPanelsFromPackage(get().currentPackage)
      get().autoSaveWorkspace()
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

    assignResourceToPanel: (resourceKey, panelId, index) => {
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find((p) => p.id === panelId)
          if (panel && !panel.resourceKeys.includes(resourceKey)) {
            if (index !== undefined && index >= 0 && index <= panel.resourceKeys.length) {
              panel.resourceKeys.splice(index, 0, resourceKey)
            } else {
              panel.resourceKeys.push(resourceKey)
            }
            reconcileCombinedHelps(state.currentPackage)
            state.isPackageModified = true
          }
        }
      })
      projectPanelsFromPackage(get().currentPackage)
      get().autoSaveWorkspace()
    },

    removeResourceFromPanel: (resourceKey, panelId) => {
      const pruneKeys = new Set<string>([resourceKey])
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find((p) => p.id === panelId)
          if (panel) {
            panel.resourceKeys = panel.resourceKeys.filter((k) => k !== resourceKey)
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

          if (fromPanel && toPanel) {
            fromPanel.resourceKeys = fromPanel.resourceKeys.filter((k) => k !== resourceKey)
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
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find((p) => p.id === panelId)
          if (panel) {
            panel.activeIndex = index
            state.isPackageModified = true
          }
        }
      })
      get().autoSaveWorkspace()
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
