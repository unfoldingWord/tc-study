/**
 * Library - Browse and manage available resources
 */

import { Library as LibraryIcon, Search, RefreshCw, Download, Trash2, Plus } from 'lucide-react'
import { AddToCatalogWizard } from '../components/catalog/AddToCatalogWizard'
import { LibraryJsonModal } from '../features/library/LibraryJsonModal'
import { LibraryResourceCard } from '../features/library/LibraryResourceCard'
import { filterLibraryResources, getLibraryResourceKey } from '../features/library/libraryResourceKey'
import { useLibraryCatalog } from '../features/library/useLibraryCatalog'

export default function Library() {
  const {
    resources,
    completenessStatus,
    stats,
    loading,
    searchQuery,
    setSearchQuery,
    selectedResource,
    setSelectedResource,
    showJson,
    setShowJson,
    showAddWizard,
    setShowAddWizard,
    downloadingResources,
    downloadingIngredients,
    downloadProgress,
    loadCatalog,
    handleExportCatalog,
    handleDeleteResource,
    handleClearCatalog,
    handleDownloadAll,
    handleDownloadIngredient,
    isIngredientDownloaded,
  } = useLibraryCatalog()

  const filteredResources = filterLibraryResources(resources, searchQuery)

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
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <LibraryIcon className="w-5 h-5 text-blue-600" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Library</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddWizard(true)}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Add resources"
                aria-label="Add resources"
                data-testid="library-add-btn"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                onClick={() => void loadCatalog()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
                aria-label="Refresh catalog"
                data-testid="library-refresh-btn"
              >
                <RefreshCw className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={handleExportCatalog}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Export JSON"
                aria-label="Export catalog"
                data-testid="library-export-btn"
              >
                <Download className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={() => void handleClearCatalog()}
                className="p-2 hover:bg-red-50 rounded-lg transition-colors group"
                title="Clear catalog"
                aria-label="Clear catalog"
                data-testid="library-clear-btn"
              >
                <Trash2 className="w-5 h-5 text-gray-400 group-hover:text-red-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

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
                {Array.from(completenessStatus.values()).filter((s) => s.isComplete).length} /{' '}
                {resources.length}
              </div>
              <div className="text-xs text-gray-500 mt-1">Downloaded</div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 pb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search resources..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow placeholder:text-gray-400"
            aria-label="Search resources"
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-8">
        {filteredResources.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex p-4 bg-gray-50 rounded-full mb-4">
              <LibraryIcon className="w-8 h-8 text-gray-300" />
            </div>
            <p className="text-gray-900 font-medium">No resources yet</p>
            <p className="text-sm text-gray-500 mt-1">Add resources to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredResources.map((resource) => (
              <LibraryResourceCard
                key={getLibraryResourceKey(resource)}
                resource={resource}
                completenessStatus={completenessStatus}
                downloadingResources={downloadingResources}
                downloadingIngredients={downloadingIngredients}
                downloadProgress={downloadProgress}
                isIngredientDownloaded={isIngredientDownloaded}
                onDownloadAll={(r) => void handleDownloadAll(r)}
                onDownloadIngredient={(r, id) => void handleDownloadIngredient(r, id)}
                onViewJson={(r) => {
                  setSelectedResource(r)
                  setShowJson(true)
                }}
                onDelete={(r) => void handleDeleteResource(r)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedResource && showJson && (
        <LibraryJsonModal resource={selectedResource} onClose={() => setShowJson(false)} />
      )}

      {showAddWizard && (
        <AddToCatalogWizard
          onClose={() => setShowAddWizard(false)}
          onComplete={() => {
            void loadCatalog()
          }}
        />
      )}
    </div>
  )
}
