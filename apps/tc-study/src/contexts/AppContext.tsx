/**
 * AppContext - Manages app-level state (resources, packages, workspace)
 * 
 * Responsibilities:
 * - Loaded resources
 * - Active package
 * - Anchor resource (primary scripture that provides book list)
 * - Resource lifecycle
 */

import { createContext, useContext, ReactNode } from 'react'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ResourceInfo } from './types'

// ============================================================================
// ZUSTAND STORE
// ============================================================================

interface AppState {
  loadedResources: Record<string, ResourceInfo>
  anchorResourceId: string | null
  /** Resource id of the last active scripture viewer (for book title resolution when anchor has no ingredients yet). */
  lastActiveScriptureResourceId: string | null
  isInitialized: boolean
}

interface AppActions {
  setAnchorResource: (resourceId: string, toc: ResourceInfo['toc']) => void
  setLastActiveScriptureResource: (resourceId: string | null) => void
  addResource: (resource: ResourceInfo) => void
  /** Batch update: one store write so one re-render when e.g. Phase 2 metadata is cached. */
  addResources: (resources: ResourceInfo[]) => void
  removeResource: (resourceId: string) => void
  getResource: (resourceId: string) => ResourceInfo | undefined
  getAnchorResource: () => ResourceInfo | undefined
  /** Resource to use for getBookTitle: last active scripture (has ingredients) else anchor. */
  getBookTitleSource: () => ResourceInfo | undefined
}

type AppStore = AppState & AppActions

export const useAppStore = create<AppStore>()(
  immer((set, get) => ({
    // Initial state
    loadedResources: {},
    anchorResourceId: null,
    lastActiveScriptureResourceId: null,
    isInitialized: false,

    setLastActiveScriptureResource: (resourceId) => {
      set((state) => {
        state.lastActiveScriptureResourceId = resourceId
      })
    },

    // Actions
    setAnchorResource: (resourceId: string, toc) => {
      set((state) => {
        // Check if TOC is already set and identical to prevent unnecessary updates
        const existingResource = state.loadedResources[resourceId]
        if (existingResource?.toc) {
          // Compare TOC books to see if it's the same
          const existingBooks = existingResource.toc?.books || []
          const newBooks = toc?.books || []
          if (
            existingBooks.length === newBooks.length &&
            existingBooks.every((b, i) => b.code === newBooks[i]?.code)
          ) {
            // TOC is already set and identical, skip update to prevent infinite loop
            return
          }
        }
        
        // ⚠️ IMPORTANT: DO NOT create a stub resource here!
        // The resource should already exist with full metadata from addResource()
        // If it doesn't exist, something is wrong with the initialization order
        if (!state.loadedResources[resourceId]) {
          console.warn(`⚠️ setAnchorResource called for ${resourceId} but resource doesn't exist in loadedResources!`)
          state.loadedResources[resourceId] = {
            id: resourceId,
            key: resourceId,
            title: resourceId,
            type: 'scripture',
            category: 'scripture',
          }
        }
        // Update with TOC (preserve all existing metadata)
        state.loadedResources[resourceId].toc = toc
        state.anchorResourceId = resourceId
        state.isInitialized = true
      })
    },

    addResource: (resource: ResourceInfo) => {
      set((state) => {
        // Use resource.id as the storage key to support multiple instances (e.g., "resource#2")
        // The id field contains the instance ID, while key contains the base resource key
        state.loadedResources[resource.id] = resource
      })
      // Resource added (removed verbose logging)
    },

    addResources: (resources: ResourceInfo[]) => {
      if (resources.length === 0) return
      set((state) => {
        for (const resource of resources) {
          state.loadedResources[resource.id] = resource
        }
      })
    },

    removeResource: (resourceId: string) => {
      set((state) => {
        delete state.loadedResources[resourceId]
      })
      console.log('🗑️ Resource removed from app:', resourceId)
    },

    getResource: (resourceId: string) => {
      return get().loadedResources[resourceId]
    },

    getAnchorResource: () => {
      const anchorId = get().anchorResourceId
      return anchorId ? get().loadedResources[anchorId] : undefined
    },

    getBookTitleSource: () => {
      const state = get()
      const lastId = state.lastActiveScriptureResourceId
      const last = lastId ? state.loadedResources[lastId] : undefined
      if (last) return last
      const anchorId = state.anchorResourceId
      return anchorId ? state.loadedResources[anchorId] : undefined
    },
  }))
)

// ============================================================================
// CONTEXT (Simplified - just pass through the store)
// ============================================================================

const AppContext = createContext<ReturnType<typeof useAppStore> | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const store = useAppStore()

  return <AppContext.Provider value={store}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}

// Selector hooks
export function useAnchorResource() {
  const resource = useAppStore((s) => s.getAnchorResource())
  return resource
}

/** Resource to use for getBookTitle (last active scripture else anchor). Use in nav bar and help viewers. */
export function useBookTitleSource() {
  // Subscribe to the actual state so we re-render when loadedResources[id] is updated (e.g. ingredients added in Phase 2)
  const lastResource = useAppStore((s) => {
    const id = s.lastActiveScriptureResourceId
    return id ? s.loadedResources[id] : undefined
  })
  const anchorResource = useAppStore((s) => {
    const id = s.anchorResourceId
    return id ? s.loadedResources[id] : undefined
  })
  return lastResource ?? anchorResource
}