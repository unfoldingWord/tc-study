/**
 * Save Collection Dialog
 * 
 * Simple dialog to save current workspace to internal collections DB
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { Database, Download, Package, Save, Wifi, X } from 'lucide-react'
import { useState } from 'react'
import { useCatalogManager } from '../../contexts/CatalogContext'
import { collectionExportService } from '../../lib/services/CollectionExportService'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

interface SaveCollectionDialogProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: (collectionId: string) => void
}

type ActionMode = 'save' | 'download'

export function SaveCollectionDialog({ isOpen, onClose, onSaved }: SaveCollectionDialogProps) {
  const workspace = useWorkspaceStore(state => state.currentPackage)
  const saveAsCollection = useWorkspaceStore(state => state.saveAsCollection)
  const catalogManager = useCatalogManager()
  
  const [name, setName] = useState(workspace?.name || '')
  const [description, setDescription] = useState(workspace?.description || '')
  const [actionMode, setActionMode] = useState<ActionMode>('save')
  const [includeContent, setIncludeContent] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null)
  
  if (!isOpen || !workspace) return null
  
  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a collection name')
      return
    }
    
    setProcessing(true)
    setError(null)
    setDownloadProgress(null)
    
    try {
      const collectionId = await saveAsCollection(name.trim(), description.trim() || undefined)
      console.log('✅ Collection saved:', collectionId)
      onSaved?.(collectionId)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to save collection')
      console.error('Save failed:', err)
    } finally {
      setProcessing(false)
    }
  }
  
  const handleDownload = async () => {
    setProcessing(true)
    setError(null)
    
    try {
      const cacheAdapter = new IndexedDBCacheAdapter({
        dbName: 'bt-synergy-cache',
        storeName: 'cache-entries',
        version: 1
      })
      
      // If offline mode (includeContent), download all content first
      if (includeContent) {
        console.log('📥 Downloading content for offline use...')
        setDownloadProgress('Preparing download...')
        
        // Get all unique resource keys from workspace
        const allResourceKeys = new Set<string>()
        for (const panel of workspace.panels) {
          for (const resourceKey of panel.resourceKeys) {
            allResourceKeys.add(resourceKey)
          }
        }
        
        console.log(`   📦 Downloading ${allResourceKeys.size} resources...`)
        
        // Download each resource
        let current = 0
        for (const resourceKey of allResourceKeys) {
          current++
          try {
            const metadata = await catalogManager.getResourceMetadata(resourceKey)
            if (!metadata) {
              console.warn(`   ⚠️  Metadata not found for: ${resourceKey}`)
              continue
            }
            
            setDownloadProgress(`Downloading ${current}/${allResourceKeys.size}: ${metadata.title}`)
            console.log(`   ⬇️  Downloading: ${metadata.title}`)
            
            // For scripture resources, download all books
            if (metadata.contentStructure === 'book' && metadata.contentMetadata?.books) {
              const totalBooks = metadata.contentMetadata.books.length
              let bookNum = 0
              for (const bookCode of metadata.contentMetadata.books) {
                bookNum++
                setDownloadProgress(`Downloading ${current}/${allResourceKeys.size}: ${metadata.title} (${bookNum}/${totalBooks})`)
                try {
                  // This will download from Door43 if not cached, and store in cache
                  // Pass bookCode as a string directly (not as an object)
                  await catalogManager.loadContent(resourceKey, bookCode)
                  console.log(`      ✅ Downloaded book: ${bookCode}`)
                } catch (bookError) {
                  console.error(`      ❌ Failed to download ${bookCode}:`, bookError)
                }
              }
            } else {
              // For other resource types, load content (empty string for full content)
              try {
                await catalogManager.loadContent(resourceKey, '')
                console.log(`      ✅ Downloaded content`)
              } catch (contentError) {
                console.error(`      ❌ Failed to download content:`, contentError)
              }
            }
          } catch (error) {
            console.error(`   ❌ Failed to download ${resourceKey}:`, error)
          }
        }
        
        setDownloadProgress('Creating download package...')
        console.log('✅ All content downloaded')
      }
      
      // Now export with the cached content
      await collectionExportService.exportCollection(
        workspace,
        catalogManager,
        cacheAdapter,
        { includeContent }
      )
      
      setDownloadProgress(null)
      
      // Close dialog after successful download
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (err: any) {
      setError(err.message || 'Failed to download collection')
      console.error('Download failed:', err)
      setDownloadProgress(null)
    } finally {
      setProcessing(false)
    }
  }
  
  const handleAction = actionMode === 'save' ? handleSave : handleDownload
  
  const resourceCount = workspace.resources.size
  const panelCount = workspace.panels.length
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <span title="Save or download collection"><Save className="w-6 h-6 text-blue-600" aria-label="Save or download collection" /></span>
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
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Stats */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-2" title="Resources in collection" aria-label="Resources in collection">
              <Package className="w-5 h-5 text-gray-400" />
              <span className="text-2xl font-bold">{resourceCount}</span>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex items-center gap-2" title="Panels configured" aria-label="Panels configured">
              <div className="w-5 h-5 flex items-center justify-center text-gray-400 text-lg">⊞</div>
              <span className="text-2xl font-bold">{panelCount}</span>
            </div>
          </div>
          
          {/* Action Mode Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setActionMode('save')
                setError(null)
                setDownloadProgress(null)
              }}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                actionMode === 'save'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
              aria-label="Save to collections database"
              title="Save to collections database"
            >
              <span title="Save to DB"><Save className={`w-6 h-6 ${actionMode === 'save' ? 'text-blue-600' : 'text-gray-400'}`} /></span>
              <span className={`text-sm font-medium ${actionMode === 'save' ? 'text-blue-900' : 'text-gray-600'}`}>
                Save
              </span>
            </button>
            
            <button
              onClick={() => {
                setActionMode('download')
                setError(null)
                setDownloadProgress(null)
              }}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                actionMode === 'download'
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 hover:border-green-300'
              }`}
              aria-label="Download as .btc.zip file"
              title="Download as .btc.zip file"
            >
              <span title="Download"><Download className={`w-6 h-6 ${actionMode === 'download' ? 'text-green-600' : 'text-gray-400'}`} /></span>
              <span className={`text-sm font-medium ${actionMode === 'download' ? 'text-green-900' : 'text-gray-600'}`}>
                Download
              </span>
            </button>
          </div>
          
          {/* Conditional Content Based on Mode */}
          {actionMode === 'save' ? (
            /* Name and Description Inputs for Save Mode */
            <div className="space-y-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Collection name"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-center text-lg font-medium"
                autoFocus
                disabled={processing}
                aria-label="Collection name"
                title="Enter collection name"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-sm resize-none"
                disabled={processing}
                aria-label="Collection description"
                title="Enter collection description (optional)"
              />
            </div>
          ) : (
            /* Online/Offline Toggle for Download Mode */
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setIncludeContent(false)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  !includeContent
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
                aria-label="Download metadata only (requires internet to load content)"
                title="Metadata only - Content downloads on-demand (requires internet)"
              >
                <span title="Online mode"><Wifi className={`w-6 h-6 ${!includeContent ? 'text-blue-600' : 'text-gray-400'}`} /></span>
                <span className={`text-sm font-medium ${!includeContent ? 'text-blue-900' : 'text-gray-600'}`}>
                  Online
                </span>
                <span className="text-xs text-gray-500">~1 MB</span>
              </button>
              
              <button
                onClick={() => setIncludeContent(true)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  includeContent
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
                aria-label="Include downloaded content for offline use"
                title="Include content - Works offline but larger file size"
              >
                <span title="Offline mode"><Database className={`w-6 h-6 ${includeContent ? 'text-green-600' : 'text-gray-400'}`} /></span>
                <span className={`text-sm font-medium ${includeContent ? 'text-green-900' : 'text-gray-600'}`}>
                  Offline
                </span>
                <span className="text-xs text-gray-500">Larger</span>
              </button>
            </div>
          )}
          
          {/* Download Progress */}
          {downloadProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm text-center">
              {downloadProgress}
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
            disabled={processing}
            className="flex-1 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Cancel"
            title="Cancel"
          >
            <span title="Cancel"><X className="w-4 h-4 mx-auto" /></span>
          </button>
          <button
            onClick={handleAction}
            disabled={processing || (actionMode === 'save' && !name.trim())}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={processing ? "Processing..." : actionMode === 'save' ? "Save collection" : "Download collection"}
            title={processing ? "Processing..." : actionMode === 'save' ? "Save collection" : "Download collection"}
          >
            {processing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" title="Processing..." />
            ) : actionMode === 'save' ? (
              <span title="Save"><Save className="w-5 h-5" /></span>
            ) : (
              <span title="Download"><Download className="w-5 h-5" /></span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
