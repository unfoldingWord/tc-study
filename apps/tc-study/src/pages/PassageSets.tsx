/**
 * Passage Sets Page - Manage and create passage sets
 */

import { useState, useEffect } from 'react'
import { 
  FileText, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Download, 
  Upload,
  Copy,
  Eye
} from 'lucide-react'
// import { PassageSetManager, type PassageSet, countPassages } from '@bt-synergy/passage-sets'
// TODO: Re-enable when passage-sets package is properly set up
const PassageSetManager = null as any
type PassageSet = any
const countPassages = (set: any) => set.passages?.length || 0
import { HierarchicalPassageSetCreator } from '../components/passage-sets/HierarchicalPassageSetCreator'
import { PassageSetViewer } from '../components/passage-sets/PassageSetViewer'
import { DefaultPassageSetsModal } from '../components/passage-sets/DefaultPassageSetsModal'

export default function PassageSets() {
  const [manager] = useState(() => PassageSetManager ? new PassageSetManager() : null)
  const [passageSets, setPassageSets] = useState<PassageSet[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  
  // Modal states
  const [showForm, setShowForm] = useState(false)
  const [editingPassageSet, setEditingPassageSet] = useState<PassageSet | null>(null)
  const [viewingPassageSet, setViewingPassageSet] = useState<PassageSet | null>(null)
  const [showDefaultsModal, setShowDefaultsModal] = useState(false)

  // Load passage sets
  useEffect(() => {
    loadPassageSets()
  }, [])

  const loadPassageSets = async () => {
    if (!manager) return
    setLoading(true)
    try {
      const sets = await manager.getAll()
      setPassageSets(sets)
      
      // Extract categories
      const stats = await manager.getStats()
      setCategories(stats.categories)
    } catch (error) {
      console.error('Failed to load passage sets:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter passage sets
  const filteredPassageSets = passageSets.filter(ps => {
    const matchesQuery = !searchQuery || 
      ps.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ps.description?.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = !selectedCategory || ps.category === selectedCategory

    return matchesQuery && matchesCategory
  })

  const handleCreate = () => {
    setEditingPassageSet(null)
    setShowForm(true)
  }

  const handleEdit = (ps: PassageSet) => {
    setEditingPassageSet(ps)
    setShowForm(true)
  }

  const handleSave = async (saved: PassageSet) => {
    try {
      if (editingPassageSet) {
        await manager.update(saved.id, saved)
      } else {
        await manager.create(saved)
      }
      await loadPassageSets()
      setShowForm(false)
      setEditingPassageSet(null)
    } catch (error) {
      alert(`Failed to save: ${error}`)
    }
  }

  const handleDelete = async (ps: PassageSet) => {
    if (confirm(`Delete "${ps.name}"?`)) {
      try {
        await manager.delete(ps.id)
        await loadPassageSets()
      } catch (error) {
        alert(`Failed to delete: ${error}`)
      }
    }
  }

  const handleDuplicate = async (ps: PassageSet) => {
    try {
      await manager.duplicate(ps.id)
      await loadPassageSets()
    } catch (error) {
      alert(`Failed to duplicate: ${error}`)
    }
  }

  const handleExport = async (ps: PassageSet) => {
    try {
      const json = await manager.export(ps.id)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${ps.name.replace(/\s+/g, '-').toLowerCase()}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(`Failed to export: ${error}`)
    }
  }

  const handleExportAll = async () => {
    try {
      const json = await manager.exportAll()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `passage-sets-${Date.now()}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(`Failed to export: ${error}`)
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      await manager.importMany(text)
      await loadPassageSets()
      alert('Import successful!')
    } catch (error) {
      alert(`Failed to import: ${error}`)
    }
    event.target.value = ''
  }

  // Show message if package is not available
  if (!manager) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="p-4 bg-yellow-50 rounded-full inline-block mb-4">
            <FileText className="w-12 h-12 text-yellow-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Passage Sets Coming Soon
          </h2>
          <p className="text-gray-600 mb-4">
            The Passage Sets feature is currently under development. This page will allow you to create and manage custom passage sets for your translation work.
          </p>
          <div className="text-sm text-gray-500 bg-gray-100 rounded-lg p-4">
            <p className="font-medium mb-2">Planned Features:</p>
            <ul className="text-left space-y-1">
              <li>• Create hierarchical passage sets</li>
              <li>• Browse default passage sets</li>
              <li>• Import/export passage sets</li>
              <li>• Categorize and search</li>
            </ul>
          </div>
        </div>
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
              <div className="p-2 bg-green-50 rounded-lg">
                <FileText className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Passage Sets</h1>
                <p className="text-xs text-gray-500">
                  {passageSets.length} passage set{passageSets.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Browse Defaults */}
              <button
                onClick={() => setShowDefaultsModal(true)}
                className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                title="Browse default passage sets"
                aria-label="Browse default passage sets"
                data-testid="browse-defaults-btn"
              >
                <FileText className="w-5 h-5" />
              </button>

              {/* Import */}
              <label className="p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                title="Import"
                aria-label="Import passage sets"
                data-testid="import-btn"
              >
                <Upload className="w-5 h-5 text-gray-600" />
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>

              {/* Export All */}
              <button
                onClick={handleExportAll}
                disabled={passageSets.length === 0}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Export all"
                aria-label="Export all passage sets"
                data-testid="export-all-btn"
              >
                <Download className="w-5 h-5 text-gray-600" />
              </button>

              {/* Create New */}
              <button
                onClick={handleCreate}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="New passage set"
                aria-label="Create new passage set"
                data-testid="new-passage-set-btn"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search passage sets..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="search-input"
          />
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="category-filter"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pb-6">
        {/* Loading State */}
        {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredPassageSets.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">
            {passageSets.length === 0 ? 'No passage sets yet' : 'No matching passage sets'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {passageSets.length === 0 ? 'Create your first passage set to get started' : 'Try adjusting your filters'}
          </p>
        </div>
      )}

      {/* Passage Sets Grid */}
      {!loading && filteredPassageSets.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPassageSets.map(ps => (
            <div
              key={ps.id}
              className="group relative rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-all"
            >
              {/* Header */}
              <div className="mb-3">
                <h3 className="text-base font-semibold text-gray-900 mb-1 line-clamp-1">
                  {ps.name}
                </h3>
                {ps.description && (
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {ps.description}
                  </p>
                )}
              </div>

              {/* Metadata */}
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {ps.metadata?.category && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded">
                    {ps.metadata.category}
                  </span>
                )}
                <span className="px-2 py-1 bg-gray-50 text-gray-600 rounded">
                  {ps.metadata?.passageCount || countPassages(ps)} passage{(ps.metadata?.passageCount || countPassages(ps)) !== 1 ? 's' : ''}
                </span>
                {ps.metadata?.tags?.map((tag: any) => (
                  <span key={tag} className="px-2 py-1 bg-gray-50 text-gray-600 rounded">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setViewingPassageSet(ps)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="View"
                  aria-label={`View ${ps.name}`}
                  data-testid={`view-${ps.id}`}
                >
                  <Eye className="w-4 h-4 text-gray-600" />
                </button>

                <button
                  onClick={() => handleEdit(ps)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit"
                  aria-label={`Edit ${ps.name}`}
                  data-testid={`edit-${ps.id}`}
                >
                  <Edit2 className="w-4 h-4 text-gray-600" />
                </button>

                <button
                  onClick={() => handleDuplicate(ps)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Duplicate"
                  aria-label={`Duplicate ${ps.name}`}
                  data-testid={`duplicate-${ps.id}`}
                >
                  <Copy className="w-4 h-4 text-gray-600" />
                </button>

                <button
                  onClick={() => handleExport(ps)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Export"
                  aria-label={`Export ${ps.name}`}
                  data-testid={`export-${ps.id}`}
                >
                  <Download className="w-4 h-4 text-gray-600" />
                </button>

                <button
                  onClick={() => handleDelete(ps)}
                  className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                  aria-label={`Delete ${ps.name}`}
                  data-testid={`delete-${ps.id}`}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <HierarchicalPassageSetCreator
          initialSet={editingPassageSet}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false)
            setEditingPassageSet(null)
          }}
        />
      )}

      {/* Default Passage Sets Modal */}
      {showDefaultsModal && (
        <DefaultPassageSetsModal
          manager={manager}
          onClose={() => setShowDefaultsModal(false)}
          onImported={loadPassageSets}
        />
      )}

      {/* View Modal */}
      {viewingPassageSet && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-900">{viewingPassageSet.name}</h2>
              <button
                onClick={() => setViewingPassageSet(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {viewingPassageSet.description && (
                <p className="text-gray-600 mb-4">{viewingPassageSet.description}</p>
              )}

              <div className="space-y-4">
                {/* Metadata */}
                <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-100">
                  {viewingPassageSet.metadata?.category && (
                    <span className="inline-block px-2 py-1 bg-blue-50 text-blue-600 rounded text-sm">
                      {viewingPassageSet.metadata.category}
                    </span>
                  )}
                  {viewingPassageSet.metadata?.tags && viewingPassageSet.metadata.tags.length > 0 && (
                    viewingPassageSet.metadata.tags.map((tag: any) => (
                      <span key={tag} className="px-2 py-1 bg-gray-50 text-gray-600 rounded text-sm">
                        {tag}
                      </span>
                    ))
                  )}
                  <span className="px-2 py-1 bg-green-50 text-green-600 rounded text-sm">
                    {viewingPassageSet.metadata?.passageCount || countPassages(viewingPassageSet)} passages
                  </span>
                </div>

                {/* Hierarchical Structure */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Structure</h3>
                  <PassageSetViewer passageSet={viewingPassageSet} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
