/**
 * Keep current-testament UGNT/UHB in catalog + expected download set.
 * English completeness is `en ∪ helps en` and would otherwise skip hbo/UHB.
 */

import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { CatalogManager } from '@bt-synergy/catalog-manager'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { useNavigationStore } from '../nav/navigationStore'
import { hydrateOriginalLanguageResources } from './hydrateOriginalLanguageResources'
import { originalLanguageKeyForBook } from './originalLanguageForBook'

export function useEnsureCurrentBookOriginalLanguage(args: {
  catalogManager: CatalogManager | null | undefined
  resourceTypeRegistry: ResourceTypeRegistry | null | undefined
  setExpectedResources: Dispatch<SetStateAction<string[]>>
}): void {
  const book = useNavigationStore((s) => s.currentReference.book) || ''
  const { catalogManager, resourceTypeRegistry, setExpectedResources } = args

  useEffect(() => {
    const ol = originalLanguageKeyForBook(book)
    if (!ol || !catalogManager || !resourceTypeRegistry) return
    let cancelled = false

    void (async () => {
      const orig = hydrateOriginalLanguageResources({
        catalogManager,
        resourceTypeRegistry,
        currentBook: book,
      })
      await Promise.allSettled(orig.metadataPromises)
      if (cancelled) return
      try {
        const keys = await catalogManager.getAllResourceKeys()
        if (cancelled || !keys.includes(ol)) return
        setExpectedResources((prev) => (prev.includes(ol) ? prev : [...prev, ol]))
      } catch {
        /* catalog list is best-effort */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [book, catalogManager, resourceTypeRegistry, setExpectedResources])
}
