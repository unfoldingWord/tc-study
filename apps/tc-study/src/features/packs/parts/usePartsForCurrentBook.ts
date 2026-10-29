import { useEffect } from 'react'
import { useCacheAdapter, useCatalogManager } from '../../../contexts/CatalogContext'
import { useNavigationStore } from '../../nav/navigationStore'
import { usePartsModeStore } from './partsMode'
import { syncLanguageForRead, type ReadPartsStores } from './readParts'

/**
 * On every book change, the languages served as parts get that book's parts (and its Greek or Hebrew). Not awaited:
 * the panes read what is there and the new rows land when they come.
 */
export function usePartsForCurrentBook(): void {
  const book = useNavigationStore((s) => s.currentReference.book) || ''
  const modes = usePartsModeStore((s) => s.modes)
  const cache = useCacheAdapter()
  const catalogManager = useCatalogManager()

  useEffect(() => {
    if (!book) return
    const stores: ReadPartsStores = { cache, catalog: catalogManager.catalogAdapter as ReadPartsStores['catalog'] }
    // Checking too: a language still being asked for gets this book queued after its first sync.
    for (const [language, mode] of Object.entries(modes)) {
      if (mode !== 'door43') void syncLanguageForRead(language, book, stores)
    }
  }, [book, modes, cache, catalogManager])
}
