/**
 * WorkspaceContext - Zustand-based workspace state management
 * 
 * This context manages the workspace-level state using the new resource configuration architecture:
 * - Declarative resource configuration from APP_RESOURCES
 * - Resource Manager orchestration with configured adapters
 * - Anchor resource identification and management
 * - Panel configuration generation from resource declarations
 */

import { LinkedPanelsConfig } from 'linked-panels'
import { createContext, useContext, useEffect, useRef } from 'react'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { getAppConfig } from '../config/global-config'
import { createResourceManager } from '../services/resources/ResourceManager'
import { createPlatformStorageAdapter } from '../services/storage/PlatformStorageFactory'
import {
    BaseResource,
    LoadingState,
    ResourceMetadata,
    ResourceType,
    StorageInfo,
    WorkspaceProviderProps,
    WorkspaceStore
} from '../types/context'

import { ProcessedContent } from '../types/processed-content'
import { PanelLayout, ResourcePackage } from '../types/resource-package'

// Import the new resource configuration system
import {
    getAppResourceConfig,
    initializeAppResources
} from '../services/resource-config'

// ============================================================================
// ZUSTAND STORE DEFINITION
// ============================================================================

const useWorkspaceStore = create<WorkspaceStore>()(
  devtools(
    immer((set, get) => ({
      // ========================================================================
      // INITIAL STATE
      // ========================================================================
      owner: '',
      language: '',
      server: getAppConfig().defaultServer,
      
      // Resource management (enhanced with ResourceManager and resource config)
      resourceManager: null,
      resources: {},
      resourceMetadata: {},
      anchorResource: null,
      anchorResourceId: null,
      
      // Resource configuration
      resourceConfigs: [],
      processedResourceConfig: null,
      
      // Package management
      activePackage: null,
      customPanelLayout: null,  // Custom layout overriding package default
      
      panelConfig: null,
      initializing: false,
      workspaceReady: false,  // Workspace is ready (resources loaded)
      navigationReady: false, // Navigation is ready (anchor content loaded)
      appReady: false,  // App is fully ready (workspace + navigation + anchor content)
      loadingStates: {},
      errors: {},
      storageInfo: null,

      // ========================================================================
      // WORKSPACE MANAGEMENT ACTIONS
      // ========================================================================
      
      initializeWorkspace: async (
        owner: string, 
        language: string, 
        server = getAppConfig().defaultServer,
        resourceMode: 'minimal' | 'default' | 'comprehensive' = 'default'
      ) => {
        const currentState = get()
        
        // Prevent re-initialization if already initializing or initialized with same params
        if (currentState.initializing) {
                    return
        }
        
        if (currentState.owner === owner && 
            currentState.language === language && 
            currentState.server === server && 
            currentState.resourceManager !== null &&
            currentState.workspaceReady) {
                    return
        }
        
                
        set((state) => {
          state.owner = owner
          state.language = language
          state.server = server
          state.initializing = true
          state.workspaceReady = false
          state.navigationReady = false
          state.appReady = false
          state.errors = {}
        })

        try {
          // Step 1: Get resource configuration based on mode
                    const resourceConfigs = getAppResourceConfig(resourceMode)
          
          set((state) => {
            state.resourceConfigs = resourceConfigs
          })
          
                    
          // Step 2: Initialize storage and ResourceManager (platform-specific)
                    const storageAdapter = createPlatformStorageAdapter()
          const resourceManager = createResourceManager()
          
          // Initialize storage first
          await storageAdapter.initialize()
          
          // Step 3: Use the new resource configuration system
                    const { processedConfig, panelConfig, anchorResource } = await initializeAppResources(
            resourceConfigs,
            { server, owner, language },
            storageAdapter,
            resourceManager
          )
          
          // Step 4: Update workspace state with processed configuration

          set((state) => {
            state.resourceManager = resourceManager
            state.processedResourceConfig = processedConfig
            state.panelConfig = panelConfig
            state.anchorResource = anchorResource.metadata
            state.anchorResourceId = anchorResource.metadata.id
            
            // Convert processed metadata to the existing format for compatibility
            state.resourceMetadata = {}
            processedConfig.forEach(config => {
              state.resourceMetadata[config.metadata.id] = config.metadata
            })
          })
          
                    
          // Step 5: Load initial storage info (non-blocking)
          get().refreshStorageInfo().catch(error => {
            console.warn('⚠️ Failed to refresh storage info:', error)
          })
          
                    
          set((state) => {
            state.initializing = false
            state.workspaceReady = true  // Workspace is ready - resources loaded, but navigation not yet ready
          })
          
                  } catch (error) {
          console.error('❌ Failed to initialize workspace:', error)
          
          set((state) => {
            state.initializing = false
            state.workspaceReady = false
            state.navigationReady = false
            state.appReady = false
            state.errors.workspace = error instanceof Error ? error.message : 'Unknown error'
          })
        }
      },

      resetWorkspace: () => {
                
        set((state) => {
          state.owner = ''
          state.language = ''
          state.server = getAppConfig().defaultServer
          state.resourceManager = null
          state.resources = {}
          state.resourceMetadata = {}
          state.anchorResource = null
          state.anchorResourceId = null
          
          // Reset resource configuration
          state.resourceConfigs = []
          state.processedResourceConfig = null
          
          state.panelConfig = null
          state.initializing = false
          state.workspaceReady = false
          state.navigationReady = false
          state.appReady = false
          state.loadingStates = {}
          state.errors = {}
          state.storageInfo = null
        })
      },

      // ========================================================================
      // NAVIGATION READINESS TRACKING
      // ========================================================================
      
      setNavigationReady: (ready: boolean) => {
                
        set((state) => {
          state.navigationReady = ready
          // App is ready when both workspace and navigation are ready
          state.appReady = state.workspaceReady && ready
        })
        
        if (ready) {
                  }
      },

      isWorkspaceReady: () => {
        return get().workspaceReady
      },

      isNavigationReady: () => {
        return get().navigationReady
      },

      isAppReady: () => {
        return get().appReady
      },

      // ========================================================================
      // RESOURCE MANAGER INTEGRATION
      // ========================================================================

      refreshResourceMetadata: async () => {
                // Re-initialize the workspace to refresh all resources
        const { owner, language, server } = get()
        if (owner && language) {
          await get().initializeWorkspace(owner, language, server)
        }
      },

      loadInitialAnchorContent: async (bookCode?: string) => {
        const { anchorResource, anchorResourceId, resourceManager } = get()
        
        if (!anchorResource || !anchorResourceId || !resourceManager) {
                    return
        }

        try {
          // Use provided book code, or fall back to first book from anchor resource
          const targetBook = bookCode || anchorResource.toc?.books?.[0]?.code || 'gen'
          const contentKey = `${anchorResource.server}/${anchorResource.owner}/${anchorResource.language}/${anchorResourceId}/${targetBook}`
          
                    
          // This will cache the content for faster navigation
          await resourceManager.getOrFetchContent(contentKey, anchorResource.type)
          
                  } catch (error) {
          console.warn('⚠️ Failed to load initial anchor content:', error)
          // Don't throw - this is not critical for app initialization
        }
      },

      getOrFetchContent: async (key: string, resourceType: ResourceType): Promise<ProcessedContent | null> => {
        const { resourceManager } = get()
        
        if (!resourceManager) {
          throw new Error('ResourceManager not initialized')
        }

                
        try {
          return await resourceManager.getOrFetchContent(key, resourceType)
        } catch (error) {
          console.error(`❌ Failed to get content for ${key}:`, error)
          throw error
        }
      },

      preloadContent: async (keys: string[], resourceType: ResourceType) => {
        const { resourceManager } = get()
        
        if (!resourceManager) {
          throw new Error('ResourceManager not initialized')
        }

                
        try {
          await resourceManager.preloadContent(keys, resourceType)
                  } catch (error) {
          console.error('❌ Failed to preload content:', error)
          throw error
        }
      },

      setAnchorResource: (resource: ResourceMetadata) => {
                
        set((state) => {
          state.anchorResource = resource
        })
      },

      getAnchorResource: (): ResourceMetadata | null => {
        return get().anchorResource
      },

      clearCache: async () => {
        const { resourceManager } = get()
        
        if (!resourceManager) {
          throw new Error('ResourceManager not initialized')
        }

                
        try {
          // Use ResourceManager's clearExpiredContent method
          await resourceManager.clearExpiredContent()
          await get().refreshStorageInfo()
                  } catch (error) {
          console.error('❌ Failed to clear cache:', error)
          throw error
        }
      },

      // ========================================================================
      // PACKAGE MANAGEMENT ACTIONS
      // ========================================================================
      
      setActivePackage: (pkg: ResourcePackage) => {
        set((state) => {
          state.activePackage = pkg
        })
      },
      
      getActivePackage: (): ResourcePackage | null => {
        return get().activePackage
      },
      
      // ========================================================================
      // PANEL LAYOUT MANAGEMENT ACTIONS
      // ========================================================================
      
      moveResourceToPanel: (resourceId: string, targetPanelId: string, position?: number) => {
        set((state) => {
          if (!state.customPanelLayout) {
            // Initialize custom layout from current package
            if (state.activePackage?.panelLayout) {
              state.customPanelLayout = JSON.parse(JSON.stringify(state.activePackage.panelLayout))
            } else {
              return
            }
          }
          
          // Find source and target panels
          const panels = state.customPanelLayout!.panels
          let sourcePanel = null
          let targetPanel = null
          
          for (const panel of panels) {
            if (panel.resourceIds.includes(resourceId)) {
              sourcePanel = panel
            }
            if (panel.id === targetPanelId) {
              targetPanel = panel
            }
          }
          
          if (sourcePanel && targetPanel && sourcePanel !== targetPanel) {
            // Remove from source
            sourcePanel.resourceIds = sourcePanel.resourceIds.filter(id => id !== resourceId)
            
            // Add to target at position
            if (position !== undefined && position >= 0 && position <= targetPanel.resourceIds.length) {
              targetPanel.resourceIds.splice(position, 0, resourceId)
            } else {
              targetPanel.resourceIds.push(resourceId)
            }
            
            // Update default if needed
            if (sourcePanel.defaultResourceId === resourceId && sourcePanel.resourceIds.length > 0) {
              sourcePanel.defaultResourceId = sourcePanel.resourceIds[0]
            }
            if (!targetPanel.defaultResourceId) {
              targetPanel.defaultResourceId = resourceId
            }
          }
        })
      },
      
      reorderResourcesInPanel: (panelId: string, orderedIds: string[]) => {
        set((state) => {
          if (!state.customPanelLayout) {
            if (state.activePackage?.panelLayout) {
              state.customPanelLayout = JSON.parse(JSON.stringify(state.activePackage.panelLayout))
            } else {
              return
            }
          }
          
          const panel = state.customPanelLayout!.panels.find(p => p.id === panelId)
          if (panel) {
            panel.resourceIds = orderedIds
          }
        })
      },
      
      resetPanelLayout: () => {
        set((state) => {
          state.customPanelLayout = null
        })
      },
      
      getPanelLayout: (): PanelLayout | null => {
        const state = get()
        return state.customPanelLayout || state.activePackage?.panelLayout || null
      },

      getStorageInfo: async (): Promise<StorageInfo> => {
        const { resourceManager } = get()
        
        if (!resourceManager) {
          throw new Error('ResourceManager not initialized')
        }

        return await resourceManager.getStorageInfo()
      },

      refreshStorageInfo: async () => {
        try {
          const storageInfo = await get().getStorageInfo()
          
          set((state) => {
            state.storageInfo = storageInfo
          })
          
                  } catch (error) {
          console.error('❌ Failed to refresh storage info:', error)
        }
      },

      // ========================================================================
      // RESOURCE MANAGEMENT ACTIONS
      // ========================================================================
      
      loadResource: async (resourceType: ResourceType, resourceId: string): Promise<BaseResource | null> => {
                
        set((state) => {
          state.loadingStates[resourceId] = { loading: true, message: `Loading ${resourceType}...` }
        })

        try {
          // Use real adapter for scripture resources
          if (resourceType === ResourceType.SCRIPTURE) {
            return await get().loadScriptureResource(resourceId)
          }
          
          // For other resource types, return mock for now
          const mockResource: BaseResource = {
            id: resourceId,
            type: resourceType,
            title: `Mock ${resourceType} Resource`,
            description: `Mock resource for ${resourceId}`,
            metadata: {}
          }

          set((state) => {
            state.resources[resourceId] = mockResource
            state.loadingStates[resourceId] = { loading: false }
          })

                    return mockResource
        } catch (error) {
          console.error(`❌ Failed to load resource ${resourceId}:`, error)
          
          set((state) => {
            state.loadingStates[resourceId] = { loading: false }
            state.errors[resourceId] = error instanceof Error ? error.message : 'Unknown error'
          })
          
          return null
        }
      },

      loadScriptureResource: async (resourceId: string): Promise<BaseResource | null> => {
        const { owner, language, server } = get()
        
        try {
          // Import the adapter
          const { door43ULTAdapter } = await import('../services/adapters/Door43ScriptureAdapter')
          
          // For now, assume we're loading Genesis (gen) - later this will be dynamic
          const bookCode = 'gen'
          
                    
          // Fetch the scripture content
          const scriptureContent = await door43ULTAdapter.getBookContent(server, owner, language, bookCode)
          
          // Create a scripture resource
          const scriptureResource: BaseResource = {
            id: resourceId,
            type: ResourceType.SCRIPTURE,
            title: `${scriptureContent.meta.book} (ULT)`,
            description: `Unfoldingword Literal Text - ${scriptureContent.meta.book}`,
            metadata: {
              bookCode: scriptureContent.meta.bookCode,
              book: scriptureContent.meta.book,
              chapters: scriptureContent.chapters.length,
              verses: scriptureContent.meta.totalVerses,
              content: scriptureContent // Store the processed content
            }
          }

          set((state) => {
            state.resources[resourceId] = scriptureResource
            state.loadingStates[resourceId] = { loading: false }
          })

                    return scriptureResource
        } catch (error) {
          console.error(`❌ Failed to load scripture ${resourceId}:`, error)
          
          set((state) => {
            state.loadingStates[resourceId] = { loading: false }
            state.errors[resourceId] = error instanceof Error ? error.message : 'Unknown error'
          })
          
          throw error
        }
      },

      getResource: (resourceId: string): BaseResource | null => {
        return get().resources[resourceId] || null
      },

      isResourceAvailable: (resourceId: string): boolean => {
        const metadata = get().resourceMetadata[resourceId]
        return metadata?.available || false
      },

      // ========================================================================
      // PANEL CONFIGURATION MANAGEMENT ACTIONS
      // ========================================================================

      updatePanelConfig: (config: LinkedPanelsConfig) => {
                
        set((state) => {
          state.panelConfig = config
        })
      },

      getPanelConfig: (): LinkedPanelsConfig | null => {
        return get().panelConfig
      },



      // ========================================================================
      // LOADING STATE MANAGEMENT ACTIONS
      // ========================================================================
      
      setLoadingState: (key: string, state: LoadingState) => {
        set((draft) => {
          draft.loadingStates[key] = state
        })
      },

      clearLoadingState: (key: string) => {
        set((state) => {
          delete state.loadingStates[key]
        })
      },

      // ========================================================================
      // ERROR MANAGEMENT ACTIONS
      // ========================================================================
      
      setError: (key: string, error: string) => {
        set((state) => {
          state.errors[key] = error
        })
      },

      clearError: (key: string) => {
        set((state) => {
          delete state.errors[key]
        })
      },

      clearAllErrors: () => {
        set((state) => {
          state.errors = {}
        })
      }
    })),
    { name: 'workspace-store' }
  )
)

// ============================================================================
// CONTEXT DEFINITION
// ============================================================================

const WorkspaceContext = createContext<WorkspaceStore | null>(null)

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export function WorkspaceProvider({ 
  children, 
  initialOwner = getAppConfig().defaultOwner,
  initialLanguage = getAppConfig().defaultLanguage, 
  initialServer = getAppConfig().defaultServer,
  resourceMode = 'default'
}: WorkspaceProviderProps & { 
  resourceMode?: 'minimal' | 'default' | 'comprehensive' 
}) {
  const store = useWorkspaceStore()
  const initializedRef = useRef(false)

  // Initialize workspace on mount (only once)
  useEffect(() => {
    
    if (initialOwner && initialLanguage && !initializedRef.current) {
            store.initializeWorkspace(initialOwner, initialLanguage, initialServer, resourceMode)
      initializedRef.current = true
    }
  }, [initialOwner, initialLanguage, initialServer, resourceMode]) // Remove store from dependencies

  return (
    <WorkspaceContext.Provider value={store}>
      {children}
    </WorkspaceContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

export function useWorkspace(): WorkspaceStore {
  const context = useContext(WorkspaceContext)
  if (!context) {
    console.error('❌ WorkspaceContext is null - component is outside WorkspaceProvider or provider failed to initialize')
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}

// ============================================================================
// SELECTOR HOOKS FOR PERFORMANCE
// ============================================================================

/**
 * Hook to subscribe to specific parts of the workspace state
 * This prevents unnecessary re-renders when unrelated state changes
 */
export function useWorkspaceSelector<T>(selector: (state: WorkspaceStore) => T): T {
  return useWorkspaceStore(selector)
}

/**
 * Hook to get workspace loading state
 */
// Stable selector for workspace loading to prevent infinite loops
const workspaceLoadingSelector = (state: WorkspaceStore) => {
  const hasErrors = Object.keys(state.errors).length > 0;
  return {
    initializing: state.initializing,
    loadingStates: state.loadingStates,
    hasErrors,
    errors: state.errors
  };
};

export function useWorkspaceLoading() {
  return useWorkspaceSelector(workspaceLoadingSelector);
}

/**
 * Hook to get workspace configuration
 */
// Stable selector for workspace config to prevent infinite loops
const workspaceConfigSelector = (state: WorkspaceStore) => ({
  owner: state.owner,
  language: state.language,
  server: state.server
});

export function useWorkspaceConfig() {
  return useWorkspaceSelector(workspaceConfigSelector);
}

/**
 * Hook to get resource information
 */
// Stable selector for workspace resources to prevent infinite loops
const workspaceResourcesSelector = (state: WorkspaceStore) => ({
  resources: state.resources,
  resourceMetadata: state.resourceMetadata,
  getResource: state.getResource,
  isResourceAvailable: state.isResourceAvailable,
  loadResource: state.loadResource
});

export function useWorkspaceResources() {
  return useWorkspaceSelector(workspaceResourcesSelector);
}

/**
 * Hook to get panel configuration
 */
export function useWorkspacePanels() {
  return useWorkspaceSelector((state) => state.panelConfig)
}

/**
 * Hook to get processed resource config
 */
// Stable selector for processed resource config to prevent infinite loops
const processedResourceConfigSelector = (state: WorkspaceStore) => state.processedResourceConfig;

export function useProcessedResourceConfig() {
  return useWorkspaceSelector(processedResourceConfigSelector);
}

/**
 * Hook to get workspace language only
 */
// Stable selector for workspace language to prevent infinite loops
const workspaceLanguageSelector = (state: WorkspaceStore) => state.language;

export function useWorkspaceLanguage() {
  return useWorkspaceSelector(workspaceLanguageSelector);
}

/**
 * Hook to get processed resource language only
 */
// Stable selector for processed resource language to prevent infinite loops
const processedResourceLanguageSelector = (state: WorkspaceStore) => state.processedResourceConfig?.language;

export function useProcessedResourceLanguage() {
  return useWorkspaceSelector(processedResourceLanguageSelector);
}

/**
 * Export the raw store for direct access (use with caution)
 */
export { useWorkspaceStore }

