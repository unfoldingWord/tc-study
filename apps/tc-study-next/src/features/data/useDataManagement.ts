import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { useEffect, useRef, useState } from 'react'
import { useCatalogManager } from '../../contexts/CatalogContext'
import type { PassageSet } from '../../contexts/types'
import { usePackageStore } from '../../lib/stores'
import { datedFilename, downloadJson, slugFilename } from './downloadJson'

export type DataTab = 'passage-sets' | 'collections' | 'resources'

const PASSAGE_SETS_KEY = 'tc-study-passage-sets'
const PACKAGES_KEY = 'tc-study-packages'

export function useDataManagement() {
  const catalogManager = useCatalogManager()
  const packages = usePackageStore((state) => state.packages)
  const loadPackages = usePackageStore((state) => state.loadPackages)
  const [activeTab, setActiveTab] = useState<DataTab>('passage-sets')
  const [passageSets, setPassageSets] = useState<PassageSet[]>([])
  const [showPassageSetForm, setShowPassageSetForm] = useState(false)
  const [editingPassageSet, setEditingPassageSet] = useState<PassageSet | null>(null)

  const passageSetInputRef = useRef<HTMLInputElement>(null)
  const collectionInputRef = useRef<HTMLInputElement>(null)
  const resourceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const stored = localStorage.getItem(PASSAGE_SETS_KEY)
    if (stored) {
      try {
        setPassageSets(JSON.parse(stored))
      } catch (err) {
        console.error('Failed to load passage sets:', err)
      }
    }
    loadPackages()
  }, [loadPackages])

  const savePassageSets = (sets: PassageSet[]) => {
    localStorage.setItem(PASSAGE_SETS_KEY, JSON.stringify(sets))
    setPassageSets(sets)
  }

  const handleExportPassageSet = (passageSet: PassageSet) => {
    downloadJson(passageSet, `${slugFilename(passageSet.name)}.json`)
  }

  const handleImportPassageSet = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as PassageSet
        const newSet = { ...imported, id: `ps-${Date.now()}` }
        savePassageSets([...passageSets, newSet])
        alert(`Imported passage set: ${newSet.name}`)
      } catch (err) {
        alert('Failed to import passage set. Invalid file format.')
        console.error(err)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const handleDeletePassageSet = (id: string) => {
    if (confirm('Delete this passage set?')) {
      savePassageSets(passageSets.filter((ps) => ps.id !== id))
    }
  }

  const handleExportAllPassageSets = () => {
    downloadJson(passageSets, datedFilename('passage-sets'))
  }

  const handleImportResourcePackage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const catalogFile = zip.file('catalog.json')
      if (!catalogFile) throw new Error('Invalid package: missing catalog.json')
      const metadata = JSON.parse(await catalogFile.async('string')) as ResourceMetadata
      await catalogManager.addResourceToCatalog(metadata)
      alert(`Successfully imported resource: ${metadata.resourceKey}`)
    } catch (err) {
      alert(`Failed to import resource: ${err}`)
      console.error(err)
    }
    event.target.value = ''
  }

  const handleExportCollection = (collectionId: string) => {
    const collection = packages.find((pkg) => pkg.id === collectionId)
    if (!collection) return
    downloadJson(collection, datedFilename(`collection-${collection.id}`))
  }

  const handleImportCollection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string)
        const stored = localStorage.getItem(PACKAGES_KEY)
        const existingPackages = stored ? JSON.parse(stored) : []
        existingPackages.push(imported)
        localStorage.setItem(PACKAGES_KEY, JSON.stringify(existingPackages))
        loadPackages()
        alert(`Imported collection: ${imported.title || imported.id}`)
      } catch (err) {
        alert('Failed to import collection. Invalid file format.')
        console.error(err)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const handleExportAllCollections = () => {
    const installed = packages.filter(
      (pkg) => (pkg as { status?: string }).status === 'installed'
    )
    downloadJson(installed, datedFilename('collections'))
  }

  const openNewPassageSet = () => {
    setEditingPassageSet(null)
    setShowPassageSetForm(true)
  }

  const openEditPassageSet = (ps: PassageSet) => {
    setEditingPassageSet(ps)
    setShowPassageSetForm(true)
  }

  const handleSavePassageSet = (saved: PassageSet) => {
    if (editingPassageSet) {
      savePassageSets(passageSets.map((ps) => (ps.id === saved.id ? saved : ps)))
    } else {
      savePassageSets([...passageSets, saved])
    }
    setShowPassageSetForm(false)
    setEditingPassageSet(null)
  }

  const handleCancelPassageSetForm = () => {
    setShowPassageSetForm(false)
    setEditingPassageSet(null)
  }

  return {
    activeTab,
    setActiveTab,
    passageSets,
    packages,
    showPassageSetForm,
    editingPassageSet,
    passageSetInputRef,
    collectionInputRef,
    resourceInputRef,
    handleExportPassageSet,
    handleImportPassageSet,
    handleDeletePassageSet,
    handleExportAllPassageSets,
    handleImportResourcePackage,
    handleExportCollection,
    handleImportCollection,
    handleExportAllCollections,
    openNewPassageSet,
    openEditPassageSet,
    handleSavePassageSet,
    handleCancelPassageSetForm,
  }
}
