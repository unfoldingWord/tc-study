/**
 * Collections page - Manage grouped resource collections for Studio
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { AlertCircle, Check, Download, FolderOpen, Loader, Plus, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CollectionExportDialog } from '../components/collections/CollectionExportDialog'
import { CollectionImportDialog } from '../components/collections/CollectionImportDialog'
import { CollectionModal } from '../components/collections/CollectionModal'
import { ManageCollectionDialog } from '../components/collections/ManageCollectionDialog'
import { PackageCard } from '../components/library/PackageCard'
import { useCatalogManager } from '../contexts/CatalogContext'
import type { ResourcePackage } from '../lib/storage/types'
import { usePackageStore } from '../lib/stores'

export default function Collections() {
  const navigate = useNavigate()
  const catalogManager = useCatalogManager()
  const packages = usePackageStore(state => state.packages)
  const activePackageId = usePackageStore(state => state.activePackageId)
  const loadPackages = usePackageStore(state => state.loadPackages)
  const uninstallPackage = usePackageStore(state => state.uninstallPackage)
  const setActivePackage = usePackageStore(state => state.setActivePackage)
  const loading = usePackageStore(state => state.loading)
  
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [catalogResources, setCatalogResources] = useState<ResourceMetadata[]>([])
  const [loadingResources, setLoadingResources] = useState(true)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showManageDialog, setShowManageDialog] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<ResourcePackage | null>(null)

  useEffect(() => {
    loadPackages()
    loadCatalogResources()
  }, [loadPackages])

  const loadCatalogResources = async () => {
    setLoadingResources(true)
    try {
      const resources = await catalogManager.searchResources({})
      setCatalogResources(resources || [])
    } catch (error) {
      console.error('Failed to load catalog resources:', error)
      setCatalogResources([])
    } finally {
      setLoadingResources(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadPackages()
    await loadCatalogResources()
    setRefreshing(false)
  }

  const handleCreateCollection = () => {
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
  }

  const handleOpenCollection = (pkg: ResourcePackage) => {
    setActivePackage(pkg.id)
    navigate('/studio')
  }

  const handleDeleteCollection = async (pkg: ResourcePackage) => {
    if (confirm(`Are you sure you want to delete "${pkg.title}"?\n\nThis will remove the collection.`)) {
      await uninstallPackage(pkg.id)
    }
  }

  const handleManageCollection = (pkg: ResourcePackage) => {
    setSelectedCollection(pkg)
    setShowManageDialog(true)
  }

  const handleCloseManageDialog = () => {
    setShowManageDialog(false)
    setSelectedCollection(null)
    loadPackages() // Reload to reflect any changes
  }

  const handleOpenWizardFromManage = () => {
    setShowModal(true)
  }

  const installedCollections = packages.filter((pkg: any) => pkg.status === 'installed')
  const buildingCollections = packages.filter((pkg: any) => pkg.status === 'installing')
  const errorCollections = packages.filter((pkg: any) => pkg.status === 'error')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <FolderOpen className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-sm font-semibold">
                  {installedCollections.length}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportDialog(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Import collection"
                aria-label="Import collection"
              >
                <Upload className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={() => setShowExportDialog(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Export workspace"
                aria-label="Export current workspace as collection"
              >
                <Download className="w-5 h-5 text-gray-600" />
              </button>
              <div className="w-px h-6 bg-gray-300" />
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
                aria-label="Refresh collections"
                data-testid="collections-refresh-btn"
              >
                <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleCreateCollection}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={loadingResources}
                title="New collection"
                aria-label="Create new collection"
                data-testid="collections-new-btn"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-6 py-6">

      {/* Loading State */}
      {loading && (
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )}

      {/* Empty State */}
      {!loading && installedCollections.length === 0 && buildingCollections.length === 0 && (
        <div className="flex h-64 items-center justify-center rounded-2xl bg-gray-50">
          <div className="text-center">
            <div className="mx-auto mb-6 inline-flex p-6 bg-white rounded-full shadow-sm">
              <FolderOpen className="h-12 w-12 text-gray-300" />
            </div>
            <div className="flex items-center justify-center">
              <button
                onClick={handleCreateCollection}
                className="p-4 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                title="Create new collection"
                aria-label="Create new collection"
                data-testid="collections-create-btn"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Building Collections */}
      {buildingCollections.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 rounded-lg">
              <Loader className="w-4 h-4 text-blue-600 animate-spin" />
            </div>
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold">
              {buildingCollections.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {buildingCollections.map((pkg: any) => (
              <PackageCard
                key={pkg.id}
                package={pkg}
                onOpen={handleOpenCollection}
                onDelete={handleDeleteCollection}
                onManage={handleManageCollection}
                isActive={pkg.id === activePackageId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Error Collections */}
      {errorCollections.length > 0 && (
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <div className="p-1.5 bg-red-50 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600" />
            </div>
            <span className="px-2.5 py-1 bg-red-50 text-red-700 rounded-lg text-sm font-semibold">
              {errorCollections.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {errorCollections.map((pkg: any) => (
              <PackageCard
                key={pkg.id}
                package={pkg}
                onOpen={handleOpenCollection}
                onDelete={handleDeleteCollection}
                onManage={handleManageCollection}
                isActive={pkg.id === activePackageId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Installed Collections */}
      {installedCollections.length > 0 && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <div className="p-1.5 bg-green-50 rounded-lg">
              <Check className="w-4 h-4 text-green-600" />
            </div>
            <span className="px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-sm font-semibold">
              {installedCollections.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {installedCollections.map((pkg: any) => (
              <PackageCard
                key={pkg.id}
                package={pkg}
                onOpen={handleOpenCollection}
                onDelete={handleDeleteCollection}
                onManage={handleManageCollection}
                isActive={pkg.id === activePackageId}
              />
            ))}
          </div>
        </div>
      )}
      </div>
      
      {/* Collection Modal */}
      {showModal && (
        <CollectionModal
          onClose={handleCloseModal}
          onComplete={async (collectionId) => {
            console.log('✅ Collection created:', collectionId)
            await loadPackages()
          }}
          onResourcesAdded={async () => {
            console.log('✅ Resources added to catalog')
            await loadCatalogResources()
          }}
        />
      )}
      
      {/* Export Dialog */}
      <CollectionExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />
      
      {/* Import Dialog */}
      <CollectionImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
      />
      
      {/* Manage Collection Dialog */}
      {selectedCollection && (
        <ManageCollectionDialog
          collection={selectedCollection}
          isOpen={showManageDialog}
          onClose={handleCloseManageDialog}
          onOpenWizard={handleOpenWizardFromManage}
        />
      )}
    </div>
  )
}
