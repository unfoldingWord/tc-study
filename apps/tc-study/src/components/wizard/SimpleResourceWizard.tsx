/**
 * SimpleResourceWizard - Fast and easy resource addition
 * 
 * Minimal-click interface for adding resources to panels
 */

import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import { BookOpen, BookText, Check, Download, Library, Link as LinkIcon, MessageSquare, Package, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCatalogManager } from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import { usePackageStore } from '../../lib/stores/packageStore'
import { AddToCatalogWizard } from '../catalog/AddToCatalogWizard'
import { SimpleCollectionCreator } from '../collections/SimpleCollectionCreator'

interface SimpleResourceWizardProps {
  targetPanel: 'panel-1' | 'panel-2'
  onClose: () => void
  onAddResource: (resourceId: string) => void
}

type SubModal = 'add-to-catalog' | 'create-collection' | null

export function SimpleResourceWizard({ targetPanel, onClose, onAddResource }: SimpleResourceWizardProps) {
  const [activeTab, setActiveTab] = useState<'collections' | 'catalog'>('collections')
  const [searchQuery, setSearchQuery] = useState('')
  const [addedResources, setAddedResources] = useState<Set<string>>(new Set())
  const [subModal, setSubModal] = useState<SubModal>(null)
  const [previousModal, setPreviousModal] = useState<SubModal>(null) // Track the previous modal for back navigation
  const [catalogResources, setCatalogResources] = useState<any[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)

  // Get real data from stores
  const packages = usePackageStore((s: any) => s.packages) || []
  const loadedResources = useAppStore((s) => s.loadedResources)
  const catalogManager = useCatalogManager()
  
  // Shared function to load catalog resources
  const loadCatalogResources = async () => {
    try {
      setIsLoadingCatalog(true)
      
      // Use the standard searchResources method with empty filters to get all resources
      const allMetadata = await catalogManager.searchResources({})
      
      console.log(`📚 Found ${allMetadata.length} resources in catalog`)
      
      const resources = allMetadata
        .filter((metadata): metadata is ResourceMetadata => metadata !== null)
        .map((metadata) => {
          try {
            console.log(`🔍 Processing resource:`, metadata.resourceKey)
            
            // Convert ResourceType enum to string if needed
            let typeString = 'unknown'
            if (typeof metadata.type === 'string') {
              typeString = metadata.type
            } else if (metadata.type && typeof metadata.type === 'object' && 'value' in metadata.type) {
              typeString = String(metadata.type.value)
            } else if (metadata.type) {
              typeString = String(metadata.type)
            }
            
            const resource = {
              id: metadata.resourceKey,
              name: metadata.title || metadata.resourceKey,
              owner: metadata.owner || 'unknown',
              language: metadata.language || 'en',
              type: typeString,
              subject: metadata.subject || 'unknown',
              downloaded: true,
            }
            console.log(`✅ Created resource object for ${metadata.resourceKey}:`, resource)
            return resource
          } catch (err) {
            console.error(`❌ Failed to process resource ${metadata.resourceKey}:`, err)
            return null
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
      
      const validResources = resources.filter(r => r !== null)
      console.log(`✅ Loaded ${validResources.length} valid resources from catalog`)
      setCatalogResources(validResources)
    } catch (error) {
      console.error('❌ Failed to load catalog resources:', error)
    } finally {
      setIsLoadingCatalog(false)
    }
  }

  // Load catalog resources on mount
  useEffect(() => {
    loadCatalogResources()
  }, [catalogManager])

  // Get icon for resource type
  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'scripture': return BookOpen
      case 'words': return BookText
      case 'notes': return MessageSquare
      case 'words-links': return LinkIcon
      default: return Library
    }
  }

  // Transform packages into collections format
  const collections = useMemo(() => {
    return packages.map((pkg: any) => ({
      id: pkg.id,
      name: pkg.title || pkg.name || pkg.id,
      resources: catalogResources
        .filter((r: any) => pkg.resources?.includes(r.id) || pkg.resourceIds?.includes(r.id))
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          type: r.type || 'unknown',
          icon: getResourceIcon(r.type || 'unknown'),
        }))
    })).filter((c: any) => c.resources.length > 0)
  }, [packages, catalogResources])

  // Filter catalog resources to exclude those in collections
  const catalogOnlyResources = useMemo(() => {
    const collectionResourceIds = new Set(
      collections.flatMap((c: any) => c.resources.map((r: any) => r.id))
    )
    
    return catalogResources.filter((r: any) => !collectionResourceIds.has(r.id))
  }, [catalogResources, collections])

  const panelColor = targetPanel === 'panel-1' ? 'blue' : 'purple'
  const panelNumber = targetPanel === 'panel-1' ? '1' : '2'

  const handleAddResource = (resourceId: string) => {
    onAddResource(resourceId)
    setAddedResources(prev => new Set([...prev, resourceId]))
  }

  const filteredCatalogResources = catalogOnlyResources.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.owner.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Handle sub-modal completion
  const handleCatalogComplete = async () => {
    // Reload catalog resources after import
    console.log('🔄 Reloading catalog after adding resources...')
    await loadCatalogResources()
    
    // If we came from collection creator, go back to it
    if (previousModal === 'create-collection') {
      setSubModal('create-collection')
      setPreviousModal(null)
    } else {
      setSubModal(null)
      setPreviousModal(null)
    }
  }

  const handleCollectionComplete = (collectionId?: string) => {
    setSubModal(null)
    setPreviousModal(null)
    console.log('✅ Collection created:', collectionId)
    // Could refresh collections list here
  }

  const handleOpenCatalogFromCollection = () => {
    setPreviousModal('create-collection') // Remember we came from collection creator
    setSubModal('add-to-catalog')
  }

  const handleBackFromCatalog = () => {
    // Go back to the previous modal (collection creator)
    if (previousModal) {
      setSubModal(previousModal)
      setPreviousModal(null)
    } else {
      setSubModal(null)
    }
  }

  // If a sub-modal is open, render it instead
  if (subModal === 'add-to-catalog') {
    return (
      <AddToCatalogWizard
        onClose={previousModal ? handleBackFromCatalog : () => setSubModal(null)}
        onComplete={handleCatalogComplete}
        isEmbedded={false}
      />
    )
  }

  if (subModal === 'create-collection') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
          <SimpleCollectionCreator
            onClose={() => {
              setSubModal(null)
              setPreviousModal(null)
            }}
            onComplete={handleCollectionComplete}
            onAddResources={handleOpenCatalogFromCollection}
            isEmbedded={true}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${panelColor === 'blue' ? 'bg-blue-500' : 'bg-purple-500'} text-white flex items-center justify-center font-bold text-lg`}>
              {panelNumber}
            </div>
            <BookOpen className={`w-6 h-6 ${panelColor === 'blue' ? 'text-blue-600' : 'text-purple-600'}`} />
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-700"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Action Buttons */}
        <div className="px-6 py-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Search resources"
              />
            </div>
            {activeTab === 'collections' && (
              <button
                onClick={() => setSubModal('create-collection')}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="New collection"
                aria-label="Create new collection"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            {activeTab === 'catalog' && (
              <button
                onClick={() => setSubModal('add-to-catalog')}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Import from Door43"
                aria-label="Import resources from Door43"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 -mb-3">
            <button
              onClick={() => setActiveTab('collections')}
              className={`px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'collections'
                  ? `${panelColor === 'blue' ? 'border-blue-600' : 'border-purple-600'}`
                  : 'border-transparent hover:border-gray-300'
              }`}
              title="My collections"
              aria-label="My collections"
            >
              <div className="flex items-center gap-2">
                <Package className={`w-5 h-5 ${activeTab === 'collections' ? (panelColor === 'blue' ? 'text-blue-600' : 'text-purple-600') : 'text-gray-500'}`} />
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'collections'
                    ? (panelColor === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {collections.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'catalog'
                  ? `${panelColor === 'blue' ? 'border-blue-600' : 'border-purple-600'}`
                  : 'border-transparent hover:border-gray-300'
              }`}
              title="Browse catalog"
              aria-label="Browse catalog"
            >
              <div className="flex items-center gap-2">
                <Library className={`w-5 h-5 ${activeTab === 'catalog' ? (panelColor === 'blue' ? 'text-blue-600' : 'text-purple-600') : 'text-gray-500'}`} />
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'catalog'
                    ? (panelColor === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {isLoadingCatalog ? '...' : catalogOnlyResources.length}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'collections' ? (
            // Collections Tab
            <div className="space-y-6">
              {collections.length === 0 ? (
                <div className="text-center py-16">
                  <Package className="w-20 h-20 text-gray-300 mx-auto mb-6" />
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setSubModal('create-collection')}
                      className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      title="Create collection"
                      aria-label="Create new collection"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setActiveTab('catalog')}
                      className="p-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      title="Browse catalog"
                      aria-label="Switch to catalog tab"
                    >
                      <Library className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                collections.map((collection: any) => (
                  <div key={collection.id} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Package className="w-5 h-5 text-gray-600" />
                      {collection.name}
                    </h3>
                    <div className="space-y-2">
                      {collection.resources.map((resource: any) => {
                        const isAdded = addedResources.has(resource.id)
                        const Icon = resource.icon
                        return (
                          <button
                            key={resource.id}
                            onClick={() => handleAddResource(resource.id)}
                            disabled={isAdded}
                            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                              isAdded
                                ? 'bg-green-50 border-green-300 cursor-not-allowed'
                                : `border-gray-200 hover:border-${panelColor}-300 hover:bg-${panelColor}-50`
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Icon className={`w-5 h-5 ${isAdded ? 'text-green-600' : 'text-gray-600'}`} />
                              <div className="text-left">
                                <div className={`font-medium ${isAdded ? 'text-green-900' : 'text-gray-900'}`}>
                                  {resource.name}
                                </div>
                                <div className="text-xs text-gray-500 capitalize">{resource.type}</div>
                              </div>
                            </div>
                            {isAdded ? (
                              <Check className="w-5 h-5 text-green-600" />
                            ) : (
                              <Plus className={`w-5 h-5 ${panelColor === 'blue' ? 'text-blue-600' : 'text-purple-600'}`} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            // Catalog Tab
            <div className="space-y-4">
              {/* Resources List */}
              <div className="space-y-2">
                {isLoadingCatalog ? (
                  // Loading state
                  <div className="text-center py-16">
                    <Library className="w-20 h-20 text-gray-300 mx-auto mb-6 animate-pulse" />
                    <div className="text-gray-500">Loading catalog...</div>
                  </div>
                ) : catalogOnlyResources.length === 0 ? (
                  // Empty catalog - show import button
                  <div className="text-center py-16">
                    <Library className="w-20 h-20 text-gray-300 mx-auto mb-6" />
                    <button
                      onClick={() => setSubModal('add-to-catalog')}
                      className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      title="Import from Door43"
                      aria-label="Import resources from Door43"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                ) : filteredCatalogResources.length === 0 ? (
                  // Has resources but search returned nothing
                  <div className="text-center py-16">
                    <Search className="w-20 h-20 text-gray-300 mx-auto" />
                  </div>
                ) : (
                  filteredCatalogResources.map(resource => {
                    const isAdded = addedResources.has(resource.id)
                    return (
                      <button
                        key={resource.id}
                        onClick={() => handleAddResource(resource.id)}
                        disabled={isAdded}
                        className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all ${
                          isAdded
                            ? 'bg-green-50 border-green-300 cursor-not-allowed'
                            : `border-gray-200 hover:border-${panelColor}-300 hover:bg-${panelColor}-50`
                        }`}
                      >
                        <div className="text-left flex-1">
                          <div className={`font-medium ${isAdded ? 'text-green-900' : 'text-gray-900'}`}>
                            {resource.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {resource.owner} • {resource.language} • {resource.type}
                          </div>
                        </div>
                        {isAdded ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : resource.downloaded ? (
                          <Plus className={`w-5 h-5 ${panelColor === 'blue' ? 'text-blue-600' : 'text-purple-600'}`} />
                        ) : (
                          <Download className="w-5 h-5 text-blue-600" />
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className={`w-5 h-5 ${panelColor === 'blue' ? 'text-blue-600' : 'text-purple-600'}`} />
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              panelColor === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {addedResources.size}
            </span>
          </div>
          <button
            onClick={onClose}
            className={`px-6 py-2 ${panelColor === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'} text-white rounded-lg transition-colors font-medium`}
            title="Close"
            aria-label="Close and return to studio"
          >
            <Check className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
