/**
 * Catalog Viewer - Debug page to inspect local catalog
 * 
 * Shows all resources in the catalog with their metadata,
 * including a dev mode to view raw JSON.
 */

import { useState, useEffect } from 'react'
import { useCatalogManager } from '../contexts/CatalogContext'
import { Database, Search, Eye, Code, RefreshCw, Download, Trash2, Plus, CheckCircle, Circle, Loader } from 'lucide-react'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { AddToCatalogWizard } from '../components/catalog/AddToCatalogWizard'

export default function CatalogViewer() {
  const catalogManager = useCatalogManager()
  
  const [resources, setResources] = useState<ResourceMetadata[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedResource, setSelectedResource] = useState<ResourceMetadata | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [showAddWizard, setShowAddWizard] = useState(false)
  
  // Download tracking
  const [downloadingResources, setDownloadingResources] = useState<Set<string>>(new Set())
  const [downloadingIngredients, setDownloadingIngredients] = useState<Set<string>>(new Set())
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  
  const loadCatalog = async () => {
    setLoading(true)
    try {
      // Get all resources
      const allResources = await catalogManager.searchResources({})
      console.log('📊 Loaded resources:', allResources.length)
      setResources(allResources || [])
      
      // Get stats
      try {
        const catalogStats = await catalogManager.getCatalogStats()
        console.log('📊 Catalog stats:', catalogStats)
        setStats(catalogStats)
      } catch (statsError) {
        console.warn('Could not load stats:', statsError)
        // Stats are optional, continue without them
      }
    } catch (error) {
      console.error('❌ Failed to load catalog:', error)
      alert(`Failed to load catalog: ${error}`)
      setResources([])
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    loadCatalog()
  }, [])
  
  // Helper to generate resource key
  const getResourceKey = (resource: ResourceMetadata) => {
    return `${resource.owner}/${resource.language}/${resource.resourceId}`
  }
  
  const filteredResources = resources.filter(r => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      r.title?.toLowerCase().includes(query) ||
      r.resourceId?.toLowerCase().includes(query) ||
      r.owner?.toLowerCase().includes(query) ||
      r.language?.toLowerCase().includes(query) ||
      r.subject?.toLowerCase().includes(query)
    )
  })
  
  const handleExportCatalog = () => {
    const dataStr = JSON.stringify(resources, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `catalog-${new Date().toISOString().split('T')[0]}.json`
    link.click()
  }
  
  const handleDeleteResource = async (resource: ResourceMetadata) => {
    const resourceKey = getResourceKey(resource)
    const confirmMsg = `Delete "${resource.title}"?\n\nThis will remove:\n- Catalog metadata\n- Downloaded content\n- All cached data\n\nThis cannot be undone!`
    
    if (confirm(confirmMsg)) {
      try {
        console.log(`🗑️ Deleting resource: ${resourceKey}`)
        
        // Remove from catalog
        await catalogManager.removeResource(resourceKey)
        
        // Also clear cached content
        const loader = catalogManager['registry']?.getLoader(resource.type)
        if (loader && typeof loader.clearCache === 'function') {
          await loader.clearCache(resourceKey)
        }
        
        console.log(`✅ Deleted: ${resourceKey}`)
        
        // Refresh catalog
        await loadCatalog()
        
        // Close JSON modal if this resource was selected
        if (selectedResource && getResourceKey(selectedResource) === resourceKey) {
          setSelectedResource(null)
          setShowJson(false)
        }
      } catch (error) {
        console.error('Failed to delete resource:', error)
        alert(`Failed to delete resource: ${error}`)
      }
    }
  }
  
  const handleClearCatalog = async () => {
    if (confirm('Are you sure you want to clear the entire catalog? This cannot be undone!')) {
      try {
        // This would need to be implemented in CatalogManager
        alert('Clear catalog functionality not yet implemented')
      } catch (error) {
        console.error('Failed to clear catalog:', error)
        alert('Failed to clear catalog')
      }
    }
  }
  
  /**
   * ✅ NEW: Download all files for a resource
   */
  const handleDownloadAll = async (resource: ResourceMetadata) => {
    const resourceKey = getResourceKey(resource)
    
    try {
      console.log(`📥 Starting bulk download: ${resourceKey}`)
      setDownloadingResources(prev => new Set(prev).add(resourceKey))
      
      await catalogManager.downloadResource(resourceKey, {}, (progress) => {
        setDownloadProgress(prev => ({
          ...prev,
          [resourceKey]: progress.percentage
        }))
      })
      
      console.log(`✅ Bulk download complete: ${resourceKey}`)
      
      // Refresh catalog to show updated download status
      await loadCatalog()
    } catch (error) {
      console.error(`❌ Failed to download ${resourceKey}:`, error)
      alert(`Failed to download: ${error}`)
    } finally {
      setDownloadingResources(prev => {
        const next = new Set(prev)
        next.delete(resourceKey)
        return next
      })
      setDownloadProgress(prev => {
        const next = { ...prev }
        delete next[resourceKey]
        return next
      })
    }
  }
  
  /**
   * ✅ NEW: Download a single ingredient (book/file)
   */
  const handleDownloadIngredient = async (resource: ResourceMetadata, ingredientId: string) => {
    const resourceKey = getResourceKey(resource)
    const ingredientKey = `${resourceKey}/${ingredientId}`
    
    try {
      console.log(`📥 Downloading ingredient: ${ingredientKey}`)
      setDownloadingIngredients(prev => new Set(prev).add(ingredientKey))
      
      await catalogManager.downloadIngredient(resourceKey, ingredientId, {
        onProgress: (progress) => {
          setDownloadProgress(prev => ({
            ...prev,
            [ingredientKey]: progress
          }))
        }
      })
      
      console.log(`✅ Downloaded ingredient: ${ingredientKey}`)
      
      // Refresh catalog to show updated download status
      await loadCatalog()
    } catch (error) {
      console.error(`❌ Failed to download ${ingredientKey}:`, error)
      alert(`Failed to download ${ingredientId}: ${error}`)
    } finally {
      setDownloadingIngredients(prev => {
        const next = new Set(prev)
        next.delete(ingredientKey)
        return next
      })
      setDownloadProgress(prev => {
        const next = { ...prev }
        delete next[ingredientKey]
        return next
      })
    }
  }
  
  /**
   * ✅ NEW: Check if an ingredient is downloaded
   */
  const isIngredientDownloaded = (resource: ResourceMetadata, ingredientId: string): boolean => {
    const downloadedIngredients = resource.contentMetadata?.downloadedIngredients || []
    return downloadedIngredients.includes(ingredientId)
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading catalog...</span>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Catalog</h1>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddWizard(true)}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Add resources"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                onClick={loadCatalog}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={handleExportCatalog}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Export JSON"
              >
                <Download className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={handleClearCatalog}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                title="Clear catalog"
              >
                <Trash2 className="w-5 h-5 text-gray-400 group-hover:text-red-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Stats */}
      {stats && (
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="grid grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-semibold text-gray-900">{stats.totalResources}</div>
              <div className="text-xs text-gray-500 mt-1">Resources</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-semibold text-gray-900">{stats.totalLanguages}</div>
              <div className="text-xs text-gray-500 mt-1">Languages</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-semibold text-gray-900">{stats.totalOwners}</div>
              <div className="text-xs text-gray-500 mt-1">Owners</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-semibold text-blue-600">
                {resources.filter(r => r.availability?.offline).length}
              </div>
              <div className="text-xs text-gray-500 mt-1">Offline</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Search */}
      <div className="max-w-7xl mx-auto px-6 pb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search resources..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-400"
          />
        </div>
      </div>
      
      {/* Resource List */}
      <div className="max-w-7xl mx-auto px-6 pb-8">
        {filteredResources.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex p-4 bg-gray-50 rounded-full mb-4">
              <Database className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-900 font-medium">No resources yet</p>
            <p className="text-sm text-gray-500 mt-1">Add resources to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
              {filteredResources.map((resource) => (
                <div
                  key={getResourceKey(resource)}
                  className="bg-white rounded-xl p-5 hover:shadow-md transition-all duration-200 border border-gray-100 group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {resource.title}
                        </h3>
                        
                        {/* Compact download status */}
                        {resource.availability.offline && !resource.availability.partial ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" title="Downloaded" />
                        ) : resource.availability.partial ? (
                          <Circle className="w-4 h-4 text-blue-500 flex-shrink-0" title={`Partial: ${resource.contentMetadata?.downloadedIngredients?.length}/${resource.contentMetadata?.ingredients?.length}`} />
                        ) : (
                          <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" title="Not downloaded" />
                        )}
                        
                        {/* Download progress */}
                        {downloadingResources.has(getResourceKey(resource)) && (
                          <span className="text-xs text-blue-600 flex items-center gap-1 flex-shrink-0">
                            <Loader className="w-3 h-3 animate-spin" />
                            {downloadProgress[getResourceKey(resource)]?.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="px-2 py-0.5 bg-gray-50 rounded">{resource.language}</span>
                        <span className="px-2 py-0.5 bg-gray-50 rounded">{resource.owner}</span>
                        <span className="px-2 py-0.5 bg-gray-50 rounded">{resource.subject}</span>
                        {resource.contentMetadata?.ingredients && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                            {resource.contentMetadata.ingredients.length} books
                          </span>
                        )}
                      </div>
                      
                      {resource.contentMetadata?.ingredients && (
                        <div className="mt-4">
                          <details className="group/details">
                            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2">
                              <Eye className="w-3 h-3" />
                              <span>{resource.contentMetadata?.downloadedIngredients?.length || 0}/{resource.contentMetadata.ingredients.length} downloaded</span>
                            </summary>
                            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                              {resource.contentMetadata.ingredients.map((ing) => {
                                const isDownloaded = isIngredientDownloaded(resource, ing.identifier)
                                const ingredientKey = `${getResourceKey(resource)}/${ing.identifier}`
                                const isDownloading = downloadingIngredients.has(ingredientKey)
                                
                                return (
                                  <div 
                                    key={ing.identifier} 
                                    className="relative flex flex-col gap-1.5 text-xs p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors group/item"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-mono font-semibold text-gray-900">{ing.identifier}</span>
                                      
                                      {isDownloading ? (
                                        <Loader className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
                                      ) : isDownloaded ? (
                                        <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                      ) : (
                                        <Circle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                                      )}
                                    </div>
                                    
                                    <span className="text-gray-500 text-[11px] truncate">{ing.title}</span>
                                    
                                    {isDownloading && downloadProgress[ingredientKey] !== undefined && (
                                      <div className="text-blue-600 font-medium text-[11px]">
                                        {downloadProgress[ingredientKey]?.toFixed(0)}%
                                      </div>
                                    )}
                                    
                                    {!isDownloaded && !isDownloading && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDownloadIngredient(resource, ing.identifier)
                                        }}
                                        className="absolute top-2 right-2 p-1 hover:bg-blue-100 rounded transition-colors opacity-0 group-hover/item:opacity-100"
                                        title="Download"
                                      >
                                        <Download className="w-3 h-3 text-blue-600" />
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                    
                    <div className="ml-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* Download All button */}
                      {(!resource.availability.offline || resource.availability.partial) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownloadAll(resource)
                          }}
                          disabled={downloadingResources.has(getResourceKey(resource))}
                          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Download all"
                        >
                          {downloadingResources.has(getResourceKey(resource)) ? (
                            <Loader className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      
                      {/* View JSON button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedResource(resource)
                          setShowJson(true)
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="View JSON"
                      >
                        <Code className="w-4 h-4 text-gray-400" />
                      </button>
                      
                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteResource(resource)
                        }}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors group/btn"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-gray-400 group-hover/btn:text-red-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
      
      {/* JSON Modal */}
      {selectedResource && showJson && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Metadata</h2>
              <button
                onClick={() => setShowJson(false)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-gray-50">
              <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-xl overflow-x-auto font-mono">
                {JSON.stringify(selectedResource, null, 2)}
              </pre>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-white">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(selectedResource, null, 2))
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Add Resources Wizard */}
      {showAddWizard && (
        <AddToCatalogWizard
          onClose={() => setShowAddWizard(false)}
          onComplete={() => {
            // Refresh catalog after adding resources
            loadCatalog()
          }}
        />
      )}
    </div>
  )
}
