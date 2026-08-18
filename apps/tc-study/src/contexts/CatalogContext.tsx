/**
 * CatalogContext - Provides catalog system to the entire app
 * 
 * This context initializes and provides:
 * - CatalogManager (orchestrates three-tier caching)
 * - ViewerRegistry (dynamic UI component resolution)
 * - ScriptureLoader (registered resource type)
 * 
 * All resource loading and viewing goes through this system.
 *
 * Ready gate (`useCatalogReady` / `ready`): app services + types ready —
 * core services constructed AND resource type plugins registered
 * (ResourceTypeInitializer). Not "catalog downloaded"; never awaits Door43.
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { CatalogManager, ViewerRegistry, type CatalogConfig } from '@bt-synergy/catalog-manager'
import { getDoor43ApiClient, type Door43ApiClient } from '@bt-synergy/door43-api'
import {
  PanelEntryRegistry,
  PanelGroupRegistry,
  PanelModeRegistry,
  ResourceTypeRegistry,
} from '@bt-synergy/resource-types'
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { LoaderRegistry } from '../lib/loaders/LoaderRegistry'
import { setActiveRegistries } from '../resourceTypes/activeRegistry'
import { BackgroundDownloadManager } from '../lib/services/BackgroundDownloadManager'
import { ResourceCompletenessChecker } from '../lib/services/ResourceCompletenessChecker'
import { ResourceLoadingService } from '../lib/services/ResourceLoadingService'
// NOTE: Resource types are registered asynchronously via ResourceTypeInitializer
// to avoid circular dependencies — see markResourceTypesReady / Failed.

// ============================================================================
// CONTEXT
// ============================================================================

interface CatalogContextValue {
  catalogManager: CatalogManager
  viewerRegistry: ViewerRegistry
  resourceTypeRegistry: ResourceTypeRegistry
  panelEntryRegistry: PanelEntryRegistry
  panelModeRegistry: PanelModeRegistry
  panelGroupRegistry: PanelGroupRegistry
  loaderRegistry: LoaderRegistry
  resourceLoadingService: ResourceLoadingService
  backgroundDownloadManager: BackgroundDownloadManager
  completenessChecker: ResourceCompletenessChecker
  cacheAdapter: IndexedDBCacheAdapter
  /** True after core catalog services are constructed (no network wait). */
  servicesReady: boolean
  /** True after ResourceTypeInitializer has registered plugins successfully. */
  resourceTypesReady: boolean
  /** Set when plugin registration fails (fail-closed; ready stays false). */
  resourceTypesError: Error | null
  /** True when servicesReady AND resourceTypesReady (app services + types gate). */
  ready: boolean
  /** Called by ResourceTypeInitializer on successful registration. */
  markResourceTypesReady: () => void
  /** Called by ResourceTypeInitializer on registration failure (fail-closed). */
  markResourceTypesFailed: (error: unknown) => void
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [servicesReady, setServicesReady] = useState(false)
  const [resourceTypesReady, setResourceTypesReady] = useState(false)
  const [resourceTypesError, setResourceTypesError] = useState<Error | null>(null)

  const services = useMemo(() => {
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

    // 2. Share main-thread Door43 singleton (same cache/rate-limit as App/wizards)
    const door43Client = getDoor43ApiClient({
      baseUrl: 'https://git.door43.org',
      debug: false,
    })

    // 3. Create CatalogManager (door43Client is consumed by CatalogManager though not on CatalogConfig)
    const catalogManager = new CatalogManager({
      catalogAdapter,
      cacheAdapter,
      door43Client,
      debug: false,
    } as CatalogConfig & { door43Client: Door43ApiClient })

    // 4. Create ViewerRegistry
    const viewerRegistry = new ViewerRegistry(false) // debug: false

    // Verbose service logs only in Vite dev — keep prod / worker-adjacent paths quiet
    const debug = import.meta.env.DEV === true

    // 5. Create LoaderRegistry (empty, will be populated from ResourceTypeRegistry)
    const loaderRegistry = new LoaderRegistry({
      debug,
    })

    // 6. Create unified ResourceTypeRegistry
    // Pass loaderRegistry so it can automatically register loaders there too
    const resourceTypeRegistry = new ResourceTypeRegistry({
      catalogManager,
      viewerRegistry,
      loaderRegistry,
      debug: false
    })
    const panelGroupRegistry = new PanelGroupRegistry()
    const panelModeRegistry = new PanelModeRegistry()
    const panelEntryRegistry = new PanelEntryRegistry({
      hasResourceType: (id) => resourceTypeRegistry.has(id),
      getResourceType: (id) => resourceTypeRegistry.get(id),
      getAllResourceTypes: () => resourceTypeRegistry.getAll(),
      viewerRegistry,
      debug: false,
    })
    setActiveRegistries({
      resourceTypes: resourceTypeRegistry,
      panelEntries: panelEntryRegistry,
      panelModes: panelModeRegistry,
      panelGroups: panelGroupRegistry,
    })
    
    // 7. Register all resource types
    // This automatically:
    // - Registers loaders with CatalogManager (via ResourceTypeRegistry)
    // - Registers loaders with LoaderRegistry (via ResourceTypeRegistry)
    // - Registers viewers with ViewerRegistry (via ResourceTypeRegistry)
    // - Creates subject mappings
    
    // 7b. Auto-register internal app resource types
    // Note: Auto-registration will happen asynchronously in a useEffect
    // For now, no internal resource types are registered here
    
    // 9. Create ResourceLoadingService
    const resourceLoadingService = new ResourceLoadingService(loaderRegistry, debug)
    
    // 10. Create ResourceCompletenessChecker
    const completenessChecker = new ResourceCompletenessChecker({
      catalogManager,
      cacheAdapter,
      debug,
    })
    
    // 11. Create BackgroundDownloadManager with intelligent method selection
    const backgroundDownloadManager = new BackgroundDownloadManager(
      loaderRegistry,
      catalogManager,
      resourceTypeRegistry,
      {
        debug,
        downloadMethod: 'zip', // Prefer ZIP, auto-fallback to individual if no zipball available
        skipExisting: true, // Don't re-download already cached content
      },
      completenessChecker // Pass completeness checker for marking resources complete
    )
    

    return {
      catalogManager,
      viewerRegistry,
      resourceTypeRegistry,
      panelEntryRegistry,
      panelModeRegistry,
      panelGroupRegistry,
      loaderRegistry,
      resourceLoadingService,
      backgroundDownloadManager,
      completenessChecker,
      cacheAdapter,
    }
  }, []) // Only initialize once

  useEffect(() => {
    setServicesReady(true)
  }, [services.catalogManager])

  const markResourceTypesReady = useCallback(() => {
    setResourceTypesError(null)
    setResourceTypesReady(true)
  }, [])

  const markResourceTypesFailed = useCallback((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error))
    setResourceTypesError(err)
    setResourceTypesReady(false)
  }, [])

  const ready = servicesReady && resourceTypesReady

  const contextValue = useMemo(
    () => ({
      ...services,
      servicesReady,
      resourceTypesReady,
      resourceTypesError,
      ready,
      markResourceTypesReady,
      markResourceTypesFailed,
    }),
    [
      services,
      servicesReady,
      resourceTypesReady,
      resourceTypesError,
      ready,
      markResourceTypesReady,
      markResourceTypesFailed,
    ]
  )

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

export function usePanelEntryRegistry() {
  return useCatalog().panelEntryRegistry
}

export function usePanelModeRegistry() {
  return useCatalog().panelModeRegistry
}

export function usePanelGroupRegistry() {
  return useCatalog().panelGroupRegistry
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

/** App gate: services constructed AND resource type plugins registered. */
export function useCatalogReady() {
  return useCatalog().ready
}

export function useCatalogServicesReady() {
  return useCatalog().servicesReady
}

export function useResourceTypesReady() {
  return useCatalog().resourceTypesReady
}

export function useResourceTypesError() {
  return useCatalog().resourceTypesError
}
