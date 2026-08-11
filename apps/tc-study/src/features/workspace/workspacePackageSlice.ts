/**
 * Package lifecycle: load / create / update / save / collections / persistence hooks.
 */

import type { ResourcePackage } from '@bt-synergy/package-storage'
import { usePackageStore } from '../../lib/stores/packageStore'
import {
  namedCollectionToWorkspace,
  workspaceToNamedCollection,
} from './workspaceCollectionHelpers'
import {
  loadPersistedWorkspacePackage,
  persistWorkspacePackage,
} from './workspacePersistence'
import { collectPanelResourceKeys } from './projectPanelResourcesToAppStore'
import { projectPanelsFromPackage } from './workspaceProjection'
import {
  createEmptyPanels,
  type WorkspaceGet,
  type WorkspaceSet,
  type WorkspaceStore,
} from './workspaceTypes'

export type PackageSlice = Pick<
  WorkspaceStore,
  | 'loadPackage'
  | 'createNewPackage'
  | 'updatePackageInfo'
  | 'savePackage'
  | 'saveAsCollection'
  | 'loadFromCollection'
  | 'autoSaveWorkspace'
  | 'loadSavedWorkspace'
>

export function createPackageSlice(set: WorkspaceSet, get: WorkspaceGet): PackageSlice {
  return {
    loadPackage: (pkg) => {
      set((state) => {
        state.currentPackage = pkg
        state.isPackageModified = false
      })
      projectPanelsFromPackage(get().currentPackage)
    },

    createNewPackage: (name) => {
      const prevKeys = get().currentPackage
        ? [...collectPanelResourceKeys(get().currentPackage!.panels)]
        : []
      set((state) => {
        state.currentPackage = {
          id: `pkg_${Date.now()}`,
          name,
          version: '1.0.0',
          description: '',
          resources: new Map(),
          panels: createEmptyPanels(),
        }
        state.isPackageModified = false
      })
      // Empty layout + prune prior panel projection so layout ⊆ AppStore
      projectPanelsFromPackage(get().currentPackage, prevKeys)
    },

    updatePackageInfo: (updates) => {
      set((state) => {
        if (state.currentPackage) {
          Object.assign(state.currentPackage, updates)
          state.isPackageModified = true
        }
      })
    },

    savePackage: async () => {
      get().autoSaveWorkspace()
      set((state) => {
        state.isPackageModified = false
      })
    },

    saveAsCollection: async (name?, description?) => {
      const pkg = get().currentPackage
      if (!pkg) throw new Error('No workspace to save')

      const packageStore = usePackageStore.getState()
      const collectionName = name || pkg.name
      const existingCollection = packageStore.packages.find(
        (p) => p.name === collectionName || (p as { title?: string }).title === collectionName
      )

      const collection = workspaceToNamedCollection(pkg, {
        collectionName,
        description,
        existingId: existingCollection?.id,
        existingCreatedAt: existingCollection?.createdAt,
      })

      await packageStore.savePackage(collection as ResourcePackage)

      return collection.id
    },

    loadFromCollection: async (packageId) => {
      const packageStore = usePackageStore.getState()
      const collection = packageStore.getPackage(packageId)
      if (!collection) throw new Error(`Collection not found: ${packageId}`)

      const workspacePackage = namedCollectionToWorkspace(
        collection as Parameters<typeof namedCollectionToWorkspace>[0]
      )
      get().loadPackage(workspacePackage)
      packageStore.setActivePackage(packageId)
    },

    autoSaveWorkspace: () => {
      const pkg = get().currentPackage
      if (!pkg) return
      persistWorkspacePackage(pkg)
    },

    loadSavedWorkspace: async () => {
      const workspace = loadPersistedWorkspacePackage()
      if (!workspace) return false
      get().loadPackage(workspace)
      return true
    },
  }
}
