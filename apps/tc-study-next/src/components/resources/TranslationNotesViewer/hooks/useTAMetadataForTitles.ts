/**
 * useTAMetadataForTitles
 *
 * Stateful TA metadata for the current language. Fetches via useEffect + async request;
 * when ingredients become available, state updates and consumers re-render (no retries).
 */

import { useEffect, useState } from 'react'
import { useCatalogManager } from '../../../../contexts'

/** Minimal shape we need for title resolution */
export interface TAMetadataForTitles {
  contentMetadata?: {
    ingredients?: Array<{ identifier?: string; path?: string; title?: string }>
  }
}

const TA_PRIME_ENTRY = 'translate/figs-metaphor'

function getTAResourceKey(resourceKey: string): string | null {
  const parts = resourceKey.split('/')
  if (parts.length < 2) return null
  const owner = parts[0]
  const language = parts[1].split('_')[0] || 'en'
  return `${owner}/${language}/ta`
}

export function useTAMetadataForTitles(resourceKey: string): TAMetadataForTitles | null {
  const catalogManager = useCatalogManager()
  const [taMetadata, setTaMetadata] = useState<TAMetadataForTitles | null>(null)

  useEffect(() => {
    const taResourceKey = getTAResourceKey(resourceKey)
    if (!taResourceKey) {
      setTaMetadata(null)
      return
    }

    let cancelled = false

    const load = async () => {
      let meta = await catalogManager.getResourceMetadata(taResourceKey) as TAMetadataForTitles | null
      if (cancelled) return

      if (
        meta &&
        (!meta.contentMetadata?.ingredients?.length || meta.contentMetadata.ingredients.length < 10)
      ) {
        try {
          await catalogManager.loadContent(taResourceKey, TA_PRIME_ENTRY)
          if (cancelled) return
          meta = await catalogManager.getResourceMetadata(taResourceKey) as TAMetadataForTitles | null
        } catch {
          // keep meta as-is
        }
      }

      if (!cancelled) setTaMetadata(meta ?? null)
    }

    load()
    return () => { cancelled = true }
  }, [resourceKey, catalogManager])

  return taMetadata
}
