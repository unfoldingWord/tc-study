/**
 * CatalogContext - Provides catalog system to the entire app
 * 
 * This context initializes and provides:
 * - CatalogManager (orchestrates three-tier caching)
 * - ViewerRegistry (dynamic UI component resolution)
 * - ScriptureLoader (registered resource type)
 * 
 * All resource loading and viewing goes through this system.
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { CatalogManager, ViewerRegistry } from '@bt-synergy/catalog-manager'
import { Door43ApiClient } from '@bt-synergy/door43-api'
import { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react'
import { IndexedDBCatalogAdapter } from '../lib/adapters/IndexedDBCatalogAdapter'
import { LoaderRegistry } from '../lib/loaders/LoaderRegistry'
import { BackgroundDownloadManager } from '../lib/services/BackgroundDownloadManager'
import { ResourceCompletenessChecker } from '../lib/services/ResourceCompletenessChecker'
import { ResourceLoadingService } from '../lib/services/ResourceLoadingService'
// NOTE: Resource types are registered asynchronously in useEffect to avoid circular dependencies

// ============================================================================
// CONTEXT
// ============================================================================

interface CatalogContextValue {
  catalogManager: CatalogManager
  viewerRegistry: ViewerRegistry
  resourceTypeRegistry: ResourceTypeRegistry
  loaderRegistry: LoaderRegistry
  resourceLoadingService: ResourceLoadingService
  backgroundDownloadManager: BackgroundDownloadManager
  completenessChecker: ResourceCompletenessChecker
  cacheAdapter: any // IndexedDBCacheAdapter
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const contextValue = useMemo(() => {
    // 1. Create storage adapters (using IndexedDB for both - worker compatible)
    const cacheAdapter = new IndexedDBCacheAdapter({
      dbName: 'tc-study-cache',
      storeName: 'cache-entries',
      version: 1
    })
    const catalogAdapter = new IndexedDBCatalogAdapter({
      dbName: 'tc-study-catalog',
      storeName: 'catalog-entries',
      version: 1
    })

    // 2. Create Door43 API client
    const door43Client = new Door43ApiClient({
      baseUrl: 'https://git.door43.org',
      debug: false
    })

    // 3. Create CatalogManager (door43Client passed via any cast - not in interface but expected)
    const catalogManager = new CatalogManager({
      catalogAdapter,
      cacheAdapter,
      door43Client, // Required for loaders even though not in CatalogConfig interface
      debug: false
    } as any)

    // 4. Create ViewerRegistry
    const viewerRegistry = new ViewerRegistry(false) // debug: false

    // 5. Create LoaderRegistry (empty, will be populated from ResourceTypeRegistry)
    const loaderRegistry = new LoaderRegistry({
      debug: true
    })

    // 6. Create unified ResourceTypeRegistry
    // Pass loaderRegistry so it can automatically register loaders there too
    const resourceTypeRegistry = new ResourceTypeRegistry({
      catalogManager,
      viewerRegistry,
      loaderRegistry,
      debug: false
    })
    
    // 7. Register all resource types
    // This automatically:
    // - Registers loaders with CatalogManager (via ResourceTypeRegistry)
    // - Registers loaders with LoaderRegistry (via ResourceTypeRegistry)
    // - Registers viewers with ViewerRegistry (via ResourceTypeRegistry)
    // - Creates subject mappings
    console.log('📦 ResourceTypeRegistry created (resource types will be registered asynchronously)')
    
    // 7b. Auto-register internal app resource types
    // Note: Auto-registration will happen asynchronously in a useEffect
    // For now, no internal resource types are registered here
    
    // 9. Create ResourceLoadingService
    const resourceLoadingService = new ResourceLoadingService(loaderRegistry, true)
    
    // 10. Create ResourceCompletenessChecker
    const completenessChecker = new ResourceCompletenessChecker({
      catalogManager,
      cacheAdapter,
      debug: true
    })
    
    // 11. Create BackgroundDownloadManager with intelligent method selection
    const backgroundDownloadManager = new BackgroundDownloadManager(
      loaderRegistry,
      catalogManager,
      resourceTypeRegistry,
      {
        debug: true,
        downloadMethod: 'zip', // Prefer ZIP, auto-fallback to individual if no zipball available
        skipExisting: true, // Don't re-download already cached content
      },
      completenessChecker // Pass completeness checker for marking resources complete
    )
    
    console.log('✅ Catalog system initialized:', {
      loaders: catalogManager.getSupportedTypes().length,
      subjects: resourceTypeRegistry.getSupportedSubjects().length
    })

    return {
      catalogManager,
      viewerRegistry,
      resourceTypeRegistry,
      loaderRegistry,
      resourceLoadingService,
      backgroundDownloadManager,
      completenessChecker,
      cacheAdapter
    }
  }, []) // Only initialize once

  // Expose catalog manager globally for non-React code and mark catalog ready
  useEffect(() => {
    ;(window as any).__catalogManager__ = contextValue.catalogManager
    ;(window as any).__catalogInitialized__ = true
  }, [contextValue.catalogManager])

  return (
    <CatalogContext.Provider value={contextValue}>
      {children}
    </CatalogContext.Provider>
  )
}

export function useCatalog() {
  const context = useContext(CatalogContext)
  if (!context) {
    throw new Error('useCatalog must be used within CatalogProvider')
  }
  return context
}

// Convenience hooks
export function useCatalogManager() {
  return useCatalog().catalogManager
}

export function useCompletenessChecker() {
  return useCatalog().completenessChecker
}

export function useViewerRegistry() {
  return useCatalog().viewerRegistry
}

export function useResourceTypeRegistry() {
  return useCatalog().resourceTypeRegistry
}

export function useLoaderRegistry() {
  return useCatalog().loaderRegistry
}

export function useResourceLoadingService() {
  return useCatalog().resourceLoadingService
}

export function useBackgroundDownloadManager() {
  return useCatalog().backgroundDownloadManager
}

export function useCacheAdapter() {
  return useCatalog().cacheAdapter
}
