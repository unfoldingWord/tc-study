import { useCallback, useEffect, useState } from 'react'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { useCatalogManager, useCompletenessChecker } from '../../contexts/CatalogContext'
import type { ResourceCompletenessStatus } from '../../lib/services/ResourceCompletenessChecker'
import { getLibraryResourceKey } from './libraryResourceKey'

export function useLibraryCatalog() {
  const catalogManager = useCatalogManager()
  const completenessChecker = useCompletenessChecker()

  const [resources, setResources] = useState<ResourceMetadata[]>([])
  const [completenessStatus, setCompletenessStatus] = useState<
    Map<string, ResourceCompletenessStatus>
  >(new Map())
  const [stats, setStats] = useState<{
    totalResources: number
    totalLanguages: number
    totalOwners: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedResource, setSelectedResource] = useState<ResourceMetadata | null>(null)
  const [showJson, setShowJson] = useState(false)
  const [showAddWizard, setShowAddWizard] = useState(false)
  const [downloadingResources, setDownloadingResources] = useState<Set<string>>(new Set())
  const [downloadingIngredients, setDownloadingIngredients] = useState<Set<string>>(new Set())
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const allResources = await catalogManager.searchResources({})
      setResources(allResources || [])

      const statusMap = new Map<string, ResourceCompletenessStatus>()
      for (const resource of allResources) {
        const resourceKey = getLibraryResourceKey(resource)
        const status = await completenessChecker.checkResource(resourceKey)
        statusMap.set(resourceKey, status)
      }
      setCompletenessStatus(statusMap)

      try {
        const catalogStats = await catalogManager.getCatalogStats()
        setStats(catalogStats)
      } catch (statsError) {
        console.warn('Could not load stats:', statsError)
      }
    } catch (error) {
      console.error('❌ Failed to load catalog:', error)
      alert(`Failed to load catalog: ${error}`)
      setResources([])
    } finally {
      setLoading(false)
    }
  }, [catalogManager, completenessChecker])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    const interval = setInterval(async () => {
      if (resources.length === 0) return
      const statusMap = new Map<string, ResourceCompletenessStatus>()
      for (const resource of resources) {
        const resourceKey = getLibraryResourceKey(resource)
        const status = await completenessChecker.checkResource(resourceKey)
        statusMap.set(resourceKey, status)
      }
      setCompletenessStatus(statusMap)
    }, 3000)
    return () => clearInterval(interval)
  }, [resources, completenessChecker])

  const handleExportCatalog = () => {
    const dataStr = JSON.stringify(resources, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `catalog-${new Date().toISOString().split('T')[0]}.json`
    link.click()
  }

  const handleDeleteResource = async (resource: ResourceMetadata) => {
    const resourceKey = getLibraryResourceKey(resource)
    const confirmMsg = `Delete "${resource.title}"?\n\nThis will remove:\n- Catalog metadata\n- Downloaded content\n- All cached data\n\nThis cannot be undone!`
    if (!confirm(confirmMsg)) return
    try {
      await catalogManager.removeResource(resourceKey)
      const loader = catalogManager.resolveLoaderForMetadata(resource)
      if (loader && typeof loader.clearCache === 'function') {
        await loader.clearCache(resourceKey)
      }
      await loadCatalog()
      if (selectedResource && getLibraryResourceKey(selectedResource) === resourceKey) {
        setSelectedResource(null)
        setShowJson(false)
      }
    } catch (error) {
      console.error('Failed to delete resource:', error)
      alert(`Failed to delete resource: ${error}`)
    }
  }

  const handleClearCatalog = async () => {
    if (confirm('Are you sure you want to clear the entire catalog? This cannot be undone!')) {
      alert('Clear catalog functionality not yet implemented')
    }
  }

  const handleDownloadAll = async (resource: ResourceMetadata) => {
    const resourceKey = getLibraryResourceKey(resource)
    try {
      setDownloadingResources((prev) => new Set(prev).add(resourceKey))
      await catalogManager.downloadResource(resourceKey, {}, (progress: { percentage: number }) => {
        setDownloadProgress((prev) => ({
          ...prev,
          [resourceKey]: progress.percentage,
        }))
      })
      await loadCatalog()
    } catch (error) {
      console.error(`❌ Failed to download ${resourceKey}:`, error)
      alert(`Failed to download: ${error}`)
    } finally {
      setDownloadingResources((prev) => {
        const next = new Set(prev)
        next.delete(resourceKey)
        return next
      })
      setDownloadProgress((prev) => {
        const next = { ...prev }
        delete next[resourceKey]
        return next
      })
    }
  }

  const handleDownloadIngredient = async (resource: ResourceMetadata, ingredientId: string) => {
    const resourceKey = getLibraryResourceKey(resource)
    const ingredientKey = `${resourceKey}/${ingredientId}`
    try {
      setDownloadingIngredients((prev) => new Set(prev).add(ingredientKey))
      await catalogManager.downloadIngredient(resourceKey, ingredientId, {
        onProgress: (progress: number) => {
          setDownloadProgress((prev) => ({
            ...prev,
            [ingredientKey]: progress,
          }))
        },
      })
      await loadCatalog()
    } catch (error) {
      console.error(`❌ Failed to download ${ingredientKey}:`, error)
      alert(`Failed to download ${ingredientId}: ${error}`)
    } finally {
      setDownloadingIngredients((prev) => {
        const next = new Set(prev)
        next.delete(ingredientKey)
        return next
      })
      setDownloadProgress((prev) => {
        const next = { ...prev }
        delete next[ingredientKey]
        return next
      })
    }
  }

  const isResourceComplete = (resourceKey: string): boolean => {
    return completenessStatus.get(resourceKey)?.isComplete || false
  }

  const isIngredientDownloaded = (resource: ResourceMetadata, ingredientId: string): boolean => {
    const resourceKey = getLibraryResourceKey(resource)
    if (isResourceComplete(resourceKey)) return true
    const downloadedIngredients = resource.contentMetadata?.downloadedIngredients || []
    return downloadedIngredients.includes(ingredientId)
  }

  return {
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
  }
}
