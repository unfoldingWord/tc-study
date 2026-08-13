/**
 * Admin Panel - Development Tool
 *
 * Shows resource metadata, dependencies, loading status, and cache status
 * Only visible in development mode
 */

import { useState, useEffect } from 'react'
import {
  Database,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Package,
  AlertCircle,
  Search,
  RefreshCw
} from 'lucide-react'
import { useCatalogManager, useResourceTypeRegistry, useCacheAdapter, useCompletenessChecker } from '../../contexts'
import { getDownloadPriority } from '../../config/loaderConfig'
import { DependencyResolver } from '../../lib/services/DependencyResolver'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceCompletenessStatus } from '../../lib/services/ResourceCompletenessChecker'

interface ResourceWithStatus {
  metadata: ResourceMetadata
  completeness: ResourceCompletenessStatus
  dependencies: string[]
  priority: number
}

export function AdminPanel() {
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const _cacheAdapter = useCacheAdapter()
  const completenessChecker = useCompletenessChecker()
  const [isOpen, setIsOpen] = useState(false)
  const [resources, setResources] = useState<ResourceWithStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'incomplete' | 'error'>('all')

  // Load resources data
  const loadResourcesData = async () => {
    setLoading(true)
    try {
      // Get all resource keys from catalog
      const allResourceKeys = await catalogManager.getAllResourceKeys()


      // Create dependency resolver
      const dependencyResolver = new DependencyResolver(
        catalogManager,
        resourceTypeRegistry,
        completenessChecker,
        false
      )

      // Load data for each resource
      const resourcesData: ResourceWithStatus[] = []

      for (const resourceKey of allResourceKeys) {
        // Get metadata for this resource
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
        if (!metadata) {
          console.warn('[AdminPanel] No metadata for:', resourceKey)
          continue
        }

        const completeness = await completenessChecker.checkResource(resourceKey)
        const dependencies = await dependencyResolver.resolveDependencies(resourceKey)

        const priority = getDownloadPriority(metadata.type)

        resourcesData.push({
          metadata,
          completeness,
          dependencies,
          priority
        })
      }

      // Sort by priority then by name
      resourcesData.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority
        }
        return a.metadata.resourceKey.localeCompare(b.metadata.resourceKey)
      })

      setResources(resourcesData)
    } catch (error) {
      console.error('[AdminPanel] Failed to load resources data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadResourcesData()
    }
  }, [isOpen])

  const toggleResource = (resourceKey: string) => {
    setExpandedResources(prev => {
      const newSet = new Set(prev)
      if (newSet.has(resourceKey)) {
        newSet.delete(resourceKey)
      } else {
        newSet.add(resourceKey)
      }
      return newSet
    })
  }

  // Filter resources
  const filteredResources = resources.filter(r => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      if (!r.metadata.resourceKey.toLowerCase().includes(query) &&
          !r.metadata.title?.toLowerCase().includes(query)) {
        return false
      }
    }

    // Status filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'complete' && !r.completeness.isComplete) return false
      if (filterStatus === 'incomplete' && (r.completeness.isComplete || r.completeness.status === 'error')) return false
      if (filterStatus === 'error' && r.completeness.status !== 'error') return false
    }

    return true
  })

  // Stats
  const stats = {
    total: resources.length,
    complete: resources.filter(r => r.completeness.isComplete).length,
    incomplete: resources.filter(r => !r.completeness.isComplete && r.completeness.status !== 'error').length,
    error: resources.filter(r => r.completeness.status === 'error').length
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-16 left-4 bg-panel-2 hover:opacity-90 text-white p-3 rounded-full shadow-lg flex items-center justify-center z-50 transition-colors"
        title="Admin Panel"
      >
        <Database className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-overlay z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-panel-2-fg" />
            <div>
              <h2 className="text-xl font-bold text-fg">Resource Admin Panel</h2>
              <p className="text-xs text-fg-secondary">Development Tool - Not visible in production</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-fg-muted hover:text-fg-secondary transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-muted border-b border-border">
          <div className="bg-surface rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-accent" />
              <span className="text-xs font-medium text-fg-secondary">Total Resources</span>
            </div>
            <div className="text-2xl font-bold text-fg">{stats.total}</div>
          </div>
          <div className="bg-surface rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-accent" />
              <span className="text-xs font-medium text-fg-secondary">Complete</span>
            </div>
            <div className="text-2xl font-bold text-accent">{stats.complete}</div>
          </div>
          <div className="bg-surface rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-fg-secondary" />
              <span className="text-xs font-medium text-fg-secondary">Incomplete</span>
            </div>
            <div className="text-2xl font-bold text-fg-secondary">{stats.incomplete}</div>
          </div>
          <div className="bg-surface rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-danger" />
              <span className="text-xs font-medium text-fg-secondary">Errors</span>
            </div>
            <div className="text-2xl font-bold text-danger">{stats.error}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as 'all' | 'complete' | 'incomplete' | 'error')
            }
            className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">All Status</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Incomplete</option>
            <option value="error">Errors</option>
          </select>

          <button
            onClick={loadResourcesData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-panel-2 hover:opacity-90 disabled:bg-gray-300 text-white rounded-lg text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Resource List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-8 h-8 text-panel-2-fg animate-spin" />
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fg-muted">
              <Database className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">No resources found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredResources.map((resource) => (
                <ResourceCard
                  key={resource.metadata.resourceKey}
                  resource={resource}
                  isExpanded={expandedResources.has(resource.metadata.resourceKey)}
                  onToggle={() => toggleResource(resource.metadata.resourceKey)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ResourceCardProps {
  resource: ResourceWithStatus
  isExpanded: boolean
  onToggle: () => void
}

function ResourceCard({ resource, isExpanded, onToggle }: ResourceCardProps) {
  const { metadata, completeness, dependencies, priority } = resource

  // Status badge
  const getStatusBadge = () => {
    if (completeness.isComplete) {
      return (
        <span className="flex items-center gap-1 px-2 py-1 bg-accent-soft text-accent-fg rounded text-xs font-medium">
          <CheckCircle className="w-3 h-3" />
          Complete
        </span>
      )
    }
    if (completeness.status === 'error') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      )
    }
    if (completeness.status === 'partial') {
      return (
        <span className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
          <Clock className="w-3 h-3" />
          Partial
        </span>
      )
    }
    return (
      <span className="flex items-center gap-1 px-2 py-1 bg-muted text-fg-secondary rounded text-xs font-medium">
        <Download className="w-3 h-3" />
        Missing
      </span>
    )
  }

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-muted transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-fg-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-fg-muted flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-medium text-fg truncate">
              {metadata.resourceKey}
            </span>
            {getStatusBadge()}
            <span className="px-2 py-0.5 bg-panel-2-soft text-panel-2-fg rounded text-xs font-medium">
              Priority: {priority}
            </span>
          </div>
          <div className="text-xs text-fg-secondary">
            {metadata.title || metadata.resourceKey} • {metadata.type}
          </div>
        </div>

        {dependencies.length > 0 && (
          <span className="flex items-center gap-1 px-2 py-1 bg-accent-soft text-accent-fg rounded text-xs font-medium flex-shrink-0">
            <Package className="w-3 h-3" />
            {dependencies.length} {dependencies.length === 1 ? 'dependency' : 'dependencies'}
          </span>
        )}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-border bg-muted p-4 space-y-4">
          {/* Metadata */}
          <div>
            <h4 className="text-xs font-semibold text-fg-secondary mb-2">Metadata</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-fg-secondary">Resource Key:</span>
                <span className="ml-2 font-mono text-fg">{metadata.resourceKey}</span>
              </div>
              <div>
                <span className="text-fg-secondary">Type:</span>
                <span className="ml-2 font-mono text-fg">{metadata.type}</span>
              </div>
              <div>
                <span className="text-fg-secondary">Title:</span>
                <span className="ml-2 text-fg">{metadata.title || 'N/A'}</span>
              </div>
              <div>
                <span className="text-fg-secondary">Language:</span>
                <span className="ml-2 text-fg">{metadata.language || 'N/A'}</span>
              </div>
              {metadata.contentMetadata?.ingredients && (
                <div className="col-span-2">
                  <span className="text-fg-secondary">Ingredients:</span>
                  <span className="ml-2 text-fg">
                    {metadata.contentMetadata.ingredients.length} items
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Cache Status */}
          <div>
            <h4 className="text-xs font-semibold text-fg-secondary mb-2">Cache Status</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-fg-secondary">Status:</span>
                <span className="font-mono text-fg">{completeness.status}</span>
              </div>
              {completeness.lastDownloadedAt && (
                <div className="flex items-center gap-2">
                  <span className="text-fg-secondary">Last Downloaded:</span>
                  <span className="text-fg">
                    {new Date(completeness.lastDownloadedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {completeness.size && (
                <div className="flex items-center gap-2">
                  <span className="text-fg-secondary">Size:</span>
                  <span className="text-fg">
                    {(completeness.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
              {completeness.error && (
                <div className="flex items-start gap-2">
                  <span className="text-danger">Error:</span>
                  <span className="text-red-900 font-mono flex-1">{completeness.error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Dependencies */}
          {dependencies.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-fg-secondary mb-2">Dependencies</h4>
              <div className="space-y-1">
                {dependencies.map((dep) => (
                  <div
                    key={dep}
                    className="flex items-center gap-2 px-2 py-1 bg-surface rounded border border-border"
                  >
                    <Package className="w-3 h-3 text-accent flex-shrink-0" />
                    <span className="font-mono text-xs text-fg">{dep}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
