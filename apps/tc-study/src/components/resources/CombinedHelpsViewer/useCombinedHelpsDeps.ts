/**
 * Catalog metadata (language direction) for CombinedHelps.
 */

import { useEffect, useState } from 'react'

export interface UseCombinedHelpsDepsParams {
  resourceKey: string
  catalogManager: {
    getResourceMetadata: (key: string) => Promise<{ languageDirection?: 'ltr' | 'rtl' } | null | undefined>
  }
}

export function useCombinedHelpsDeps({ resourceKey, catalogManager }: UseCombinedHelpsDepsParams) {
  const [catalogMetadata, setCatalogMetadata] = useState<{ languageDirection?: 'ltr' | 'rtl' } | null>(null)

  useEffect(() => {
    let cancelled = false
    catalogManager.getResourceMetadata(resourceKey).then((meta) => {
      if (!cancelled && meta) setCatalogMetadata(meta)
    })
    return () => {
      cancelled = true
    }
  }, [resourceKey, catalogManager])

  return { catalogMetadata }
}
