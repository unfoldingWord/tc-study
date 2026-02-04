/**
 * Browse page - Resource catalog from Door43
 */

import { Loader2, Package } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilterBar } from '../components/browse/FilterBar'
import { InstallModal } from '../components/browse/InstallModal'
import { ResourceCard } from '../components/browse/ResourceCard'
import Door43Api, { type CatalogResource, type ResourceFilters } from '../lib/api/door43'
import { PackageInstaller, type InstallProgress } from '../lib/services/PackageInstaller'
import { usePackageStore } from '../lib/stores'

export default function Browse() {
  const navigate = useNavigate()
  const packages = usePackageStore(state => state.packages)
  const installPackage = usePackageStore(state => state.installPackage)
  
  const [filteredResources, setFilteredResources] = useState<CatalogResource[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ResourceFilters>({})
  
  // Installation state
  const [isInstalling, setIsInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null)
  const [installingResource, setInstallingResource] = useState<CatalogResource | null>(null)

  // Load resources
  useEffect(() => {
    loadResources()
  }, [filters])

  const loadResources = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const results = await Door43Api.searchResources(filters)
      setFilteredResources(results)
    } catch (err) {
      console.error('Failed to load resources:', err)
      setError('Failed to load resources. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFilterChange = (newFilters: ResourceFilters) => {
    setFilters(newFilters)
  }

  const handleInstall = async (resource: CatalogResource) => {
    setInstallingResource(resource)
    setIsInstalling(true)
    setInstallProgress({
      stage: 'downloading',
      progress: 0,
      message: 'Starting installation...'
    })
    
    try {
      const packageManifest = await PackageInstaller.installPackage(
        resource,
        (progress) => setInstallProgress(progress)
      )
      
      // Save to store
      await installPackage(packageManifest.id, packageManifest)
      
      // Keep modal open to show success
    } catch (err) {
      console.error('Installation failed:', err)
      setInstallProgress({
        stage: 'error',
        progress: 0,
        message: 'Installation failed',
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  }

  const handleCloseInstallModal = () => {
    setIsInstalling(false)
    setInstallProgress(null)
    setInstallingResource(null)
  }

  const isInstalled = (resource: CatalogResource) => {
    const packageId = `${resource.owner}-${resource.language}-${resource.name}`
    return packages.some(pkg => pkg.id === packageId)
  }

  return (
    <>
      {/* Installation Modal */}
      <InstallModal
        isOpen={isInstalling}
        onClose={handleCloseInstallModal}
        progress={installProgress}
        resourceName={installingResource?.displayName || ''}
      />
      
      <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Browse Resources
        </h1>
        <p className="text-gray-600">
          Discover and install Bible translation resources from Door43
        </p>
      </div>

      {/* Filter Bar */}
      <div className="mb-6">
        <FilterBar onFilterChange={handleFilterChange} />
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600" />
            <p className="text-gray-600">Loading resources...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={loadResources}
            className="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {!isLoading && !error && (
        <>
          {/* Stats */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Found {filteredResources.length} resource{filteredResources.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => navigate('/library')}
              className="flex items-center space-x-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              <Package className="h-4 w-4" />
              <span>View Library ({packages.length} installed)</span>
            </button>
          </div>

          {/* Resource Grid */}
          {filteredResources.length === 0 ? (
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-gray-300">
              <div className="text-center">
                <Package className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p className="text-lg font-medium text-gray-900">No resources found</p>
                <p className="mt-1 text-sm text-gray-600">
                  Try adjusting your filters
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredResources.map((resource) => (
                <ResourceCard
                  key={`${resource.owner}-${resource.name}`}
                  resource={resource}
                  onInstall={handleInstall}
                  isInstalled={isInstalled(resource)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
    </>
  )
}
