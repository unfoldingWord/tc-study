import { useCallback, useState } from 'react'
import { useCacheAdapter, useCatalogManager } from '../../contexts/CatalogContext'
import { openLanguagePacks, type OpenedPack, type PackProgress, type PackStores } from './openLanguagePacks'

/** Opens packs into the stores the app reads with, and keeps the progress and the result for the panel. */
export function useOpenLanguagePacks() {
  const cache = useCacheAdapter()
  const catalogManager = useCatalogManager()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<PackProgress | null>(null)
  const [opened, setOpened] = useState<OpenedPack[] | null>(null)

  const open = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setBusy(true)
      setOpened(null)
      try {
        const stores: PackStores = { cache, catalog: catalogManager.catalogAdapter as PackStores['catalog'] }
        setOpened(await openLanguagePacks(stores, files, { onProgress: setProgress }))
      } finally {
        setProgress(null)
        setBusy(false)
      }
    },
    [cache, catalogManager]
  )

  return { open, busy, progress, opened }
}
