/**
 * SimpleResourceWizard - Fast and easy resource addition
 *
 * Minimal-click interface for adding resources to panels
 */

import { BookOpen, Check, Download, Library, Package, Plus, Search, X } from 'lucide-react'
import { useSimpleResourceWizard } from '../../features/wizard/useSimpleResourceWizard'
import { AddToCatalogWizard } from '../catalog/AddToCatalogWizard'
import { SimpleCollectionCreator } from '../collections/SimpleCollectionCreator'

interface SimpleResourceWizardProps {
  targetPanel: 'panel-1' | 'panel-2'
  onClose: () => void
  onAddResource: (resourceId: string) => void
}

export function SimpleResourceWizard({ targetPanel, onClose, onAddResource }: SimpleResourceWizardProps) {
  const {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    addedResources,
    subModal,
    setSubModal,
    previousModal,
    collections,
    catalogOnlyResources,
    filteredCatalogResources,
    isLoadingCatalog,
    handleAddResource,
    handleCatalogComplete,
    handleCollectionComplete,
    handleOpenCatalogFromCollection,
    handleBackFromCatalog,
    setPreviousModal,
  } = useSimpleResourceWizard(onAddResource)

  const panelNumber = targetPanel === 'panel-1' ? '1' : '2'

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
      <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col overflow-hidden">
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
    <div className="fixed inset-0 bg-overlay backdrop-blur-sm flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full ${targetPanel === 'panel-1' ? 'bg-panel-1' : 'bg-panel-2'} text-white flex items-center justify-center font-bold text-lg`}>
              {panelNumber}
            </div>
            <BookOpen className={`w-6 h-6 ${targetPanel === 'panel-1' ? 'text-panel-1-fg' : 'text-panel-2-fg'}`} />
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors text-fg-secondary"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Action Buttons */}
        <div className="px-6 py-4 border-b border-border space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg-muted" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                aria-label="Search resources"
              />
            </div>
            {activeTab === 'collections' && (
              <button
                onClick={() => setSubModal('create-collection')}
                className="p-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                title="New collection"
                aria-label="Create new collection"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            {activeTab === 'catalog' && (
              <button
                onClick={() => setSubModal('add-to-catalog')}
                className="p-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                title="Import from Door43"
                aria-label="Import resources from Door43"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border -mb-3">
            <button
              onClick={() => setActiveTab('collections')}
              className={`px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'collections'
                  ? `${targetPanel === 'panel-1' ? 'border-panel-1' : 'border-panel-2'}`
                  : 'border-transparent hover:border-border'
              }`}
              title="My collections"
              aria-label="My collections"
            >
              <div className="flex items-center gap-2">
                <Package className={`w-5 h-5 ${activeTab === 'collections' ? (targetPanel === 'panel-1' ? 'text-panel-1-fg' : 'text-panel-2-fg') : 'text-fg-secondary'}`} />
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'collections'
                    ? (targetPanel === 'panel-1' ? 'bg-panel-1-soft text-panel-1-fg' : 'bg-panel-2-soft text-panel-2-fg')
                    : 'bg-muted text-fg-secondary'
                }`}>
                  {collections.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'catalog'
                  ? `${targetPanel === 'panel-1' ? 'border-panel-1' : 'border-panel-2'}`
                  : 'border-transparent hover:border-border'
              }`}
              title="Browse catalog"
              aria-label="Browse catalog"
            >
              <div className="flex items-center gap-2">
                <Library className={`w-5 h-5 ${activeTab === 'catalog' ? (targetPanel === 'panel-1' ? 'text-panel-1-fg' : 'text-panel-2-fg') : 'text-fg-secondary'}`} />
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeTab === 'catalog'
                    ? (targetPanel === 'panel-1' ? 'bg-panel-1-soft text-panel-1-fg' : 'bg-panel-2-soft text-panel-2-fg')
                    : 'bg-muted text-fg-secondary'
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
                  <Package className="w-20 h-20 text-fg-muted mx-auto mb-6" />
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setSubModal('create-collection')}
                      className="p-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors shadow-sm"
                      title="Create collection"
                      aria-label="Create new collection"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setActiveTab('catalog')}
                      className="p-3 bg-muted text-fg-secondary rounded-lg hover:bg-muted transition-colors"
                      title="Browse catalog"
                      aria-label="Switch to catalog tab"
                    >
                      <Library className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                collections.map((collection) => (
                  <div key={collection.id} className="border border-border rounded-lg p-4">
                    <h3 className="font-semibold text-fg mb-3 flex items-center gap-2">
                      <Package className="w-5 h-5 text-fg-secondary" />
                      {collection.name}
                    </h3>
                    <div className="space-y-2">
                      {collection.resources.map((resource) => {
                        const isAdded = addedResources.has(resource.id)
                        const Icon = resource.icon
                        return (
                          <button
                            key={resource.id}
                            onClick={() => handleAddResource(resource.id)}
                            disabled={isAdded}
                            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                              isAdded
                                ? 'bg-accent-soft border-accent cursor-not-allowed'
                                : `border-border hover:border-accent hover:bg-accent-soft`
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <Icon className={`w-5 h-5 ${isAdded ? 'text-accent' : 'text-fg-secondary'}`} />
                              <div className="text-left">
                                <div className={`font-medium ${isAdded ? 'text-accent-fg' : 'text-fg'}`}>
                                  {resource.name}
                                </div>
                                <div className="text-xs text-fg-secondary capitalize">{resource.type}</div>
                              </div>
                            </div>
                            {isAdded ? (
                              <Check className="w-5 h-5 text-accent" />
                            ) : (
                              <Plus className={`w-5 h-5 ${targetPanel === 'panel-1' ? 'text-panel-1-fg' : 'text-panel-2-fg'}`} />
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
                    <Library className="w-20 h-20 text-fg-muted mx-auto mb-6 animate-pulse" />
                    <div className="text-fg-secondary">Loading catalog...</div>
                  </div>
                ) : catalogOnlyResources.length === 0 ? (
                  // Empty catalog - show import button
                  <div className="text-center py-16">
                    <Library className="w-20 h-20 text-fg-muted mx-auto mb-6" />
                    <button
                      onClick={() => setSubModal('add-to-catalog')}
                      className="p-3 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors shadow-sm"
                      title="Import from Door43"
                      aria-label="Import resources from Door43"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                ) : filteredCatalogResources.length === 0 ? (
                  // Has resources but search returned nothing
                  <div className="text-center py-16">
                    <Search className="w-20 h-20 text-fg-muted mx-auto" />
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
                            ? 'bg-accent-soft border-accent cursor-not-allowed'
                            : `border-border hover:border-accent hover:bg-accent-soft`
                        }`}
                      >
                        <div className="text-left flex-1">
                          <div className={`font-medium ${isAdded ? 'text-accent-fg' : 'text-fg'}`}>
                            {resource.name}
                          </div>
                          <div className="text-sm text-fg-secondary">
                            {resource.owner} • {resource.language} • {resource.type}
                          </div>
                        </div>
                        {isAdded ? (
                          <Check className="w-5 h-5 text-accent" />
                        ) : resource.downloaded ? (
                          <Plus className={`w-5 h-5 ${targetPanel === 'panel-1' ? 'text-panel-1-fg' : 'text-panel-2-fg'}`} />
                        ) : (
                          <Download className="w-5 h-5 text-accent" />
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
        <div className="px-6 py-4 border-t border-border bg-muted flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className={`w-5 h-5 ${targetPanel === 'panel-1' ? 'text-panel-1-fg' : 'text-panel-2-fg'}`} />
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              targetPanel === 'panel-1' ? 'bg-panel-1-soft text-panel-1-fg' : 'bg-panel-2-soft text-panel-2-fg'
            }`}>
              {addedResources.size}
            </span>
          </div>
          <button
            onClick={onClose}
            className={`px-6 py-2 ${targetPanel === 'panel-1' ? 'bg-panel-1 hover:opacity-90' : 'bg-panel-2 hover:opacity-90'} text-white rounded-lg transition-colors font-medium`}
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
