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
import { IndexedDBCatalogAdapter } from '../lib/adapters/IndexedDBCatalogAdapter'
import { Door43ApiClient } from '@bt-synergy/door43-api'
import { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { createContext, ReactNode, useContext, useEffect, useMemo } from 'react'
import { LoaderRegistry } from '../lib/loaders/LoaderRegistry'
import { ResourceLoadingService } from '../lib/services/ResourceLoadingService'
import { BackgroundDownloadManager } from '../lib/services/BackgroundDownloadManager'
import { ResourceCompletenessChecker } from '../lib/services/ResourceCompletenessChecker'
import { scriptureResourceType, translationAcademyResourceType, translationNotesResourceType, translationWordsLinksResourceType, translationWordsResourceType } from '../resourceTypes'

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
    console.log('📦 Registering resource types...')
    
    // 7a. Register external package-based resource types
    resourceTypeRegistry.register(scriptureResourceType)
    resourceTypeRegistry.register(translationWordsResourceType)
    resourceTypeRegistry.register(translationWordsLinksResourceType)
    resourceTypeRegistry.register(translationAcademyResourceType)
    resourceTypeRegistry.register(translationNotesResourceType)
    
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

  // Auto-register internal app resource types and load preloaded resources asynchronously
  useEffect(() => {
    // Make catalog manager globally accessible for non-React code
    ;(window as any).__catalogManager__ = contextValue.catalogManager
    
    const initializeAsync = async () => {
      try {
        // Auto-register internal resource types
        const { autoRegisterResourceTypes } = await import('../resourceTypes/autoRegister')
        await autoRegisterResourceTypes(contextValue.resourceTypeRegistry)
        console.log('  ✓ Auto-registered internal resource types')

        // Load preloaded resources metadata (if available)
        // NOTE: DISABLED for web - we always fetch fresh from Door43 to avoid mismatches
        // Web requires internet anyway, so preloaded metadata can cause issues when
        // the API format changes (e.g., Spanish resources use different structure)
        // 
        // const { initializePreloadedResources } = await import('../lib/preloadedResources')
        // await initializePreloadedResources(contextValue.catalogManager)
        console.log('  ✓ Skipping preloaded resources (web always fetches fresh from Door43)')
        
        // Signal that catalog initialization is complete
        ;(window as any).__catalogInitialized__ = true

      } catch (error) {
        console.error('Failed to initialize async resources:', error)
      }
    }
    
    initializeAsync()
  }, [contextValue.resourceTypeRegistry, contextValue.catalogManager])

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
