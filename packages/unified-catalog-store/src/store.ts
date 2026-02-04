/**
 * Unified Catalog Store Implementation
 * 
 * Zustand-based state management for resource catalog system
 */

import { create } from 'zustand'
import type {
    CacheOptions,
    CatalogQuery,
    CatalogStoreConfig,
    CatalogStoreOptions,
    CatalogStoreState,
    PackageFilters,
    ResourceMetadata,
    ResourcePackage,
} from './types'

type SetState = (partial: Partial<CatalogStoreState> | ((state: CatalogStoreState) => Partial<CatalogStoreState>)) => void
type GetState = () => CatalogStoreState

/**
 * Create a unified catalog store
 */
export function createCatalogStore(
  config: CatalogStoreConfig,
  options: CatalogStoreOptions = {}
) {
  const { catalog, cache, packageManager } = config
  const { initialResources = [], initialPackages = [], autoLoadStats = true } = options
  
  return create<CatalogStoreState>((set: SetState, get: GetState) => ({
    // ===== INITIAL STATE =====
    resources: new Map(initialResources.map(r => [
      `${r.server}/${r.owner}/${r.language}/${r.resourceId}`,
      r
    ])),
    packages: new Map(initialPackages.map(p => [p.id, p])),
    stats: null,
    isLoading: false,
    error: null,
    
    // ===== RESOURCE ACTIONS =====
    
    loadResources: async (filters?: CatalogQuery) => {
      set({ isLoading: true, error: null })
      
      try {
        const result = await catalog.query(filters || {})
        const resourcesMap = new Map<string, ResourceMetadata>()
        
        for (const resource of result.resources) {
          const key = `${resource.server}/${resource.owner}/${resource.language}/${resource.resourceId}`
          resourcesMap.set(key, resource)
        }
        
        set({ resources: resourcesMap, isLoading: false })
        
        if (autoLoadStats) {
          get().refreshStats()
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to load resources',
          isLoading: false
        })
      }
    },
    
    addResource: async (metadata: ResourceMetadata) => {
      set({ isLoading: true, error: null })
      
      try {
        await catalog.addResource(metadata)
        
        const key = `${metadata.server}/${metadata.owner}/${metadata.language}/${metadata.resourceId}`
        const resources = new Map(get().resources)
        resources.set(key, metadata)
        
        set({ resources, isLoading: false })
        
        if (autoLoadStats) {
          get().refreshStats()
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to add resource',
          isLoading: false
        })
      }
    },
    
    updateResource: async (key: string, updates: Partial<ResourceMetadata>) => {
      try {
        await catalog.updateResource(key, updates)
        
        const resources = new Map(get().resources)
        const existing = resources.get(key)
        
        if (existing) {
          resources.set(key, { ...existing, ...updates })
          set({ resources })
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to update resource'
        })
      }
    },
    
    removeResource: async (key: string) => {
      set({ isLoading: true, error: null })
      
      try {
        await catalog.removeResource(key)
        
        const resources = new Map(get().resources)
        resources.delete(key)
        
        set({ resources, isLoading: false })
        
        if (autoLoadStats) {
          get().refreshStats()
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to remove resource',
          isLoading: false
        })
      }
    },
    
    refreshResources: async () => {
      await get().loadResources()
    },
    
    // ===== PACKAGE ACTIONS =====
    
    loadPackages: async (filters?: PackageFilters) => {
      if (!packageManager) {
        set({ error: 'Package manager not configured' })
        return
      }
      
      set({ isLoading: true, error: null })
      
      try {
        const packageList = await packageManager.listPackages(filters)
        const packagesMap = new Map<string, ResourcePackage>(
          packageList.map((p: ResourcePackage) => [p.id, p])
        )
        
        set({ packages: packagesMap, isLoading: false })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to load packages',
          isLoading: false
        })
      }
    },
    
    createPackage: async (pkg: ResourcePackage) => {
      if (!packageManager) {
        set({ error: 'Package manager not configured' })
        return
      }
      
      set({ isLoading: true, error: null })
      
      try {
        await packageManager.createPackage(pkg)
        
        const packages = new Map(get().packages)
        packages.set(pkg.id, pkg)
        
        set({ packages, isLoading: false })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to create package',
          isLoading: false
        })
      }
    },
    
    loadPackage: async (packageId: string) => {
      if (!packageManager) {
        throw new Error('Package manager not configured')
      }
      
      set({ isLoading: true, error: null })
      
      try {
        const result = await packageManager.loadPackage(packageId)
        
        // Update resources with loaded ones
        const resources = new Map(get().resources)
        for (const resource of result.resources) {
          const key = `${resource.server}/${resource.owner}/${resource.language}/${resource.resourceId}`
          resources.set(key, resource)
        }
        
        set({ resources, isLoading: false })
        
        return result
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to load package',
          isLoading: false
        })
        throw error
      }
    },
    
    updatePackage: async (packageId: string, updates: Partial<ResourcePackage>) => {
      if (!packageManager) {
        set({ error: 'Package manager not configured' })
        return
      }
      
      try {
        await packageManager.updatePackage(packageId, updates)
        
        const packages = new Map(get().packages)
        const existing = packages.get(packageId)
        
        if (existing) {
          packages.set(packageId, { ...existing, ...updates })
          set({ packages })
        }
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to update package'
        })
      }
    },
    
    deletePackage: async (packageId: string) => {
      if (!packageManager) {
        set({ error: 'Package manager not configured' })
        return
      }
      
      set({ isLoading: true, error: null })
      
      try {
        await packageManager.deletePackage(packageId)
        
        const packages = new Map(get().packages)
        packages.delete(packageId)
        
        set({ packages, isLoading: false })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to delete package',
          isLoading: false
        })
      }
    },
    
    // ===== CACHE ACTIONS =====
    
    cacheResource: async (key: string, content: any, options?: CacheOptions) => {
      if (!cache) {
        set({ error: 'Cache not configured' })
        return
      }
      
      try {
        await cache.set(key, content, options)
        
        // Update availability
        await get().updateResource(key, {
          availability: {
            ...(get().resources.get(key)?.availability || { online: true, offline: false, bundled: false }),
            offline: true
          }
        })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to cache resource'
        })
      }
    },
    
    getCachedResource: async (key: string) => {
      if (!cache) {
        throw new Error('Cache not configured')
      }
      
      try {
        return await cache.get(key)
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to get cached resource'
        })
        throw error
      }
    },
    
    clearCache: async () => {
      if (!cache) {
        set({ error: 'Cache not configured' })
        return
      }
      
      try {
        await cache.clear()
        
        // Update all resources to offline = false
        const resources = new Map(get().resources)
        for (const [key, resource] of resources.entries()) {
          if (resource) {
            resources.set(key, {
              ...resource,
              availability: {
                ...resource.availability,
                offline: false
              }
            })
          }
        }
        
        set({ resources })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to clear cache'
        })
      }
    },
    
    // ===== SELECTORS =====
    
    getResource: (key: string) => {
      return get().resources.get(key)
    },
    
    getOfflineResources: (filters?: CatalogQuery) => {
      const resources = Array.from(get().resources.values())
      return resources.filter((r: ResourceMetadata) => {
        if (!r.availability?.offline) return false
        
        // Apply additional filters
        if (filters?.language && r.language !== filters.language) return false
        if (filters?.owner && r.owner !== filters.owner) return false
        if (filters?.subject && r.subject !== filters.subject) return false
        
        return true
      })
    },
    
    getBundledResources: (filters?: CatalogQuery) => {
      const resources = Array.from(get().resources.values())
      return resources.filter((r: ResourceMetadata) => {
        if (!r.availability?.bundled) return false
        
        // Apply additional filters
        if (filters?.language && r.language !== filters.language) return false
        if (filters?.owner && r.owner !== filters.owner) return false
        
        return true
      })
    },
    
    getResourcesByLanguage: (language: string) => {
      const resources = Array.from(get().resources.values())
      return resources.filter((r: ResourceMetadata) => r.language === language)
    },
    
    getResourcesByOwner: (owner: string) => {
      const resources = Array.from(get().resources.values())
      return resources.filter((r: ResourceMetadata) => r.owner === owner)
    },
    
    getPackage: (packageId: string) => {
      return get().packages.get(packageId)
    },
    
    // ===== STATS =====
    
    refreshStats: async () => {
      try {
        const stats = await catalog.getStats()
        set({ stats })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Failed to refresh stats'
        })
      }
    },
    
    // ===== UTILITIES =====
    
    reset: () => {
      set({
        resources: new Map(),
        packages: new Map(),
        stats: null,
        isLoading: false,
        error: null
      })
    },
    
    setError: (error: string | null) => {
      set({ error })
    },
    
    setLoading: (isLoading: boolean) => {
      set({ isLoading })
    },
  }))
}
