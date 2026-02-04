/**
 * Data Management - Import/Export for Passage Sets, Collections, and Resources
 */

import { useState, useRef, useEffect } from 'react'
import { 
  Upload, 
  Download, 
  FileText, 
  FolderOpen, 
  Library,
  Plus,
  Trash2,
  Edit2
} from 'lucide-react'
import type { PassageSet } from '../contexts/types'
import { useCatalogManager } from '../contexts/CatalogContext'
import { PassageSetForm } from '../components/data/PassageSetForm'
import { usePackageStore } from '../lib/stores'

type Tab = 'passage-sets' | 'collections' | 'resources'

export default function DataManagement() {
  const catalogManager = useCatalogManager()
  const packages = usePackageStore((state: any) => state.packages)
  const loadPackages = usePackageStore((state: any) => state.loadPackages)
  const [activeTab, setActiveTab] = useState<Tab>('passage-sets')
  
  // Passage Sets state
  const [passageSets, setPassageSets] = useState<PassageSet[]>([])
  const [showPassageSetForm, setShowPassageSetForm] = useState(false)
  const [editingPassageSet, setEditingPassageSet] = useState<PassageSet | null>(null)
  
  // File inputs
  const passageSetInputRef = useRef<HTMLInputElement>(null)
  const collectionInputRef = useRef<HTMLInputElement>(null)
  const resourceInputRef = useRef<HTMLInputElement>(null)

  // Load passage sets and packages on mount
  useEffect(() => {
    const stored = localStorage.getItem('tc-study-passage-sets')
    if (stored) {
      try {
        setPassageSets(JSON.parse(stored))
      } catch (err) {
        console.error('Failed to load passage sets:', err)
      }
    }
    loadPackages()
  }, [loadPackages])

  // Save passage sets to localStorage
  const savePassageSets = (sets: PassageSet[]) => {
    localStorage.setItem('tc-study-passage-sets', JSON.stringify(sets))
    setPassageSets(sets)
  }

  // Export passage set as JSON
  const handleExportPassageSet = (passageSet: PassageSet) => {
    const dataStr = JSON.stringify(passageSet, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${passageSet.name.replace(/\s+/g, '-').toLowerCase()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Import passage set from JSON
  const handleImportPassageSet = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as PassageSet
        // Ensure unique ID
        const newSet = { ...imported, id: `ps-${Date.now()}` }
        savePassageSets([...passageSets, newSet])
        alert(`Imported passage set: ${newSet.name}`)
      } catch (err) {
        alert('Failed to import passage set. Invalid file format.')
        console.error(err)
      }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset input
  }

  // Delete passage set
  const handleDeletePassageSet = (id: string) => {
    if (confirm('Delete this passage set?')) {
      savePassageSets(passageSets.filter(ps => ps.id !== id))
    }
  }

  // Export all passage sets
  const handleExportAllPassageSets = () => {
    const dataStr = JSON.stringify(passageSets, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `passage-sets-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Import resource package from ZIP
  const handleImportResourcePackage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const resourceKey = await catalogManager.importResourcePackage(Buffer.from(buffer))
      alert(`Successfully imported resource: ${resourceKey}`)
    } catch (err) {
      alert(`Failed to import resource: ${err}`)
      console.error(err)
    }
    event.target.value = '' // Reset input
  }

  // Export collection as JSON
  const handleExportCollection = (collectionId: string) => {
    const collection = packages.find((pkg: any) => pkg.id === collectionId)
    if (!collection) return

    const dataStr = JSON.stringify(collection, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `collection-${collection.id}-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Import collection from JSON
  const handleImportCollection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string)
        // Store in localStorage (matching SimpleCollectionCreator format)
        const stored = localStorage.getItem('tc-study-packages')
        const existingPackages = stored ? JSON.parse(stored) : []
        existingPackages.push(imported)
        localStorage.setItem('tc-study-packages', JSON.stringify(existingPackages))
        loadPackages()
        alert(`Imported collection: ${imported.title || imported.id}`)
      } catch (err) {
        alert('Failed to import collection. Invalid file format.')
        console.error(err)
      }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset input
  }

  // Export all collections
  const handleExportAllCollections = () => {
    const installedCollections = packages.filter((pkg: any) => pkg.status === 'installed')
    const dataStr = JSON.stringify(installedCollections, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `collections-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const tabs = [
    { id: 'passage-sets' as Tab, label: 'Passage Sets', icon: FileText },
    { id: 'collections' as Tab, label: 'Collections', icon: FolderOpen },
    { id: 'resources' as Tab, label: 'Resources', icon: Library },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Upload className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Data Management</h1>
              <p className="text-xs text-gray-500">Import and export your data</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Passage Sets Tab */}
      {activeTab === 'passage-sets' && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => passageSetInputRef.current?.click()}
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title="Import passage set"
                aria-label="Import passage set"
                data-testid="import-passage-set-btn"
              >
                <Upload className="w-5 h-5" />
              </button>
              <input
                ref={passageSetInputRef}
                type="file"
                accept=".json"
                onChange={handleImportPassageSet}
                className="hidden"
              />
              
              <button
                onClick={handleExportAllPassageSets}
                disabled={passageSets.length === 0}
                className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export all passage sets"
                aria-label="Export all passage sets"
                data-testid="export-all-passage-sets-btn"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => {
                setEditingPassageSet(null)
                setShowPassageSetForm(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              data-testid="new-passage-set-btn"
            >
              <Plus className="w-4 h-4" />
              <span>New Passage Set</span>
            </button>
          </div>

          {/* Passage Sets List */}
          <div className="space-y-2">
            {passageSets.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No passage sets</p>
                <p className="text-sm text-gray-500 mt-1">Create or import passage sets</p>
              </div>
            ) : (
              passageSets.map(ps => (
                <div
                  key={ps.id}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
                >
                  <div>
                    <h3 className="font-medium text-gray-900">{ps.name}</h3>
                    {ps.description && (
                      <p className="text-sm text-gray-500 mt-1">{ps.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {ps.passages.length} passage{ps.passages.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleExportPassageSet(ps)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Export"
                      aria-label={`Export ${ps.name}`}
                      data-testid={`export-passage-set-${ps.id}`}
                    >
                      <Download className="w-4 h-4 text-gray-600" />
                    </button>
                    
                    <button
                      onClick={() => {
                        setEditingPassageSet(ps)
                        setShowPassageSetForm(true)
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit"
                      aria-label={`Edit ${ps.name}`}
                      data-testid={`edit-passage-set-${ps.id}`}
                    >
                      <Edit2 className="w-4 h-4 text-gray-600" />
                    </button>
                    
                    <button
                      onClick={() => handleDeletePassageSet(ps.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                      aria-label={`Delete ${ps.name}`}
                      data-testid={`delete-passage-set-${ps.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Collections Tab */}
      {activeTab === 'collections' && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => collectionInputRef.current?.click()}
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title="Import collection"
                aria-label="Import collection"
                data-testid="import-collection-btn"
              >
                <Upload className="w-5 h-5" />
              </button>
              <input
                ref={collectionInputRef}
                type="file"
                accept=".json"
                onChange={handleImportCollection}
                className="hidden"
              />
              
              <button
                onClick={handleExportAllCollections}
                disabled={packages.length === 0}
                className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export all collections"
                aria-label="Export all collections"
                data-testid="export-all-collections-btn"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Collections List */}
          <div className="space-y-2">
            {packages.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-600 font-medium">No collections</p>
                <p className="text-sm text-gray-500 mt-1">Create collections from the Collections page</p>
              </div>
            ) : (
              packages.map((collection: any) => (
                <div
                  key={collection.id}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
                >
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {collection.manifest?.metadata?.title || collection.id}
                    </h3>
                    {collection.manifest?.metadata?.description && (
                      <p className="text-sm text-gray-500 mt-1">{collection.manifest.metadata.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Status: {collection.status}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleExportCollection(collection.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Export"
                      aria-label={`Export ${collection.id}`}
                      data-testid={`export-collection-${collection.id}`}
                    >
                      <Download className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Resources Tab */}
      {activeTab === 'resources' && (
        <div className="space-y-4">
          <div className="p-8 bg-gray-50 rounded-lg text-center">
            <Library className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">Resource Packages</p>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Import ZIP packages to share resources offline
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => resourceInputRef.current?.click()}
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title="Import resource package"
                aria-label="Import resource package"
                data-testid="import-resource-btn"
              >
                <Upload className="w-5 h-5" />
              </button>
              <input
                ref={resourceInputRef}
                type="file"
                accept=".zip"
                onChange={handleImportResourcePackage}
                className="hidden"
              />
              
              <p className="text-sm text-gray-600">
                Or use Library page to export individual resources
              </p>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Passage Set Form Modal */}
      {showPassageSetForm && (
        <PassageSetForm
          passageSet={editingPassageSet}
          onSave={(saved) => {
            if (editingPassageSet) {
              // Update existing
              const updated = passageSets.map(ps => ps.id === saved.id ? saved : ps)
              savePassageSets(updated)
            } else {
              // Add new
              savePassageSets([...passageSets, saved])
            }
            setShowPassageSetForm(false)
            setEditingPassageSet(null)
          }}
          onCancel={() => {
            setShowPassageSetForm(false)
            setEditingPassageSet(null)
          }}
        />
      )}
    </div>
  )
}
