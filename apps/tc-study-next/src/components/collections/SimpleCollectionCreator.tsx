/**
 * Simple Collection Creator
 * Just pick resources from library and give it a name
 */

import { useState, useEffect } from 'react'
import { X, Check, Search, Package, Plus, Download } from 'lucide-react'
import { useCatalogManager } from '../../contexts/CatalogContext'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { usePackageStore } from '../../lib/stores/packageStore'

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
      const collectionId = `col-${Date.now()}`
      const selectedResources = resources.filter(r =>
        selectedResourceKeys.has(getResourceKey(r))
      )
      const name = collectionName.trim()
      const resourceIds = selectedResources.map((r) => getResourceKey(r))

      // Persist via packageStore (IndexedDB) so Collections list / reload see it
      const packageStore = usePackageStore.getState()
      if (!packageStore.packageManager) {
        await packageStore.initialize()
      }

      await packageStore.savePackage({
        id: collectionId,
        name,
        title: name,
        description: `Collection with ${selectedResources.length} resource${selectedResources.length !== 1 ? 's' : ''}`,
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        status: 'installed',
        resources: selectedResources.map((r) => ({
          server: r.server || 'https://git.door43.org',
          owner: r.owner,
          language: r.language,
          resourceId: r.resourceId,
          displayName: r.title,
        })),
        panelLayout: {
          panels: [
            {
              id: 'panel-1',
              title: 'Panel 1',
              resourceIds,
              defaultResourceId: resourceIds[0],
            },
          ],
          orientation: 'horizontal',
        },
        // title/status used by Collections list filter + PackageCard
      } as never)

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
        <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0 bg-muted">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onAddResources && (
              <button
                onClick={onAddResources}
                className="p-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                title="Add resources to library"
                aria-label="Add resources to library"
                data-testid="add-resources-btn"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface rounded-lg transition-colors text-fg-secondary"
              title="Close"
              aria-label="Close"
              data-testid="simple-creator-close-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collection Name */}
        <div className="px-6 py-4 border-b border-border flex-shrink-0 bg-surface">
          <input
            type="text"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="Name..."
            className="w-full px-4 py-2 border border-border rounded-lg bg-canvas text-fg focus:ring-2 focus:ring-accent focus:border-accent text-sm"
            aria-label="Collection name"
            autoFocus
            data-testid="collection-name-input"
          />
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-border flex-shrink-0 bg-surface">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm bg-canvas text-fg focus:ring-2 focus:ring-accent focus:border-accent"
              aria-label="Search resources"
              data-testid="resource-search-input"
            />
          </div>
        </div>

        {/* Resource List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-canvas">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="text-center py-16">
              {resources.length === 0 ? (
                <>
                  <Package className="w-20 h-20 text-fg-muted mx-auto mb-6 opacity-60" />
                  {onAddResources && (
                    <button
                      onClick={onAddResources}
                      className="p-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors shadow-sm"
                      title="Add resources to library"
                      aria-label="Add resources to library"
                      data-testid="empty-add-resources-btn"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  )}
                </>
              ) : (
                <Search className="w-20 h-20 text-fg-muted mx-auto opacity-60" />
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
                        ? 'border-accent bg-accent-soft'
                        : 'border-border hover:border-accent bg-surface'
                    }`}
                    data-testid={`resource-${resourceKey}`}
                  >
                    {/* Checkbox */}
                    <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      isSelected
                        ? 'bg-accent border-accent'
                        : 'border-border'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>

                    {/* Resource Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-fg truncate">{resource.title}</h3>
                        {isDownloaded && (
                          <span title="Downloaded"><Download className="w-4 h-4 text-accent flex-shrink-0" aria-label="Downloaded" /></span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-fg-secondary">
                        <span className="px-2 py-0.5 bg-muted rounded">{resource.language}</span>
                        <span className="px-2 py-0.5 bg-muted rounded">{resource.subject}</span>
                        <span className="px-2 py-0.5 bg-muted rounded">{resource.resourceId}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between flex-shrink-0 bg-muted">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-accent" />
            <span className="px-3 py-1 bg-accent-soft text-accent-fg rounded-full text-sm font-semibold">
              {selectedResourceKeys.size}
            </span>
          </div>
          
          <button
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="p-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {content}
      </div>
    </div>
  )
}
