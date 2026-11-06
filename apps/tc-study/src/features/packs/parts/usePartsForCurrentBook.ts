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
  // The languages checking or served as parts, as one string: a language going from checking to parts changes nothing.
  const partsLanguages = usePartsModeStore((s) =>
    Object.keys(s.modes)
      .filter((language) => s.modes[language] !== 'door43')
      .sort()
      .join(',')
  )
  const cache = useCacheAdapter()
  const catalogManager = useCatalogManager()

  useEffect(() => {
    if (!book || !partsLanguages) return
    const stores: ReadPartsStores = { cache, catalog: catalogManager.catalogAdapter as ReadPartsStores['catalog'] }
    // Checking too: a language still being asked for gets this book queued after its first sync.
    for (const language of partsLanguages.split(',')) void syncLanguageForRead(language, book, stores)
  }, [book, partsLanguages, cache, catalogManager])
}
