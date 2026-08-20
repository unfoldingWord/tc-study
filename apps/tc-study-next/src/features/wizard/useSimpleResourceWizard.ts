import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import { useEffect, useMemo, useState } from 'react'
import { useCatalogManager } from '../../contexts'
import { usePackageStore } from '../../lib/stores/packageStore'
import {
  buildWizardCollections,
  metadataToCatalogRow,
  type CatalogResourceRow,
} from './simpleResourceWizardHelpers'

export type SubModal = 'add-to-catalog' | 'create-collection' | null

export function useSimpleResourceWizard(onAddResource: (resourceId: string) => void) {
  const [activeTab, setActiveTab] = useState<'collections' | 'catalog'>('collections')
  const [searchQuery, setSearchQuery] = useState('')
  const [addedResources, setAddedResources] = useState<Set<string>>(new Set())
  const [subModal, setSubModal] = useState<SubModal>(null)
  const [previousModal, setPreviousModal] = useState<SubModal>(null)
  const [catalogResources, setCatalogResources] = useState<CatalogResourceRow[]>([])
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true)

  const packages = usePackageStore((s) => s.packages) || []
  const catalogManager = useCatalogManager()

  const loadCatalogResources = async () => {
    try {
      setIsLoadingCatalog(true)
      const allMetadata = await catalogManager.searchResources({})
      const resources = allMetadata
        .filter((metadata): metadata is ResourceMetadata => metadata !== null)
        .map(metadataToCatalogRow)
        .filter((r): r is CatalogResourceRow => r !== null)
      setCatalogResources(resources)
    } catch (error) {
      console.error('❌ Failed to load catalog resources:', error)
    } finally {
      setIsLoadingCatalog(false)
    }
  }

  useEffect(() => {
    void loadCatalogResources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogManager])

  const collections = useMemo(
    () =>
      buildWizardCollections(
        packages.map((pkg) => {
          const legacy = pkg as {
            title?: string
            resourceIds?: string[]
            resources?: Array<string | { resourceId?: string; owner?: string; language?: string }>
          }
          return {
            id: pkg.id,
            name: pkg.name,
            title: legacy.title,
            resourceIds: legacy.resourceIds,
            resources: legacy.resources,
          }
        }),
        catalogResources
      ),
    [packages, catalogResources]
  )

  const catalogOnlyResources = useMemo(() => {
    const ids = new Set(collections.flatMap((c) => c.resources.map((r) => r.id)))
    return catalogResources.filter((r) => !ids.has(r.id))
  }, [catalogResources, collections])

  const filteredCatalogResources = catalogOnlyResources.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.owner.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleAddResource = (resourceId: string) => {
    onAddResource(resourceId)
    setAddedResources((prev) => new Set([...prev, resourceId]))
  }

  const handleCatalogComplete = async () => {
    await loadCatalogResources()
    if (previousModal === 'create-collection') {
      setSubModal('create-collection')
      setPreviousModal(null)
    } else {
      setSubModal(null)
      setPreviousModal(null)
    }
  }

  const handleCollectionComplete = (_collectionId?: string) => {
    setSubModal(null)
    setPreviousModal(null)
  }

  const handleOpenCatalogFromCollection = () => {
    setPreviousModal('create-collection')
    setSubModal('add-to-catalog')
  }

  const handleBackFromCatalog = () => {
    if (previousModal) {
      setSubModal(previousModal)
      setPreviousModal(null)
    } else {
      setSubModal(null)
    }
  }

  return {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    addedResources,
    subModal,
    setSubModal,
    previousModal,
    setPreviousModal,
    collections,
    catalogOnlyResources,
    filteredCatalogResources,
    isLoadingCatalog,
    handleAddResource,
    handleCatalogComplete,
    handleCollectionComplete,
    handleOpenCatalogFromCollection,
    handleBackFromCatalog,
  }
}
