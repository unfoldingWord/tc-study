/**
 * Simple Collection Creator
 * Just pick resources from library and give it a name
 */

import { useState, useEffect } from 'react'
import { X, Check, Search, Package, Plus, Download } from 'lucide-react'
import { useCatalogManager } from '../../contexts/CatalogContext'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'

interface SimpleCollectionCreatorProps {
  onClose: () => void
  onComplete?: (collectionId: string) => void
  onAddResources?: () => void
  isEmbedded?: boolean // If true, no modal wrapper
}

export function SimpleCollectionCreator({ onClose, onComplete, onAddResources, isEmbedded = false }: SimpleCollectionCreatorProps) {
  const catalogManager = useCatalogManager()
  
  const [resources, setResources] = useState<ResourceMetadata[]>([])
  const [selectedResourceKeys, setSelectedResourceKeys] = useState<Set<string>>(new Set())
  const [collectionName, setCollectionName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Load resources from library
  useEffect(() => {
    loadResources()
  }, [])

  const loadResources = async () => {
    setLoading(true)
    try {
      const allResources = await catalogManager.searchResources({})
      setResources(allResources || [])
    } catch (error) {
      console.error('Failed to load resources:', error)
      setResources([])
    } finally {
      setLoading(false)
    }
  }

  const getResourceKey = (resource: ResourceMetadata) => {
    return `${resource.owner}/${resource.language}/${resource.resourceId}`
  }

  const toggleResource = (resourceKey: string) => {
    const newSet = new Set(selectedResourceKeys)
    if (newSet.has(resourceKey)) {
      newSet.delete(resourceKey)
    } else {
      newSet.add(resourceKey)
    }
    setSelectedResourceKeys(newSet)
  }

  const filteredResources = resources.filter(r => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      r.title?.toLowerCase().includes(query) ||
      r.resourceId?.toLowerCase().includes(query) ||
      r.language?.toLowerCase().includes(query) ||
      r.subject?.toLowerCase().includes(query)
    )
  })

  const handleCreate = async () => {
    if (!collectionName.trim() || selectedResourceKeys.size === 0) {
      alert('Please enter a name and select at least one resource')
      return
    }

    setCreating(true)
    try {
      // Create collection manifest
      const collectionId = `col-${Date.now()}`
      const selectedResources = resources.filter(r => 
        selectedResourceKeys.has(getResourceKey(r))
      )

      const collection = {
        id: collectionId,
        title: collectionName.trim(),
        description: `Collection with ${selectedResources.length} resource${selectedResources.length !== 1 ? 's' : ''}`,
        resources: selectedResources.map(r => ({
          key: getResourceKey(r),
          title: r.title,
          type: r.type,
          language: r.language,
          resourceId: r.resourceId,
        })),
        createdAt: new Date().toISOString(),
        status: 'installed',
      }

      // Save to localStorage (package store)
      const stored = localStorage.getItem('tc-study-packages')
      const packages = stored ? JSON.parse(stored) : []
      packages.push(collection)
      localStorage.setItem('tc-study-packages', JSON.stringify(packages))

      console.log('✅ Collection created:', collection)
      
      if (onComplete) {
        onComplete(collectionId)
      }
      
      onClose()
    } catch (error) {
      console.error('Failed to create collection:', error)
      alert(`Failed to create collection: ${error}`)
    } finally {
      setCreating(false)
    }
  }

  const canCreate = collectionName.trim().length > 0 && selectedResourceKeys.size > 0

  const content = (
    <>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onAddResources && (
              <button
                onClick={onAddResources}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Add resources to library"
                aria-label="Add resources to library"
                data-testid="add-resources-btn"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
              aria-label="Close"
              data-testid="simple-creator-close-btn"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Collection Name */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <input
            type="text"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="Name..."
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            aria-label="Collection name"
            autoFocus
            data-testid="collection-name-input"
          />
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Search resources"
              data-testid="resource-search-input"
            />
          </div>
        </div>

        {/* Resource List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="text-center py-16">
              {resources.length === 0 ? (
                <>
                  <Package className="w-20 h-20 text-gray-300 mx-auto mb-6" />
                  {onAddResources && (
                    <button
                      onClick={onAddResources}
                      className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      title="Add resources to library"
                      aria-label="Add resources to library"
                      data-testid="empty-add-resources-btn"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  )}
                </>
              ) : (
                <Search className="w-20 h-20 text-gray-300 mx-auto" />
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredResources.map((resource) => {
                const resourceKey = getResourceKey(resource)
                const isSelected = selectedResourceKeys.has(resourceKey)
                const isDownloaded = resource.availability?.offline

                return (
                  <button
                    key={resourceKey}
                    onClick={() => toggleResource(resourceKey)}
                    className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    data-testid={`resource-${resourceKey}`}
                  >
                    {/* Checkbox */}
                    <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-gray-300'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>

                    {/* Resource Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 truncate">{resource.title}</h3>
                        {isDownloaded && (
                          <span title="Downloaded"><Download className="w-4 h-4 text-green-600 flex-shrink-0" aria-label="Downloaded" /></span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span className="px-2 py-0.5 bg-gray-100 rounded">{resource.language}</span>
                        <span className="px-2 py-0.5 bg-gray-100 rounded">{resource.subject}</span>
                        <span className="px-2 py-0.5 bg-gray-100 rounded">{resource.resourceId}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-gray-50">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-blue-600" />
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
              {selectedResourceKeys.size}
            </span>
          </div>
          
          <button
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={creating ? "Creating collection..." : "Create collection"}
            aria-label={creating ? "Creating collection..." : "Create collection"}
            data-testid="create-collection-btn"
          >
            {creating ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Check className="w-5 h-5" />
            )}
          </button>
        </div>
    </>
  )

  if (isEmbedded) {
    return content
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {content}
      </div>
    </div>
  )
}
