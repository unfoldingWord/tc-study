/**
 * Collection Import Dialog
 * 
 * UI for importing a shared collection package
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { ResourcePackage } from '@bt-synergy/package-storage'
import { Check, Database, FileArchive, Package, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../contexts/AppContext'
import { useCatalogManager, useResourceTypeRegistry } from '../../contexts/CatalogContext'
import { collectionExportService } from '../../lib/services/CollectionExportService'
import { createResourceMetadata } from '../../lib/services/ResourceMetadataFactory'
import { usePackageStore } from '../../lib/stores/packageStore'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { createResourceInfo } from '../../utils/resourceInfo'

interface CollectionImportDialogProps {
  isOpen: boolean
  onClose: () => void
}

type LoadMode = 'from-db' | 'from-file'

export function CollectionImportDialog({ isOpen, onClose }: CollectionImportDialogProps) {
  const loadPackage = useWorkspaceStore(state => state.loadPackage)
  const allPackages = usePackageStore(state => state.packages)
  const loadPackages = usePackageStore(state => state.loadPackages)
  const addResourceToApp = useAppStore(state => state.addResource)
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  
  // Filter to only show installed collections (same as Collections page)
  const packages = allPackages.filter((pkg: any) => pkg.status === 'installed')
  
  const [mode, setMode] = useState<LoadMode>('from-db')
  const [selectedPackage, setSelectedPackage] = useState<ResourcePackage | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; name: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  useEffect(() => {
    if (isOpen) {
      loadPackages()
    }
  }, [isOpen, loadPackages])
  
  if (!isOpen) return null
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Validate file extension
      if (!selectedFile.name.endsWith('.btc.zip') && !selectedFile.name.endsWith('.zip')) {
        setError('Invalid file type. Please select a .btc.zip collection file.')
        return
      }
      
      setFile(selectedFile)
      setError(null)
      setSuccess(false)
    }
  }
  
  const handleLoadFromDB = async () => {
    if (!selectedPackage) return
    
    setImporting(true)
    setError(null)
    
    try {
      console.log('📦 Selected package:', selectedPackage)
      console.log('📦 Panel layout:', selectedPackage.panelLayout)
      console.log('📦 Panels:', selectedPackage.panelLayout?.panels)
      
      // Convert ResourcePackage to WorkspacePackage format
      const workspacePackage: any = {
        id: selectedPackage.id,
        name: selectedPackage.name,
        version: selectedPackage.version,
        description: selectedPackage.description,
        resources: new Map(),
        panels: (selectedPackage.panelLayout?.panels || []).map((panel: any, idx: number) => {
          console.log(`📦 Mapping panel ${idx}:`, panel)
          console.log(`   - resourceIds:`, panel.resourceIds)
          return {
            id: panel.id,
            name: panel.title || `Panel ${idx + 1}`,
            resourceKeys: panel.resourceIds || [], // Map resourceIds to resourceKeys
            activeIndex: panel.resourceIds?.indexOf(panel.defaultResourceId) ?? 0,
            position: idx,
          }
        })
      }
      
      console.log('📦 Workspace package panels:', workspacePackage.panels)
      
      // ========================================================================
      // ARCHITECTURE: Collections are Lightweight Pointers
      // ========================================================================
      // Collections contain ONLY resource pointers (server/owner/language/resourceId)
      // They do NOT duplicate metadata or content.
      //
      // Loading Process:
      // 1. Read resource pointers from collection
      // 2. For each resource:
      //    a. Check local library/catalog for metadata
      //    b. If not found → fetch from Door43 → add to library/catalog
      // 3. Load resources into workspace sidebar
      // 4. Apply panel assignments
      // ========================================================================
      
      // STEP 1: Extract resource pointers from collection
      const allResourceKeys = new Set<string>()
      
      if (selectedPackage.resources && Array.isArray(selectedPackage.resources)) {
        for (const resource of selectedPackage.resources) {
          // Reconstruct resource key from pointer components
          const resourceKey = `${resource.owner}/${resource.language}/${resource.resourceId}`
          allResourceKeys.add(resourceKey)
        }
      }
      
      console.log(`📦 Loading ${allResourceKeys.size} resources from collection...`)
      
      // Store resource info objects to add to AppStore later
      const resourceInfosForApp: Map<string, any> = new Map()
      
      // Track progress
      let processedCount = 0
      const totalCount = allResourceKeys.size
      
      // STEP 2: Load metadata for each resource
      // Try local library/catalog first, fetch from Door43 if missing
      for (const _resourceKey of allResourceKeys) {
        processedCount++
        try {
          // Check local library/catalog for metadata
          const metadata = await catalogManager.getResourceMetadata(_resourceKey)
          if (metadata) {
            // ✅ Found in local library/catalog
            // Deep clone the entire metadata object to break any Immer freeze
            const unfrozenMetadata = JSON.parse(JSON.stringify(metadata))
            
            // Create ResourceInfo from complete catalog metadata
            const resourceInfoForWorkspace = createResourceInfo(unfrozenMetadata)
            
            // Add to workspacePackage.resources FIRST
            workspacePackage.resources.set(_resourceKey, resourceInfoForWorkspace)
            
            // Create a completely separate copy for AppStore (deep clone again to ensure no shared references)
            const resourceInfoForApp = createResourceInfo(unfrozenMetadata)
            
            // Store for AppStore (to be added later)
            resourceInfosForApp.set(_resourceKey, resourceInfoForApp)
            
            console.log(`   ✅ Loaded: ${unfrozenMetadata.title}`)
          } else {
            console.warn(`   ⚠️  Resource not in catalog: ${_resourceKey}, fetching from Door43...`)
            
            // Update progress UI
            setDownloadProgress({ current: processedCount, total: totalCount, name: _resourceKey })
            
            // Extract owner, language, and resourceId from the key
            const parts = _resourceKey.split('/')
            if (parts.length !== 3) {
              console.error(`   ❌ Invalid resource key format: ${_resourceKey}`)
              setDownloadProgress(null)
              continue
            }
            
            const [owner, language, resourceId] = parts
            
            try {
              const door43Client = getDoor43ApiClient()
              
              // Search for the resource on Door43
              const searchResults = await door43Client.searchCatalog({
                owner,
                language: language,
                subject: resourceId,
                stage: 'prod',
              })
              
              if (searchResults.length === 0) {
                console.error(`   ❌ Resource not found on Door43: ${_resourceKey}`)
                setDownloadProgress(null)
                continue
              }
              
              const door43Resource = searchResults[0]
              
              // Use the ResourceMetadataFactory to create complete metadata with ingredients
              console.log(`   🔄 Creating metadata with ingredients for: ${_resourceKey}`)
              const resourceMetadata = await createResourceMetadata(door43Resource, {
                includeEnrichment: true,
                resourceTypeRegistry: resourceTypeRegistry,
                debug: true,
              })
              
              // Add to catalog
              await catalogManager.addResourceToCatalog(resourceMetadata)
              console.log(`   ✅ Added resource to catalog: ${_resourceKey}`)
              
              // Create ResourceInfo from the complete metadata
              const resourceInfoForWorkspace = createResourceInfo(resourceMetadata)
              
              // Add to workspacePackage.resources FIRST
              workspacePackage.resources.set(_resourceKey, resourceInfoForWorkspace)
              
              // Create a completely separate copy for AppStore
              const resourceInfoForApp = createResourceInfo(resourceMetadata)
              
              // Store for AppStore (to be added later)
              resourceInfosForApp.set(_resourceKey, resourceInfoForApp)
              
              console.log(`   ✅ Downloaded & loaded: ${resourceMetadata.title}`)
              
            } catch (fetchError) {
              console.error(`   ❌ Failed to fetch resource from Door43: ${_resourceKey}`, fetchError)
              setDownloadProgress(null)
            }
          }
        } catch (err) {
          console.error(`   ❌ Failed to load resource ${_resourceKey}:`, err)
        }
      }
      
      // Clear download progress
      setDownloadProgress(null)
      
      // STEP 2: Now add all resources to AppStore
      console.log(`📦 Adding ${resourceInfosForApp.size} resources to AppStore...`)
      for (const resourceInfo of resourceInfosForApp.values()) {
        addResourceToApp(resourceInfo)
      }
      
      // STEP 3: Finally, load the workspace package
      console.log('📦 Loading workspace package with', workspacePackage.resources.size, 'resources')
      loadPackage(workspacePackage)
      
      setSuccess(true)
      
      // Close dialog after a brief success message
      setTimeout(() => {
        onClose()
        setSelectedPackage(null)
        setSuccess(false)
      }, 1000)
    } catch (err: any) {
      setError(err.message || 'Failed to load collection')
      console.error('Load failed:', err)
    } finally {
      setImporting(false)
    }
  }
  
  const handleImportFromFile = async () => {
    if (!file) return
    
    setImporting(true)
    setError(null)
    
    try {
      const cacheAdapter = new IndexedDBCacheAdapter({
        dbName: 'bt-synergy-cache',
        storeName: 'cache-entries',
        version: 1
      })
      
      const workspace = await collectionExportService.importCollection(
        file,
        catalogManager,
        cacheAdapter
      )
      
      // Collect all resource keys from the workspace resources Map
      // NOTE: We must load resources BEFORE calling loadPackage() to avoid Immer freeze errors
      const allResourceKeys = new Set<string>()
      
      // If workspace already has resources, use those keys
      if (workspace.resources && workspace.resources.size > 0) {
        for (const resourceKey of workspace.resources.keys()) {
          allResourceKeys.add(resourceKey)
        }
      } else {
        // Fallback: collect from panels if resources Map is empty
        for (const panel of workspace.panels) {
          for (const resourceKey of panel.resourceKeys || []) {
            allResourceKeys.add(resourceKey)
          }
        }
      }
      
      console.log(`📦 Loading ${allResourceKeys.size} resources from imported workspace...`)
      
      // Store resource info objects to add to AppStore later
      const resourceInfosForApp: Map<string, any> = new Map()
      
      // Track progress
      let processedCount = 0
      const totalCount = allResourceKeys.size
      
      // STEP 1: First, add all resources to workspace.resources (before any state updates)
      for (const _resourceKey of allResourceKeys) {
        processedCount++
        try {
          const metadata = await catalogManager.getResourceMetadata(_resourceKey)
          if (metadata) {
            // Deep clone the entire metadata object to break any Immer freeze
            const unfrozenMetadata = JSON.parse(JSON.stringify(metadata))
            
            // Create ResourceInfo from metadata
            const resourceInfoForWorkspace = createResourceInfo(unfrozenMetadata)
            
            // Add to workspace.resources FIRST
            workspace.resources.set(_resourceKey, resourceInfoForWorkspace)
            
            // Create a completely separate copy for AppStore (deep clone again to ensure no shared references)
            const resourceInfoForApp = createResourceInfo(unfrozenMetadata)
            
            // Store for AppStore (to be added later)
            resourceInfosForApp.set(_resourceKey, resourceInfoForApp)
            
            console.log(`   ✅ Loaded: ${unfrozenMetadata.title}`)
          } else {
            console.warn(`   ⚠️  Resource not in catalog: ${_resourceKey}, fetching from Door43...`)
            
            // Update progress UI
            setDownloadProgress({ current: processedCount, total: totalCount, name: _resourceKey })
            
            // Extract owner, language, and resourceId from the key
            const parts = _resourceKey.split('/')
            if (parts.length !== 3) {
              console.error(`   ❌ Invalid resource key format: ${_resourceKey}`)
              setDownloadProgress(null)
              continue
            }
            
            const [owner, language, resourceId] = parts
            
            try {
              const door43Client = getDoor43ApiClient()
              
              // Search for the resource on Door43
              const searchResults = await door43Client.searchCatalog({
                owner,
                language: language,
                subject: resourceId,
                stage: 'prod',
              })
              
              if (searchResults.length === 0) {
                console.error(`   ❌ Resource not found on Door43: ${_resourceKey}`)
                setDownloadProgress(null)
                continue
              }
              
              const door43Resource = searchResults[0]
              
              // Use the ResourceMetadataFactory to create complete metadata with ingredients
              console.log(`   🔄 Creating metadata with ingredients for: ${_resourceKey}`)
              const resourceMetadata = await createResourceMetadata(door43Resource, {
                includeEnrichment: true,
                resourceTypeRegistry: resourceTypeRegistry,
                debug: true,
              })
              
              // Add to catalog
              await catalogManager.addResourceToCatalog(resourceMetadata)
              console.log(`   ✅ Added resource to catalog: ${_resourceKey}`)
              
              // Create ResourceInfo from the complete metadata
              const resourceInfoForWorkspace = createResourceInfo(resourceMetadata)
              
              // Add to workspace.resources FIRST
              workspace.resources.set(_resourceKey, resourceInfoForWorkspace)
              
              // Create a completely separate copy for AppStore
              const resourceInfoForApp = createResourceInfo(resourceMetadata)
              
              // Store for AppStore (to be added later)
              resourceInfosForApp.set(_resourceKey, resourceInfoForApp)
              
              console.log(`   ✅ Downloaded & loaded: ${resourceMetadata.title}`)
              
            } catch (fetchError) {
              console.error(`   ❌ Failed to fetch resource from Door43: ${_resourceKey}`, fetchError)
              setDownloadProgress(null)
            }
          }
        } catch (err) {
          console.error(`   ❌ Failed to load resource ${_resourceKey}:`, err)
        }
      }
      
      // Clear download progress
      setDownloadProgress(null)
      
      // STEP 2: Now add all resources to AppStore
      console.log(`📦 Adding ${resourceInfosForApp.size} resources to AppStore...`)
      for (const resourceInfo of resourceInfosForApp.values()) {
        addResourceToApp(resourceInfo)
      }
      
      // STEP 3: Finally, load the workspace package
      console.log('📦 Loading workspace package with', workspace.resources.size, 'resources')
      loadPackage(workspace)
      
      setSuccess(true)
      
      // Close dialog after a brief success message
      setTimeout(() => {
        onClose()
        setFile(null)
        setSuccess(false)
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to import collection')
      console.error('Import failed:', err)
    } finally {
      setImporting(false)
    }
  }
  
  const handleImport = mode === 'from-db' ? handleLoadFromDB : handleImportFromFile
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      if (!droppedFile.name.endsWith('.btc.zip') && !droppedFile.name.endsWith('.zip')) {
        setError('Invalid file type. Please select a .btc.zip collection file.')
        return
      }
      setFile(droppedFile)
      setError(null)
      setSuccess(false)
    }
  }
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <span title="Load collection"><Upload className="w-6 h-6 text-blue-600" aria-label="Load collection" /></span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            aria-label="Close dialog"
            title="Close dialog"
          >
            <span title="Close"><X className="w-4 h-4" /></span>
          </button>
        </div>
        
        {/* Mode Selector */}
        <div className="flex border-b">
          <button
            onClick={() => setMode('from-db')}
            className={`flex-1 flex items-center justify-center gap-2 p-3 transition-colors ${
              mode === 'from-db'
                ? 'border-b-2 border-blue-500 bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            title="Load from saved collections"
            aria-label="Load from saved collections"
          >
            <Database className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode('from-file')}
            className={`flex-1 flex items-center justify-center gap-2 p-3 transition-colors ${
              mode === 'from-file'
                ? 'border-b-2 border-blue-500 bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
            title="Import from .btc.zip file"
            aria-label="Import from file"
          >
            <FileArchive className="w-4 h-4" />
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mode === 'from-db' ? (
            /* Collection List */
            packages.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No saved collections</p>
              </div>
            ) : (
              packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`w-full p-4 border-2 rounded-lg transition-all text-left ${
                    selectedPackage?.id === pkg.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                  title={`Select ${pkg.name}`}
                  aria-label={`Select collection ${pkg.name}`}
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{pkg.name}</div>
                      <div className="text-xs text-gray-500">v{pkg.version}</div>
                    </div>
                    {selectedPackage?.id === pkg.id && (
                      <Check className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                </button>
              ))
            )
          ) : (
            /* File Drop Zone */
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              title="Drop .btc.zip file here or click to browse"
              aria-label="Drop collection file here or click to select file"
            >
              <span title="Collection file"><FileArchive className={`w-16 h-16 mx-auto mb-3 ${file ? 'text-blue-600' : 'text-gray-400'}`} /></span>
              {file ? (
                <>
                  <p className="text-sm font-medium text-gray-700 mb-1 truncate px-2">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <span title="Upload"><Upload className="w-5 h-5 text-gray-400" /></span>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.btc.zip"
                onChange={handleFileSelect}
                className="hidden"
                aria-label="Select collection file"
              />
            </div>
          )}
          
          {/* Download Progress */}
          {downloadProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-blue-800">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="font-medium">Downloading resource {downloadProgress.current} of {downloadProgress.total}</span>
                </div>
              </div>
              <div className="text-xs text-blue-700 truncate font-mono bg-blue-100 px-2 py-1 rounded">
                {downloadProgress.name}
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          
          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-center gap-2 text-green-800">
              <span title="Success"><Check className="w-5 h-5" /></span>
            </div>
          )}
          
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm text-center">
              {error}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center gap-2 p-4 border-t">
          <button
            onClick={onClose}
            disabled={importing}
            className="flex-1 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Cancel"
            title="Cancel"
          >
            <span title="Cancel"><X className="w-4 h-4 mx-auto" /></span>
          </button>
          <button
            onClick={handleImport}
            disabled={(mode === 'from-db' ? !selectedPackage : !file) || importing || success}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={importing ? "Loading..." : success ? "Loaded" : "Load collection"}
            title={importing ? "Loading..." : success ? "Loaded!" : "Load collection"}
          >
            {importing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" title="Loading..." />
            ) : success ? (
              <span title="Success"><Check className="w-5 h-5" /></span>
            ) : (
              <span title="Load"><Upload className="w-5 h-5" /></span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
