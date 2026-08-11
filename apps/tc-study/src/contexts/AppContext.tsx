/**
 * AppContext — AppStore read model for loaded resources (Unlock 3 seal).
 *
 * Responsibilities:
 * - `loadedResources` projection (read model; not layout membership SoT)
 * - Anchor / last-active scripture pointers
 * - Enrichment via `patchLoadedResources` (never creates membership keys)
 *
 * Panel membership SoT is `workspaceStore`. Membership upsert/prune lives in
 * `features/workspace/appStoreMembership.ts` (projector-only) — not on this
 * store's public action surface.
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
  /**
   * Enrichment-only: patch existing `loadedResources` keys (Phase 2 metadata, etc.).
   * Never creates membership — missing ids are skipped.
   * Membership upsert/prune: projector via `appStoreMembership` only.
   */
  patchLoadedResources: (resources: ResourceInfo[]) => void
  getResource: (resourceId: string) => ResourceInfo | undefined
  getAnchorResource: () => ResourceInfo | undefined
  /** Resource to use for getBookTitle: last active scripture (has ingredients) else anchor. */
  getBookTitleSource: () => ResourceInfo | undefined
}

type AppStore = AppState & AppActions

export type { AppStore }

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
    setAnchorResource: (resourceId, toc) => {
      set((state) => {
        const existingResource = state.loadedResources[resourceId]
        // Membership must come from the projector — never stub-create here.
        if (!existingResource) {
          console.warn(
            `⚠️ setAnchorResource called for ${resourceId} but resource doesn't exist in loadedResources!`
          )
          return
        }
        if (existingResource.toc) {
          const existingBooks = existingResource.toc?.books || []
          const newBooks = toc?.books || []
          if (
            existingBooks.length === newBooks.length &&
            existingBooks.every((b, i) => b.code === newBooks[i]?.code)
          ) {
            return
          }
        }
        existingResource.toc = toc
        state.anchorResourceId = resourceId
        state.isInitialized = true
      })
    },

    patchLoadedResources: (resources: ResourceInfo[]) => {
      if (resources.length === 0) return
      set((state) => {
        for (const resource of resources) {
          const existing = state.loadedResources[resource.id]
          if (!existing) continue

          const existingVerified = existing.verifiedIngredients

          // If Phase 1 verification ran before catalog metadata was saved it may have
          // produced an empty verifiedIngredients list (race condition).  When Phase 2
          // now supplies real ingredients, reset to undefined so the verification effect
          // re-runs with the actual ingredient list rather than keeping the stale [].
          const incomingIngredients: unknown[] | undefined =
            resource.ingredients ?? resource.contentMetadata?.ingredients
          const prematureEmptyVerification =
            existingVerified !== undefined &&
            existingVerified.length === 0 &&
            Array.isArray(incomingIngredients) &&
            incomingIngredients.length > 0

          state.loadedResources[resource.id] = {
            ...resource,
            // Preserve runtime-computed verification fields: metadata batch writes may use
            // stale snapshots captured before verification ran, so we must not let them
            // overwrite verifiedIngredients / verifiedRef that were set in the interim.
            // Exception: prematureEmptyVerification — reset to undefined to trigger re-verify.
            verifiedIngredients: prematureEmptyVerification
              ? undefined
              : existingVerified !== undefined
                ? existingVerified
                : resource.verifiedIngredients,
            ...(existing.verifiedRef !== undefined
              ? { verifiedRef: existing.verifiedRef }
              : {}),
          }
        }
      })
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

const AppContext = createContext<AppStore | null>(null)

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