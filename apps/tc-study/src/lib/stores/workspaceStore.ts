/**
 * Workspace Store
 * 
 * Manages the current workspace state including:
 * - Active resource package
 * - Panel assignments
 * - Resource loading
 * - Package editing
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { ResourceInfo } from '../../contexts/types'
import { createResourceInfo } from '../../utils/resourceInfo'
import { ResourceType, ResourceFormat } from '@bt-synergy/resource-catalog'

export interface PanelConfig {
  id: string // Unique panel ID (e.g., 'panel-1', 'panel-2', 'panel-3')
  name: string // Display name (e.g., 'Panel 1', 'Left Panel')
  resourceKeys: string[] // Array of resourceKeys in this panel
  activeIndex: number // Which resource is currently active
  position: number // For ordering panels (0 = leftmost)
}

export interface WorkspacePackage {
  id: string
  name: string
  version: string
  description?: string
  resources: Map<string, ResourceInfo>
  panels: PanelConfig[] // Dynamic array of panels
}

interface WorkspaceState {
  // Current package
  currentPackage: WorkspacePackage | null
  isPackageModified: boolean
  
  // Resource selection wizard state
  wizardMode: 'load-package' | 'edit-workspace' | null
  wizardStep: 'languages' | 'organizations' | 'resources' | 'original-languages' | 'assign' | null
  selectedLanguages: Set<string>
  selectedOrganizations: Set<string>
  selectedResourceKeys: Set<string>
  
  // Available data
  availableLanguages: Array<{ code: string; name: string; source: 'catalog' | 'door43' }>
  availableOrganizations: Array<{ id: string; username: string; name: string; description?: string; avatarUrl?: string }>
  availableResources: Map<string, ResourceInfo>
}

interface WorkspaceActions {
  // Package management
  loadPackage: (pkg: WorkspacePackage) => void
  createNewPackage: (name: string) => void
  updatePackageInfo: (updates: Partial<Pick<WorkspacePackage, 'name' | 'version' | 'description'>>) => void
  savePackage: () => Promise<void>
  saveAsCollection: (name?: string, description?: string) => Promise<string>
  loadFromCollection: (packageId: string) => Promise<void>
  autoSaveWorkspace: () => void
  loadSavedWorkspace: () => Promise<boolean>
  loadPreloadedResources: () => Promise<void>
  
  // Panel management
  addPanel: (name?: string) => string // Returns new panel ID
  removePanel: (panelId: string) => void
  reorderPanels: (panelIds: string[]) => void
  renamePanel: (panelId: string, name: string) => void
  
  // Resource management
  addResourceToPackage: (resource: ResourceInfo) => void
  removeResourceFromPackage: (resourceKey: string) => void
  assignResourceToPanel: (resourceKey: string, panelId: string, index?: number) => void
  removeResourceFromPanel: (resourceKey: string, panelId: string) => void
  moveResourceBetweenPanels: (resourceKey: string, fromPanelId: string, toPanelId: string, insertIndex?: number) => void
  reorderResourceInPanel: (resourceKey: string, panelId: string, newIndex: number) => void
  setActiveResourceInPanel: (panelId: string, index: number) => void
  
  // Wizard management
  startWizard: (mode: 'load-package' | 'edit-workspace') => void
  closeWizard: () => void
  setWizardStep: (step: WorkspaceState['wizardStep']) => void
  toggleLanguage: (languageCode: string) => void
  toggleOrganization: (organizationName: string) => void
  toggleResource: (resourceKey: string, resourceInfo?: ResourceInfo) => void
  setAvailableLanguages: (languages: WorkspaceState['availableLanguages']) => void
  setAvailableOrganizations: (organizations: WorkspaceState['availableOrganizations']) => void
  setAvailableResources: (resources: Map<string, ResourceInfo>) => void
  clearWizardSelections: () => void
  
  // Helpers
  hasResourceInPackage: (resourceKey: string) => boolean
  getPanel: (panelId: string) => PanelConfig | undefined
  getPanels: () => PanelConfig[]
  getResourcesForPanel: (panelId: string) => ResourceInfo[]
  getActiveResourceForPanel: (panelId: string) => ResourceInfo | null
}

type WorkspaceStore = WorkspaceState & WorkspaceActions

const DEFAULT_PACKAGE: WorkspacePackage = {
  id: 'default',
  name: 'My Workspace',
  version: '1.0.0',
  description: 'Default workspace package',
  resources: new Map(),
  panels: [
    {
      id: 'panel-1',
      name: 'Panel 1',
      resourceKeys: [],
      activeIndex: 0,
      position: 0,
    },
    {
      id: 'panel-2',
      name: 'Panel 2',
      resourceKeys: [],
      activeIndex: 0,
      position: 1,
    },
  ],
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  immer((set, get) => ({
    // Initial state
    currentPackage: { ...DEFAULT_PACKAGE },
    isPackageModified: false,
    wizardMode: null,
    wizardStep: null,
    selectedLanguages: new Set(),
    selectedOrganizations: new Set(),
    selectedResourceKeys: new Set(),
    availableLanguages: [],
    availableOrganizations: [],
    availableResources: new Map(),
    
    // Package management
    loadPackage: (pkg) => {
      set((state) => {
        state.currentPackage = pkg
        state.isPackageModified = false
      })
    },
    
    createNewPackage: (name) => {
      set((state) => {
        state.currentPackage = {
          id: `pkg_${Date.now()}`,
          name,
          version: '1.0.0',
          description: '',
          resources: new Map(),
          panels: [
            {
              id: 'panel-1',
              name: 'Panel 1',
              resourceKeys: [],
              activeIndex: 0,
              position: 0,
            },
            {
              id: 'panel-2',
              name: 'Panel 2',
              resourceKeys: [],
              activeIndex: 0,
              position: 1,
            },
          ],
        }
        state.isPackageModified = false
      })
    },
    
    // Panel management
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
      
      console.log(`➕ Added panel: ${newPanelId}`)
      return newPanelId
    },
    
    removePanel: (panelId) => {
      set((state) => {
        if (state.currentPackage) {
          state.currentPackage.panels = state.currentPackage.panels.filter(p => p.id !== panelId)
          // Reorder positions
          state.currentPackage.panels.forEach((panel, index) => {
            panel.position = index
          })
          state.isPackageModified = true
        }
      })
      console.log(`🗑️ Removed panel: ${panelId}`)
    },
    
    reorderPanels: (panelIds) => {
      set((state) => {
        if (state.currentPackage) {
          const panelMap = new Map(state.currentPackage.panels.map(p => [p.id, p]))
          state.currentPackage.panels = panelIds
            .map(id => panelMap.get(id))
            .filter((p): p is PanelConfig => p !== undefined)
          // Update positions
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
          const panel = state.currentPackage.panels.find(p => p.id === panelId)
          if (panel) {
            panel.name = name
            state.isPackageModified = true
          }
        }
      })
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
      // Auto-save workspace to localStorage
      get().autoSaveWorkspace()
      
      set((state) => {
        state.isPackageModified = false
      })
      
      console.log('💾 Workspace auto-saved')
    },
    
    // Save current workspace as a collection (resource package)
    saveAsCollection: async (name?: string, description?: string) => {
      const pkg = get().currentPackage
      if (!pkg) throw new Error('No workspace to save')
      
      const allResourceKeys = Array.from(pkg.resources.keys())
      
      const { usePackageStore } = await import('./packageStore')
      const packageStore = usePackageStore.getState()
      
      // Check if a collection with this name already exists
      const collectionName = name || pkg.name
      const existingCollection = packageStore.packages.find(
        p => (p.name === collectionName || p.title === collectionName)
      )
      
      // Get all resources assigned to panels
      const assignedResourceKeys = new Set<string>()
      pkg.panels.forEach(panel => {
        panel.resourceKeys.forEach(key => assignedResourceKeys.add(key))
      })
      
      // Helper to extract base resource key (removes instance identifiers like #2)
      const extractBaseKey = (key: string): string => {
        if (!key) return ''
        return key.split('#')[0]
      }
      
      // Helper to extract resourceId from key (format: owner/language/resourceId or owner/language/resourceId#N)
      const extractResourceId = (key: string): string => {
        if (!key) return 'unknown'
        const baseKey = extractBaseKey(key)
        const parts = baseKey.split('/')
        return parts[parts.length - 1] || 'unknown'
      }
      
      // Helper to parse full resource key into components
      const parseResourceKey = (key: string): { owner: string; language: string; resourceId: string } => {
        if (!key) {
          return { owner: 'unknown', language: 'en', resourceId: 'unknown' }
        }
        const baseKey = extractBaseKey(key)
        const parts = baseKey.split('/')
        return {
          owner: parts[0] || 'unfoldingword',
          language: parts[1] || 'en',
          resourceId: parts[parts.length - 1] || '',
        }
      }
      
      // Convert WorkspacePackage to ResourcePackage format
      // IMPORTANT: Collections should only contain lightweight pointers, NOT full metadata
      const collection: any = {
        id: existingCollection?.id || `collection_${Date.now()}`,
        title: collectionName,
        name: collectionName,
        version: pkg.version,
        description: description || pkg.description,
        status: 'installed',
        createdAt: existingCollection?.createdAt || new Date().toISOString(),
        
        // Resources: Just lightweight pointers (no metadata duplication)
        resources: Array.from(pkg.resources.values()).map(resource => {
          const { owner, language, resourceId } = parseResourceKey(resource.key)
          
          return {
            server: resource.server || 'https://git.door43.org',
            owner,
            language,
            resourceId,
            // No extra fields - collections are just pointers
            // Metadata will be loaded from library/catalog or fetched from Door43
          }
        }),
        
        // Panel Layout: Which resources go in which panel (using base keys only)
        panelLayout: {
          panels: pkg.panels.map(panel => {
            // Use base keys (no instance identifiers) for panel assignments
            const baseResourceKeys = panel.resourceKeys.map(extractBaseKey)
            const activeBaseKey = panel.resourceKeys[panel.activeIndex] 
              ? extractBaseKey(panel.resourceKeys[panel.activeIndex])
              : baseResourceKeys[0]
            
            return {
              id: panel.id,
              title: panel.name,
              resourceIds: baseResourceKeys,
              defaultResourceId: activeBaseKey,
            }
          }),
          orientation: 'horizontal' as const,
        },
      }
      
      await packageStore.savePackage(collection)
      console.log(`✅ Saved collection: ${collection.name} (${collection.resources.length} resources)`)
      console.log('')
      
      return collection.id
    },
    
    // Load a collection into workspace
    loadFromCollection: async (packageId: string) => {
      const { usePackageStore } = await import('./packageStore')
      const packageStore = usePackageStore.getState()
      
      const collection = packageStore.getPackage(packageId)
      if (!collection) throw new Error(`Collection not found: ${packageId}`)
      
      // Convert ResourcePackage to WorkspacePackage format
      const workspacePackage: WorkspacePackage = {
        id: collection.id,
        name: collection.name,
        version: collection.version,
        description: collection.description,
        resources: new Map(
          (collection.resources || []).map((res: any) => {
          const resourceKey = `${res.owner}/${res.language}/${res.resourceId}`
          // Create minimal ResourceMetadata from collection resource
          const metadata: any = {
            resourceKey,
            resourceId: res.resourceId,
            server: res.server,
            owner: res.owner,
            language: res.language,
            title: res.displayName || res.resourceId,
            subject: 'unknown',
            version: '1.0.0',
            type: 'unknown',
            format: 'unknown' as any,
            contentType: 'unknown',
            contentStructure: 'book' as const,
            availability: {
              online: false,
              offline: false,
              bundled: false,
              partial: false,
            },
            locations: [],
            catalogedAt: new Date().toISOString(),
          }
          // Create ResourceInfo from metadata
          return [resourceKey, createResourceInfo(metadata)]
          })
        ),
        panels: collection.panelLayout?.panels?.map((panel: any, idx: number) => ({
          id: panel.id,
          name: panel.title || `Panel ${idx + 1}`,
          resourceKeys: panel.resourceIds || [],
          activeIndex: Math.max(0, panel.resourceIds?.indexOf(panel.defaultResourceId) ?? 0),
          position: idx,
        })) || DEFAULT_PACKAGE.panels,
      }
      
      get().loadPackage(workspacePackage)
      packageStore.setActivePackage(packageId)
      
      console.log('📦 Loaded collection into workspace:', packageId)
    },
    
    // Auto-save workspace state to localStorage
    autoSaveWorkspace: () => {
      const pkg = get().currentPackage
      if (!pkg) return
      
      try {
        const serialized = {
          ...pkg,
          resources: Array.from(pkg.resources.entries()),
        }
        localStorage.setItem('tc-study-workspace', JSON.stringify(serialized))
        console.log('💾 Auto-saved workspace to localStorage')
      } catch (error) {
        console.error('❌ Failed to auto-save workspace:', error)
      }
    },
    
    // Load saved workspace from localStorage
    loadSavedWorkspace: async () => {
      try {
        const saved = localStorage.getItem('tc-study-workspace')
        if (!saved) return false
        
        const data = JSON.parse(saved)
        
        // Convert saved resources to ResourceInfo
        const resourcesMap = new Map<string, ResourceInfo>(
          (data.resources || []).map(([key, res]: [string, any]) => {
            try {
              // Build complete ResourceMetadata from saved resource (handle both old and new formats)
              const metadata: any = {
                // Required core fields
                resourceKey: res.resourceKey || key,
                resourceId: res.resourceId || res.id || key.split('/')[2] || 'unknown',
                server: res.server || 'git.door43.org',
                owner: res.owner || key.split('/')[0] || 'unknown',
                language: res.language || res.languageCode || key.split('/')[1] || 'en',
                title: res.title || 'Unknown Resource',
                subject: res.subject || res.resourceId || 'unknown',
                version: res.version || '1.0.0',
                
                // Resource type info
                type: res.type || 'unknown',
                format: res.format || 'unknown',
                contentType: res.contentType || res.type || 'unknown',
                contentStructure: res.contentStructure || 'book',
                
                // Availability and locations
                availability: res.availability || {
                  online: false,
                  offline: true,  // Assume offline if saved in workspace
                  bundled: false,
                  partial: false,
                },
                locations: res.locations || [],
                
                // Optional metadata
                description: res.description,
                languageTitle: res.languageTitle || res.languageName,
                languageName: res.languageName,
                languageDirection: res.languageDirection,
                readme: res.readme,
                licenseText: res.license,
                
                // Content metadata
                contentMetadata: res.contentMetadata || (res.ingredients ? { ingredients: res.ingredients } : undefined),
                
                // URLs
                urls: res.urls || (res.metadata_url ? { metadata: res.metadata_url } : undefined),
                
                // Timestamps
                catalogedAt: res.catalogedAt || new Date().toISOString(),
              }
              
              return [key, createResourceInfo(metadata, { toc: res.toc })]
            } catch (error) {
              console.error(`❌ Failed to load resource ${key}:`, error)
              // Return a minimal valid resource as fallback
              return [key, createResourceInfo({
                resourceKey: key,
                resourceId: key.split('/')[2] || 'unknown',
                server: 'git.door43.org',
                owner: key.split('/')[0] || 'unknown',
                language: key.split('/')[1] || 'en',
                title: `Failed to load: ${key}`,
                subject: 'unknown',
                version: '1.0.0',
                type: ResourceType.UNKNOWN,
                format: ResourceFormat.UNKNOWN,
                contentType: 'unknown',
                contentStructure: 'book',
                availability: { online: false, offline: false, bundled: false, partial: false },
                locations: [],
                catalogedAt: new Date().toISOString(),
              })]
            }
          })
        )
        
        const workspace: WorkspacePackage = {
          ...data,
          resources: resourcesMap,
        }
        
        get().loadPackage(workspace)
        console.log('📦 Loaded saved workspace from localStorage')
        
        // Load all panel resources into AppStore.loadedResources so they can be rendered
        // This is critical: workspace restoration loads the package metadata, but doesn't load resources for rendering
        const { useAppStore } = await import('../../contexts/AppContext')
        const addResourceToApp = useAppStore.getState().addResource
        
        // Collect all unique resource IDs from all panels
        const panelResourceIds = new Set<string>()
        workspace.panels.forEach(panel => {
          panel.resourceKeys.forEach(resourceKey => {
            panelResourceIds.add(resourceKey)
          })
        })
        
        // Load each resource from workspace package into AppStore
        // Note: panel may have instance IDs like "ResourceA#2", but workspace.resources uses base keys
        let loadedCount = 0
        panelResourceIds.forEach(resourceKey => {
          // Strip instance suffix to get base key for lookup
          const baseKey = resourceKey.replace(/#\d+$/, '')
          const resource = workspace.resources.get(baseKey)
          if (resource) {
            // Create resource with the instance ID from the panel
            const resourceInstance = {
              ...resource,
              id: resourceKey, // Use the instance ID from panel
              key: baseKey, // Keep original base key for content loading
            }
            addResourceToApp(resourceInstance)
            loadedCount++
          } else {
            console.warn(`⚠️ Panel resource ${resourceKey} (base: ${baseKey}) not found in workspace package`)
          }
        })
        
        console.log(`📦 Loaded ${loadedCount}/${panelResourceIds.size} panel resources into AppStore for rendering`)
        
        return true
      } catch (error) {
        console.error('❌ Failed to load saved workspace:', error)
        return false
      }
    },
    
    // Load preloaded resources into workspace (from catalog)
    loadPreloadedResources: async () => {
      try {
        console.log('🔍 Loading preloaded resources into workspace...')
        
        // Get catalog manager from global context
        const catalogManager = (window as any).__catalogManager__
        
        if (!catalogManager) {
          console.warn('⚠️ CatalogManager not available yet, will retry later')
          return
        }
        
        const { getPreloadedResourceKeys, getPreloadedResourceData } = await import('../preloadedResources')
        const preloadedKeys = await getPreloadedResourceKeys()
        
        if (preloadedKeys.length === 0) {
          console.log('ℹ️ No preloaded resources available')
          return
        }
        
        console.log(`📦 Found ${preloadedKeys.length} preloaded resources, adding to workspace...`)
        
        // Add each preloaded resource to workspace (get metadata from catalog + Door43 data)
        let added = 0
        for (const resourceKey of preloadedKeys) {
          try {
            const metadata = await catalogManager.getResourceMetadata(resourceKey)
            
            if (!metadata) {
              console.warn(`⚠️ Preloaded resource not in catalog: ${resourceKey}`)
              continue
            }
            
            // Get original Door43 data to access language_title
            const door43Data = await getPreloadedResourceData(resourceKey)
            
            // Add to workspace collection
            get().addResourceToPackage({
              id: resourceKey,
              key: resourceKey,
              title: metadata.title,
              type: metadata.type,
              category: String(metadata.type).toLowerCase(),
              subject: metadata.subject,
              language: metadata.language,
              languageCode: metadata.language,
              languageName: door43Data?.language_title, // ⭐ Get from original Door43 data
              owner: metadata.owner,
              server: metadata.server || 'git.door43.org',
              format: metadata.format || 'usfm',
              location: 'network',
              resourceId: metadata.resourceId,
              ingredients: metadata.contentMetadata?.ingredients, // ⭐ For on-demand downloading
              version: metadata.version,
              description: metadata.description || door43Data?.description,
              readme: metadata.longDescription || door43Data?.readme,
              license: typeof metadata.license === 'string' ? metadata.license : metadata.license?.id || door43Data?.license,
              metadata: metadata, // ⭐ Include full metadata
            })
            
            added++
          } catch (error) {
            console.error(`❌ Failed to add ${resourceKey} to workspace:`, error)
          }
        }
        
        console.log(`✅ Added ${added}/${preloadedKeys.length} preloaded resources to workspace`)
        
        // Note: Resources are now visible in sidebar with ingredients for on-demand downloading
        // Content will be downloaded book-by-book as the user accesses them
      } catch (error) {
        console.error('❌ Failed to load preloaded resources:', error)
      }
    },
    
    // Resource management
    addResourceToPackage: (resource) => {
      // Ensure resource has proper structure
      // If it already has all required fields, it's a proper ResourceInfo
      const resourceInfo = resource.resourceKey && resource.catalogedAt 
        ? resource as ResourceInfo
        : createResourceInfo(resource as any)
      
      set((state) => {
        if (state.currentPackage) {
          state.currentPackage.resources.set(resourceInfo.key, resourceInfo)
          state.isPackageModified = true
        }
      })
      // Auto-save workspace
      get().autoSaveWorkspace()
    },
    
    removeResourceFromPackage: (resourceKey) => {
      set((state) => {
        if (state.currentPackage) {
          state.currentPackage.resources.delete(resourceKey)
          // Keep resource in panels - user can remove from panel explicitly if needed
          // This allows the resource to remain functional until explicitly removed
          state.isPackageModified = true
        }
      })
      // Auto-save workspace
      get().autoSaveWorkspace()
    },
    
    assignResourceToPanel: (resourceKey, panelId, index) => {
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find(p => p.id === panelId)
          if (panel && !panel.resourceKeys.includes(resourceKey)) {
            if (index !== undefined && index >= 0 && index <= panel.resourceKeys.length) {
              panel.resourceKeys.splice(index, 0, resourceKey)
            } else {
              panel.resourceKeys.push(resourceKey)
            }
            state.isPackageModified = true
          }
        }
      })
      // Auto-save workspace
      get().autoSaveWorkspace()
    },
    
    removeResourceFromPanel: (resourceKey, panelId) => {
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find(p => p.id === panelId)
          if (panel) {
            panel.resourceKeys = panel.resourceKeys.filter(k => k !== resourceKey)
            state.isPackageModified = true
          }
        }
      })
      get().autoSaveWorkspace()
    },
    
    moveResourceBetweenPanels: (resourceKey, fromPanelId, toPanelId, insertIndex) => {
      set((state) => {
        if (state.currentPackage) {
          const fromPanel = state.currentPackage.panels.find(p => p.id === fromPanelId)
          const toPanel = state.currentPackage.panels.find(p => p.id === toPanelId)
          
          if (fromPanel && toPanel) {
            // Remove from source panel
            fromPanel.resourceKeys = fromPanel.resourceKeys.filter(k => k !== resourceKey)
            // Add to target panel at specific position or append
            if (!toPanel.resourceKeys.includes(resourceKey)) {
              if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= toPanel.resourceKeys.length) {
                toPanel.resourceKeys.splice(insertIndex, 0, resourceKey)
              } else {
                toPanel.resourceKeys.push(resourceKey)
              }
            }
            state.isPackageModified = true
          }
        }
      })
      // Auto-save workspace
      get().autoSaveWorkspace()
    },
    
    reorderResourceInPanel: (resourceKey, panelId, newIndex) => {
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find(p => p.id === panelId)
          if (panel) {
            const currentIndex = panel.resourceKeys.indexOf(resourceKey)
            if (currentIndex !== -1 && newIndex >= 0 && newIndex < panel.resourceKeys.length) {
              panel.resourceKeys.splice(currentIndex, 1)
              panel.resourceKeys.splice(newIndex, 0, resourceKey)
              state.isPackageModified = true
            }
          }
        }
      })
      // Auto-save workspace
      get().autoSaveWorkspace()
    },
    
    setActiveResourceInPanel: (panelId, index) => {
      set((state) => {
        if (state.currentPackage) {
          const panel = state.currentPackage.panels.find(p => p.id === panelId)
          if (panel) {
            panel.activeIndex = index
            state.isPackageModified = true
          }
        }
      })
      // Auto-save workspace
      get().autoSaveWorkspace()
    },
    
    // Wizard management
    startWizard: (mode) => {
      console.log('🚀 Starting wizard with mode:', mode)
      set((state) => {
        state.wizardMode = mode
        state.wizardStep = 'languages'
        state.selectedLanguages = new Set()
        state.selectedOrganizations = new Set()
        state.selectedResourceKeys = new Set()
      })
      // Force log after state update
      console.log('✅ Wizard state set, new mode:', get().wizardMode)
    },
    
    closeWizard: () => {
      set((state) => {
        state.wizardMode = null
        state.wizardStep = null
        state.selectedLanguages = new Set()
        state.selectedOrganizations = new Set()
        state.selectedResourceKeys = new Set()
        state.availableLanguages = []
        state.availableResources = new Map()
      })
    },
    
    setWizardStep: (step) => {
      set((state) => {
        state.wizardStep = step
      })
    },
    
    toggleLanguage: (languageCode) => {
      set((state) => {
        const newSet = new Set(state.selectedLanguages)
        if (newSet.has(languageCode)) {
          newSet.delete(languageCode)
        } else {
          newSet.add(languageCode)
        }
        state.selectedLanguages = newSet
      })
    },
    
    toggleOrganization: (organizationName) => {
      set((state) => {
        const newSet = new Set(state.selectedOrganizations)
        if (newSet.has(organizationName)) {
          newSet.delete(organizationName)
        } else {
          newSet.add(organizationName)
        }
        state.selectedOrganizations = newSet
      })
    },
    
    toggleResource: (resourceKey, resourceInfo) => {
      set((state) => {
        const newSet = new Set(state.selectedResourceKeys)
        if (newSet.has(resourceKey)) {
          newSet.delete(resourceKey)
          // Optionally remove from availableResources too if needed
        } else {
          newSet.add(resourceKey)
          // If resourceInfo is provided, add it to availableResources
          if (resourceInfo && !state.availableResources.has(resourceKey)) {
            state.availableResources.set(resourceKey, resourceInfo)
          }
        }
        state.selectedResourceKeys = newSet
      })
    },
    
    setAvailableLanguages: (languages) => {
      set((state) => {
        state.availableLanguages = languages
      })
    },
    
    setAvailableOrganizations: (organizations) => {
      set((state) => {
        state.availableOrganizations = organizations
      })
    },
    
    setAvailableResources: (resources) => {
      set((state) => {
        state.availableResources = resources
      })
    },
    
    clearWizardSelections: () => {
      set((state) => {
        state.selectedLanguages = new Set()
        state.selectedOrganizations = new Set()
        state.selectedResourceKeys = new Set()
      })
    },
    
    // Helpers
    hasResourceInPackage: (resourceKey) => {
      const pkg = get().currentPackage
      return pkg ? pkg.resources.has(resourceKey) : false
    },
    
    getPanel: (panelId) => {
      const pkg = get().currentPackage
      return pkg?.panels.find(p => p.id === panelId)
    },
    
    getPanels: () => {
      const pkg = get().currentPackage
      return pkg?.panels.sort((a, b) => a.position - b.position) || []
    },
    
    getResourcesForPanel: (panelId) => {
      const pkg = get().currentPackage
      if (!pkg) return []
      
      const panel = pkg.panels.find(p => p.id === panelId)
      if (!panel || !panel.resourceKeys) return [] // Added safety check
      
      // Helper to extract base key from instance key (e.g., "resource#2" -> "resource")
      const extractBaseKey = (key: string) => key.split('#')[0]
      
      return panel.resourceKeys
        .map(instanceKey => {
          // Try to find by instance key first, then by base key
          const resource = pkg.resources.get(instanceKey) || pkg.resources.get(extractBaseKey(instanceKey))
          return resource
        })
        .filter((r): r is ResourceInfo => r !== undefined)
    },
    
    getActiveResourceForPanel: (panelId) => {
      const pkg = get().currentPackage
      if (!pkg) return null
      
      const panel = pkg.panels.find(p => p.id === panelId)
      if (!panel || !panel.resourceKeys || panel.resourceKeys.length === 0) return null
      
      // Ensure activeIndex is valid, default to 0 if invalid
      const activeIndex = typeof panel.activeIndex === 'number' && panel.activeIndex >= 0 && panel.activeIndex < panel.resourceKeys.length
        ? panel.activeIndex
        : 0
      
      // Helper to extract base key from instance key (e.g., "resource#2" -> "resource")
      const extractBaseKey = (key: string) => key.split('#')[0]
      
      const activeInstanceKey = panel.resourceKeys[activeIndex]
      // Try to find by instance key first, then by base key
      return activeInstanceKey ? (pkg.resources.get(activeInstanceKey) || pkg.resources.get(extractBaseKey(activeInstanceKey)) || null) : null
    },
  }))
)

// Expose migration function globally for console access
if (typeof window !== 'undefined') {
  (window as any).__migrateResourceIngredients__ = async () => {
    console.log('[BOOK-TITLE] 🔄 Starting migration to add ingredients to existing resources...')
    
    const catalogManager = (window as any).__catalogManager__
    if (!catalogManager) {
      console.error('[BOOK-TITLE] ❌ CatalogManager not available')
      return
    }
    
    const pkg = useWorkspaceStore.getState().currentPackage
    if (!pkg) {
      console.log('[BOOK-TITLE] No package to migrate')
      return
    }
    
    let updated = 0
    let skipped = 0
    
    for (const [key, resource] of pkg.resources.entries()) {
      try {
        // Skip if already has ingredients
        if (resource.ingredients && resource.ingredients.length > 0) {
          console.log(`[BOOK-TITLE] ✓ ${key} already has ${resource.ingredients.length} ingredients, skipping`)
          skipped++
          continue
        }
        
        console.log(`[BOOK-TITLE] 🔄 Updating ${key} with fresh metadata...`)
        
        // Fetch fresh metadata from catalog
        const metadata = await catalogManager.getResourceMetadata(key)
        if (!metadata?.contentMetadata?.ingredients) {
          console.warn(`[BOOK-TITLE] ⚠️ ${key} - no ingredients in catalog metadata`)
          skipped++
          continue
        }
        
        // Update resource with ingredients
        const updatedResource = {
          ...resource,
          ingredients: metadata.contentMetadata.ingredients,
          contentMetadata: metadata.contentMetadata,
          metadata: metadata,
        }
        
        pkg.resources.set(key, updatedResource)
        console.log(`[BOOK-TITLE] ✅ ${key} updated with ${metadata.contentMetadata.ingredients.length} ingredients`)
        updated++
        
      } catch (error) {
        console.error(`[BOOK-TITLE] ❌ Failed to update ${key}:`, error)
      }
    }
    
    if (updated > 0) {
      // Trigger save
      useWorkspaceStore.getState().autoSaveWorkspace()
      console.log(`[BOOK-TITLE] 🎉 Migration complete: ${updated} resources updated, ${skipped} skipped`)
      console.log(`[BOOK-TITLE] ℹ️ Reload the page to see the changes`)
    } else {
      console.log(`[BOOK-TITLE] ℹ️ No resources needed updating (${skipped} already had ingredients)`)
    }
  }
}