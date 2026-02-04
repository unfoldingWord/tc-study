/**
 * React Hooks for Unified Catalog Store
 * 
 * Convenience hooks for common use cases
 */

import { useEffect, useMemo } from 'react'
import type { CatalogQuery, CatalogStoreState, PackageFilters, ResourceMetadata } from '../types'

/**
 * Hook to get a specific resource
 */
export function useResource(
  store: any,
  resourceKey: string
) {
  return store((state: CatalogStoreState) => state.resources.get(resourceKey))
}

/**
 * Hook to get all resources
 */
export function useResources(store: any): ResourceMetadata[] {
  const resources = store((state: CatalogStoreState) => state.resources)
  return useMemo(() => Array.from(resources.values()), [resources])
}

/**
 * Hook to get offline resources
 */
export function useOfflineResources(
  store: any,
  filters?: CatalogQuery
) {
  return store((state: CatalogStoreState) => 
    state.getOfflineResources(filters)
  )
}

/**
 * Hook to get bundled resources
 */
export function useBundledResources(
  store: any,
  filters?: CatalogQuery
) {
  return store((state: CatalogStoreState) => 
    state.getBundledResources(filters)
  )
}

/**
 * Hook to get resources by language
 */
export function useResourcesByLanguage(
  store: any,
  language: string
) {
  return store((state: CatalogStoreState) => 
    state.getResourcesByLanguage(language)
  )
}

/**
 * Hook to get resources by owner
 */
export function useResourcesByOwner(
  store: any,
  owner: string
) {
  return store((state: CatalogStoreState) => 
    state.getResourcesByOwner(owner)
  )
}

/**
 * Hook to get all packages
 */
export function usePackages(store: any) {
  const packages = store((state: CatalogStoreState) => state.packages)
  return useMemo(() => Array.from(packages.values()), [packages])
}

/**
 * Hook to get a specific package
 */
export function usePackage(
  store: any,
  packageId: string
) {
  return store((state: CatalogStoreState) => state.packages.get(packageId))
}

/**
 * Hook to get catalog stats
 */
export function useCatalogStats(store: any) {
  return store((state: CatalogStoreState) => state.stats)
}

/**
 * Hook to get loading state
 */
export function useIsLoading(store: any) {
  return store((state: CatalogStoreState) => state.isLoading)
}

/**
 * Hook to get error state
 */
export function useError(store: any) {
  return store((state: CatalogStoreState) => state.error)
}

/**
 * Hook to automatically load resources on mount
 */
export function useAutoLoadResources(
  store: any,
  filters?: CatalogQuery
) {
  const loadResources = store((state: CatalogStoreState) => state.loadResources)
  
  useEffect(() => {
    loadResources(filters)
  }, [loadResources, JSON.stringify(filters)])
  
  return useResources(store)
}

/**
 * Hook to automatically load packages on mount
 */
export function useAutoLoadPackages(
  store: any,
  filters?: PackageFilters
) {
  const loadPackages = store((state: CatalogStoreState) => state.loadPackages)
  
  useEffect(() => {
    loadPackages(filters)
  }, [loadPackages, JSON.stringify(filters)])
  
  return usePackages(store)
}

/**
 * Hook for resource actions
 */
export function useResourceActions(store: any) {
  return {
    loadResources: store((state: CatalogStoreState) => state.loadResources),
    addResource: store((state: CatalogStoreState) => state.addResource),
    updateResource: store((state: CatalogStoreState) => state.updateResource),
    removeResource: store((state: CatalogStoreState) => state.removeResource),
    refreshResources: store((state: CatalogStoreState) => state.refreshResources),
  }
}

/**
 * Hook for package actions
 */
export function usePackageActions(store: any) {
  return {
    loadPackages: store((state: CatalogStoreState) => state.loadPackages),
    createPackage: store((state: CatalogStoreState) => state.createPackage),
    loadPackage: store((state: CatalogStoreState) => state.loadPackage),
    updatePackage: store((state: CatalogStoreState) => state.updatePackage),
    deletePackage: store((state: CatalogStoreState) => state.deletePackage),
  }
}

/**
 * Hook for cache actions
 */
export function useCacheActions(store: any) {
  return {
    cacheResource: store((state: CatalogStoreState) => state.cacheResource),
    getCachedResource: store((state: CatalogStoreState) => state.getCachedResource),
    clearCache: store((state: CatalogStoreState) => state.clearCache),
  }
}

/**
 * Hook to check if a resource is cached
 */
export function useIsResourceCached(
  store: any,
  resourceKey: string
) {
  const resource = useResource(store, resourceKey)
  return resource?.availability.offline || false
}

/**
 * Hook to get available languages
 */
export function useAvailableLanguages(store: any) {
  const resources = useResources(store)
  
  return useMemo(() => {
    const languages = new Set<string>()
    resources.forEach((r: ResourceMetadata) => languages.add(r.language))
    return Array.from(languages).sort()
  }, [resources])
}

/**
 * Hook to get available owners
 */
export function useAvailableOwners(store: any) {
  const resources = useResources(store)
  
  return useMemo(() => {
    const owners = new Set<string>()
    resources.forEach((r: ResourceMetadata) => owners.add(r.owner))
    return Array.from(owners).sort()
  }, [resources])
}

/**
 * Hook to get available subjects
 */
export function useAvailableSubjects(store: any) {
  const resources = useResources(store)
  
  return useMemo(() => {
    const subjects = new Set<string>()
    resources.forEach((r: ResourceMetadata) => {
      if (r.subject) subjects.add(r.subject)
    })
    return Array.from(subjects).sort()
  }, [resources])
}

/**
 * Hook to search resources
 */
export function useResourceSearch(
  store: any,
  searchTerm: string
) {
  const resources = useResources(store)
  
  return useMemo(() => {
    if (!searchTerm) return resources
    
    const term = searchTerm.toLowerCase()
    return resources.filter((r: ResourceMetadata) => 
      r.title?.toLowerCase().includes(term) ||
      r.subject?.toLowerCase().includes(term) ||
      r.language.toLowerCase().includes(term) ||
      r.owner.toLowerCase().includes(term)
    )
  }, [resources, searchTerm])
}
