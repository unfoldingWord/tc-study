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
import { getCachedTocTitleIndex, lookupTocTitle } from '../../../../features/helps/tocTitleIndex'
import { useHelpsTextCache } from '../../../../features/helps/useHelpsTextCache'

function parseTAReference(supportRef: string): string | null {
  const match = supportRef.match(/rc:\/\/\*\/ta\/man\/(.+)/)
  return match ? match[1] : null
}

function resolveTaResourceKey(tnResourceKey: string): string | null {
  const parts = tnResourceKey.split('/')
  if (parts.length < 2) return null
  const [owner, langPart] = parts
  const language = langPart.split('_')[0]
  return `${owner}/${language}/ta`
}

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
            const index = getCachedTocTitleIndex(taResourceKey, stamp, ingredients)
            if (!index) {
              return {
                value: articlePath.split('/').pop() || 'Learn more',
                confident: false,
              }
            }
            const title = lookupTocTitle(index, articlePath)
            if (!title) {
              return {
                value: articlePath.split('/').pop() || 'Learn more',
                confident: false,
              }
            }
            return { value: title, confident: true }
          },
        })
      } catch {
        return articlePath.split('/').pop() || 'Learn more'
      }
    },
    [resourceKey, catalogManager, fetchText]
  )

  const getTATitle = useCallback(
    (note: TranslationNote): string => {
      if (!note.supportReference) return 'Learn more'
      const articlePath = parseTAReference(note.supportReference)
      if (!articlePath) return 'Learn more'
      return getCached(articlePath) || articlePath.split('/').pop() || 'Learn more'
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
