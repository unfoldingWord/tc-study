/**
 * ResourceBrowser - Browse and add resources from catalog or online
 * Offline-first: searches local catalog first, then Door43
 */

import { X, Search, Download, Database, Wifi, Loader } from 'lucide-react'
import { useState } from 'react'
import { useCatalogManager } from '../../contexts'
import type { ResourceMetadata } from '@bt-synergy/catalog-manager'

interface Resource {
  id: string
  owner: string
  language: string
  title: string
  subject: string
  location: 'catalog' | 'online'
  resourceKey: string
  metadata: ResourceMetadata
}

interface ResourceBrowserProps {
  onClose: () => void
  onSelectResource: (resource: Resource) => void
  targetPanel: 1 | 2
}

export function ResourceBrowser({ onClose, onSelectResource, targetPanel }: ResourceBrowserProps) {
  const catalogManager = useCatalogManager()
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [results, setResults] = useState<Resource[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  const [selectedOwner, setSelectedOwner] = useState('unfoldingWord')
  const [selectedSubject, setSelectedSubject] = useState('Bible')

  /**
   * Search both catalog (offline) and Door43 (online)
   */
  const handleSearch = async () => {
    setIsSearching(true)
    
    try {
      // Build search filters
      const filters: any = {}
      if (selectedLanguage) filters.language = selectedLanguage
      if (selectedOwner) filters.owner = selectedOwner
      if (selectedSubject) filters.subject = selectedSubject
      if (searchQuery) filters.searchText = searchQuery

      console.log('🔍 Searching with filters:', filters)

      // Search catalog (this searches both local cache AND online)
      const catalogResults = await catalogManager.searchCatalog(filters)

      console.log(`📚 Found ${catalogResults.length} resources`)

      // Transform to UI format
      const uiResults: Resource[] = await Promise.all(
        catalogResults.map(async (metadata) => {
          // Check if this resource has cached content
          const isOffline = await catalogManager.isResourceCached(metadata.resourceKey)

          return {
            id: metadata.resourceId || metadata.resourceKey,
            owner: metadata.owner,
            language: metadata.language,
            title: metadata.title,
            subject: metadata.subject || 'Unknown',
            location: isOffline ? 'catalog' as const : 'online' as const,
            resourceKey: metadata.resourceKey,
            metadata,
          }
        })
      )

      setResults(uiResults)
    } catch (error) {
      console.error('❌ Search failed:', error)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Add Resource to Panel {targetPanel}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Search locally cached resources or browse online
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 space-y-3">
          <div className="flex gap-3">
            <select
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Organizations</option>
              <option value="unfoldingWord">unfoldingWord</option>
              <option value="Door43-Catalog">Door43 Catalog</option>
            </select>

            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Languages</option>
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="pt">Portuguese</option>
              <option value="hbo">Biblical Hebrew</option>
              <option value="el-x-koine">Koine Greek</option>
            </select>

            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">All Types</option>
              <option value="Bible">Bible</option>
              <option value="Aligned Bible">Aligned Bible</option>
              <option value="TSV Translation Notes">Translation Notes</option>
              <option value="TSV Translation Words Links">Translation Words</option>
              <option value="TSV Translation Questions">Translation Questions</option>
              <option value="Translation Academy">Translation Academy</option>
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search resources..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium flex items-center gap-2"
            >
              {isSearching && <Loader className="w-4 h-4 animate-spin" />}
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto p-6">
          {results.length === 0 ? (
            <div className="text-center py-12">
              <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {searchQuery ? 'No resources found. Try a different search.' : 'Enter a search term to find resources.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((resource) => (
                <button
                  key={resource.id}
                  onClick={() => onSelectResource(resource)}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{resource.title}</h4>
                        {resource.location === 'catalog' ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                            <Database className="w-3 h-3" />
                            Cached
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            <Wifi className="w-3 h-3" />
                            Online
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {resource.owner} • {resource.language.toUpperCase()} • {resource.subject}
                      </p>
                    </div>
                    
                    {resource.location === 'online' && (
                      <Download className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 text-gray-600">
              <div className="flex items-center gap-1.5">
                <Database className="w-4 h-4 text-green-600" />
                <span>Offline-ready</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-blue-600" />
                <span>Auto-downloads from online</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
