/**
 * useTATitles Hook
 *
 * Fetches Translation Academy article titles via shared helps-text cache
 * (memory → IndexedDB → catalog TOC).
 */

import { useCallback } from 'react'
import type { TranslationNote } from '@bt-synergy/resource-parsers'
import { useCatalogManager } from '../../../../contexts'
import { resourceContentStamp } from '../../../../features/helps/resourceContentStamp'
import { getCachedTocTitleIndex } from '../../../../features/helps/tocTitleIndex'
import { useHelpsTextCache } from '../../../../features/helps/useHelpsTextCache'
import {
  parseTAReference,
  resolveTaTitle,
  taResourceKeyFor as resolveTaResourceKey,
  taTitlePlaceholder,
  TA_TITLE_FALLBACK,
} from '@bt-synergy/resource-pipeline/helps/articleTitles'

export function useTATitles(resourceKey: string) {
  const catalogManager = useCatalogManager()
  const { values: taTitles, loading: loadingTitles, fetchText, getCached } =
    useHelpsTextCache('ta-title')

  const fetchTATitle = useCallback(
    async (note: TranslationNote): Promise<string | null> => {
      if (!note.supportReference) return null
      const articlePath = parseTAReference(note.supportReference)
      if (!articlePath) return null

      const taResourceKey = resolveTaResourceKey(resourceKey)
      if (!taResourceKey) return null

      try {
        const taMetadata = await catalogManager.getResourceMetadata(taResourceKey)
        const stamp = resourceContentStamp(taMetadata)

        return await fetchText({
          resourceKey: taResourceKey,
          stamp,
          entryId: articlePath,
          resolve: async () => {
            const ingredients = taMetadata?.contentMetadata?.ingredients
            return resolveTaTitle(getCachedTocTitleIndex(taResourceKey, stamp, ingredients), articlePath)
          },
        })
      } catch {
        return taTitlePlaceholder(articlePath)
      }
    },
    [resourceKey, catalogManager, fetchText]
  )

  const getTATitle = useCallback(
    (note: TranslationNote): string => {
      if (!note.supportReference) return TA_TITLE_FALLBACK
      const articlePath = parseTAReference(note.supportReference)
      if (!articlePath) return TA_TITLE_FALLBACK
      return getCached(articlePath) || taTitlePlaceholder(articlePath)
    },
    [getCached]
  )

  return {
    taTitles,
    loadingTitles,
    fetchTATitle,
    getTATitle,
  }
}
