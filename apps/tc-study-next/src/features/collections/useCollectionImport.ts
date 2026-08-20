import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import type { ResourcePackage } from '@bt-synergy/package-storage'
import { useEffect, useRef, useState } from 'react'
import { useCatalogManager, useResourceTypeRegistry } from '../../contexts/CatalogContext'
import { collectionExportService } from '../../lib/services/CollectionExportService'
import { usePackageStore } from '../../lib/stores/packageStore'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import {
  collectResourceKeysFromPointers,
  collectResourceKeysFromWorkspace,
  hydrateCollectionResources,
  type DownloadProgress,
} from './hydrateCollectionResources'
import { resourcePackageToWorkspace } from './resourcePackageToWorkspace'

export type LoadMode = 'from-db' | 'from-file'

function isCollectionZip(name: string): boolean {
  return name.endsWith('.btc.zip') || name.endsWith('.zip')
}

export function useCollectionImport(isOpen: boolean, onClose: () => void) {
  const loadPackage = useWorkspaceStore((state) => state.loadPackage)
  const allPackages = usePackageStore((state) => state.packages)
  const loadPackages = usePackageStore((state) => state.loadPackages)
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()

  const packages = allPackages.filter(
    (pkg) => (pkg as { status?: string }).status === 'installed'
  )

  const [mode, setMode] = useState<LoadMode>('from-db')
  const [selectedPackage, setSelectedPackage] = useState<ResourcePackage | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) loadPackages()
  }, [isOpen, loadPackages])

  const acceptFile = (selected: File) => {
    if (!isCollectionZip(selected.name)) {
      setError('Invalid file type. Please select a .btc.zip collection file.')
      return
    }
    setFile(selected)
    setError(null)
    setSuccess(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) acceptFile(selectedFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped) acceptFile(dropped)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const hydrateDeps = {
    catalogManager,
    resourceTypeRegistry,
    onProgress: setDownloadProgress,
  }

  const handleLoadFromDB = async () => {
    if (!selectedPackage) return
    setImporting(true)
    setError(null)
    try {
      const workspacePackage = resourcePackageToWorkspace(selectedPackage)
      const keys = collectResourceKeysFromPointers(
        selectedPackage.resources as
          | Array<{ owner: string; language: string; resourceId: string }>
          | undefined
      )
      await hydrateCollectionResources(keys, hydrateDeps, workspacePackage.resources)
      loadPackage(workspacePackage)
      setSuccess(true)
      setTimeout(() => {
        onClose()
        setSelectedPackage(null)
        setSuccess(false)
      }, 1000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load collection')
      console.error('Load failed:', err)
    } finally {
      setImporting(false)
    }
  }

  const handleImportFromFile = async () => {
    if (!file) return
    setImporting(true)
    setError(null)
    try {
      const cacheAdapter = new IndexedDBCacheAdapter({
        dbName: 'bt-synergy-cache',
        storeName: 'cache-entries',
        version: 1,
      })
      const workspace = await collectionExportService.importCollection(
        file,
        catalogManager,
        // Duck-typed: IndexedDB adapter satisfies ExportCacheAdapter at runtime
        cacheAdapter as Parameters<typeof collectionExportService.importCollection>[2]
      )
      const keys = collectResourceKeysFromWorkspace(workspace)
      await hydrateCollectionResources(keys, hydrateDeps, workspace.resources)
      loadPackage(workspace)
      setSuccess(true)
      setTimeout(() => {
        onClose()
        setFile(null)
        setSuccess(false)
      }, 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import collection')
      console.error('Import failed:', err)
    } finally {
      setImporting(false)
    }
  }

  return {
    packages,
    mode,
    setMode,
    selectedPackage,
    setSelectedPackage,
    file,
    importing,
    success,
    error,
    downloadProgress,
    fileInputRef,
    handleFileSelect,
    handleDrop,
    handleDragOver,
    handleImport: mode === 'from-db' ? handleLoadFromDB : handleImportFromFile,
    canImport: mode === 'from-db' ? !!selectedPackage : !!file,
  }
}
