/**
 * Panel CRUD on the current workspace package.
 */

import { projectPanelsFromPackage } from './workspaceProjection'
import type { PanelConfig, WorkspaceGet, WorkspaceSet, WorkspaceStore } from './workspaceTypes'

export type PanelSlice = Pick<
  WorkspaceStore,
  'addPanel' | 'removePanel' | 'reorderPanels' | 'renamePanel'
>

export function createPanelSlice(set: WorkspaceSet, get: WorkspaceGet): PanelSlice {
  return {
    addPanel: (name) => {
      const state = get()
      if (!state.currentPackage) return ''

      const newPanelId = `panel-${Date.now()}`
      const position = state.currentPackage.panels.length

      set((s) => {
        if (s.currentPackage) {
          s.currentPackage.panels.push({
            id: newPanelId,
            name: name || `Panel ${position + 1}`,
            resourceKeys: [],
            activeIndex: 0,
            position,
          })
          s.isPackageModified = true
        }
      })

      return newPanelId
    },

    removePanel: (panelId) => {
      const removedKeys =
        get().currentPackage?.panels.find((p) => p.id === panelId)?.resourceKeys?.slice() ?? []
      set((state) => {
        if (state.currentPackage) {
          state.currentPackage.panels = state.currentPackage.panels.filter((p) => p.id !== panelId)
          state.currentPackage.panels.forEach((panel, index) => {
            panel.position = index
          })
          state.isPackageModified = true
        }
      })
      projectPanelsFromPackage(get().currentPackage, removedKeys)
      get().autoSaveWorkspace()
    },

    reorderPanels: (panelIds) => {
      set((state) => {
        if (state.currentPackage) {
          const panelMap = new Map(state.currentPackage.panels.map((p) => [p.id, p]))
          state.currentPackage.panels = panelIds
            .map((id) => panelMap.get(id))
            .filter((p): p is PanelConfig => p !== undefined)
          state.currentPackage.panels.forEach((panel, index) => {
            panel.position = index
          })
          state.isPackageModified = true
        }
      })
    },

    renamePanel: (panelId, name) => {
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find((p) => p.id === panelId)
          if (panel) {
            panel.name = name
            state.isPackageModified = true
          }
        }
      })
    },
  }
}
