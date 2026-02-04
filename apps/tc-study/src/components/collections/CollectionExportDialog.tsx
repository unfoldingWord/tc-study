/**
 * Collection Export Dialog
 * 
 * UI for exporting the current workspace as a shareable collection package
 */

import { useState, useEffect } from 'react'
import { Download, Package, FileArchive, X, Database, Wifi, Check } from 'lucide-react'
import { collectionExportService } from '../../lib/services/CollectionExportService'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { usePackageStore } from '../../lib/stores/packageStore'
import { useCatalogManager } from '../../contexts/CatalogContext'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import type { ResourcePackage } from '@bt-synergy/package-storage'

interface CollectionExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function CollectionExportDialog({ isOpen, onClose }: CollectionExportDialogProps) {
  const packages = usePackageStore(state => state.packages)
  const loadPackages = usePackageStore(state => state.loadPackages)
  const workspace = useWorkspaceStore(state => state.currentPackage)
  const catalogManager = useCatalogManager()
  
  const [selectedPackage, setSelectedPackage] = useState<ResourcePackage | null>(null)
  const [includeContent, setIncludeContent] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (isOpen) {
      loadPackages()
    }
  }, [isOpen, loadPackages])
  
  if (!isOpen) return null
  
  const handleExport = async () => {
    if (!selectedPackage) return
    
    setExporting(true)
    setError(null)
    
    try {
      const cacheAdapter = new IndexedDBCacheAdapter({
        dbName: 'bt-synergy-cache',
        storeName: 'cache-entries',
        version: 1
      })
      
      // Convert ResourcePackage to WorkspacePackage format for export
      const workspacePackage: any = {
        id: selectedPackage.id,
        name: selectedPackage.name,
        version: selectedPackage.version,
        description: selectedPackage.description,
        resources: new Map(),
        panels: selectedPackage.panelLayout?.panels || []
      }
      
      await collectionExportService.exportCollection(
        workspacePackage,
        catalogManager,
        cacheAdapter,
        { includeContent }
      )
      
      // Close dialog after successful export
      setTimeout(() => {
        setSelectedPackage(null)
        onClose()
      }, 500)
    } catch (err: any) {
      setError(err.message || 'Failed to export collection')
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }
  
  // Show collection list if no package selected
  if (!selectedPackage) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <Download className="w-6 h-6 text-blue-600" aria-label="Download collection" />
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              aria-label="Close dialog"
              title="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Collection List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {packages.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No saved collections</p>
              </div>
            ) : (
              packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg)}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                  title={`Select ${pkg.name}`}
                  aria-label={`Select collection ${pkg.name}`}
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{pkg.name}</div>
                      <div className="text-xs text-gray-500">v{pkg.version}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }
  
  // Show export options when package is selected
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedPackage(null)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="Back to collection list"
              aria-label="Back to collection list"
            >
              ←
            </button>
            <FileArchive className="w-6 h-6 text-blue-600" aria-label="Export collection" />
            <div className="flex items-center gap-2">
              <span className="font-semibold" title={`Collection name: ${selectedPackage.name}`}>{selectedPackage.name}</span>
              <span className="text-xs text-gray-400" title={`Version: ${selectedPackage.version}`}>v{selectedPackage.version}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            aria-label="Close dialog"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Export Mode Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIncludeContent(false)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                !includeContent 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-blue-300'
              }`}
              aria-label="Export metadata only (requires internet to load content)"
              title="Export metadata only - Content downloads on-demand (requires internet)"
            >
              <Wifi className={`w-6 h-6 ${!includeContent ? 'text-blue-600' : 'text-gray-400'}`} />
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
              <Database className={`w-6 h-6 ${includeContent ? 'text-green-600' : 'text-gray-400'}`} />
              <span className={`text-sm font-medium ${includeContent ? 'text-green-900' : 'text-gray-600'}`}>
                Offline
              </span>
              <span className="text-xs text-gray-500">Larger</span>
            </button>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
              {error}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center gap-2 p-4 border-t">
          <button
            onClick={() => setSelectedPackage(null)}
            disabled={exporting}
            className="flex-1 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Back"
            title="Back to collection list"
          >
            <X className="w-4 h-4 mx-auto" />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            aria-label={exporting ? "Downloading..." : "Download collection as .btc.zip file"}
            title={exporting ? "Downloading..." : "Download collection as .btc.zip file"}
          >
            {exporting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
