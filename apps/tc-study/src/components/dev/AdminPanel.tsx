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
  const cacheAdapter = useCacheAdapter()
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
      
      console.log('[AdminPanel] Found resource keys:', allResourceKeys.length)
      
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
        
        const resourceType = resourceTypeRegistry.get(metadata.type)
        const priority = resourceType?.downloadPriority ?? 50
        
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
      console.log('[AdminPanel] Loaded resource data:', {
        total: resourcesData.length,
        complete: resourcesData.filter(r => r.completeness.isComplete).length,
        incomplete: resourcesData.filter(r => !r.completeness.isComplete && r.completeness.status !== 'error').length,
        errors: resourcesData.filter(r => r.completeness.status === 'error').length
      })
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
        className="fixed bottom-16 left-4 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-full shadow-lg flex items-center justify-center z-50 transition-colors"
        title="Admin Panel"
      >
        <Database className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-purple-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Resource Admin Panel</h2>
              <p className="text-xs text-gray-500">Development Tool - Not visible in production</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 border-b border-gray-200">
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium text-gray-600">Total Resources</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-gray-600">Complete</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.complete}</div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-medium text-gray-600">Incomplete</span>
            </div>
            <div className="text-2xl font-bold text-amber-600">{stats.incomplete}</div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-xs font-medium text-gray-600">Errors</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.error}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Status</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Incomplete</option>
            <option value="error">Errors</option>
          </select>

          <button
            onClick={loadResourcesData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-lg text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Resource List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
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
        <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
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
      <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
        <Download className="w-3 h-3" />
        Missing
      </span>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        )}
        
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-sm font-medium text-gray-900 truncate">
              {metadata.resourceKey}
            </span>
            {getStatusBadge()}
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
              Priority: {priority}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {metadata.title || metadata.resourceKey} • {metadata.type}
          </div>
        </div>

        {dependencies.length > 0 && (
          <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium flex-shrink-0">
            <Package className="w-3 h-3" />
            {dependencies.length} {dependencies.length === 1 ? 'dependency' : 'dependencies'}
          </span>
        )}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
          {/* Metadata */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Metadata</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Resource Key:</span>
                <span className="ml-2 font-mono text-gray-900">{metadata.resourceKey}</span>
              </div>
              <div>
                <span className="text-gray-500">Type:</span>
                <span className="ml-2 font-mono text-gray-900">{metadata.type}</span>
              </div>
              <div>
                <span className="text-gray-500">Title:</span>
                <span className="ml-2 text-gray-900">{metadata.title || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Language:</span>
                <span className="ml-2 text-gray-900">{metadata.language || 'N/A'}</span>
              </div>
              {metadata.contentMetadata?.ingredients && (
                <div className="col-span-2">
                  <span className="text-gray-500">Ingredients:</span>
                  <span className="ml-2 text-gray-900">
                    {metadata.contentMetadata.ingredients.length} items
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Cache Status */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Cache Status</h4>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Status:</span>
                <span className="font-mono text-gray-900">{completeness.status}</span>
              </div>
              {completeness.lastDownloadedAt && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Last Downloaded:</span>
                  <span className="text-gray-900">
                    {new Date(completeness.lastDownloadedAt).toLocaleString()}
                  </span>
                </div>
              )}
              {completeness.size && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Size:</span>
                  <span className="text-gray-900">
                    {(completeness.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              )}
              {completeness.error && (
                <div className="flex items-start gap-2">
                  <span className="text-red-600">Error:</span>
                  <span className="text-red-900 font-mono flex-1">{completeness.error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Dependencies */}
          {dependencies.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Dependencies</h4>
              <div className="space-y-1">
                {dependencies.map((dep) => (
                  <div
                    key={dep}
                    className="flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-200"
                  >
                    <Package className="w-3 h-3 text-blue-600 flex-shrink-0" />
                    <span className="font-mono text-xs text-gray-900">{dep}</span>
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
