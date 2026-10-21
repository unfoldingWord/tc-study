/**
 * useTWTitles Hook
 *
 * Fetches Translation Words article titles via shared helps-text cache
 * (memory → IndexedDB → catalog TOC).
 */

import { useCallback } from 'react'
import { useCatalogManager } from '../../../../contexts'
import { parseTWLink } from '../../../../features/helps/quoteTokens'
import { resourceContentStamp } from '../../../../features/helps/resourceContentStamp'
import { getCachedTocTitleIndex } from '../../../../features/helps/tocTitleIndex'
import { useHelpsTextCache } from '../../../../features/helps/useHelpsTextCache'
import {
  resolveTwTitle,
  twResourceKeyFor as resolveTwResourceKey,
  twTitleEntry,
} from '@bt-synergy/resource-pipeline/helps/articleTitles'
import type { TranslationWordsLink } from '../types'

function linkSourceFor(link: TranslationWordsLink): string | null {
  let linkSource = link.twLink || link.articlePath
  if (!linkSource && link.id?.startsWith('rc://')) {
    linkSource = link.id
  }
  return linkSource || null
}

export function useTWTitles(resourceKey: string) {
  const catalogManager = useCatalogManager()
  const { values: twTitles, loading: loadingTitles, fetchText, getCached } =
    useHelpsTextCache('tw-title')

  const fetchTWTitle = useCallback(
    async (link: TranslationWordsLink): Promise<string | null> => {
      const linkSource = linkSourceFor(link)
      if (!linkSource) {
        console.error(`❌ [TWL Title Fetch] No valid link source found for link:`, {
          id: link.id,
          twLink: link.twLink,
          articlePath: link.articlePath,
        })
        return null
      }

      const entry = twTitleEntry(linkSource)
      if (!entry) {
        console.error(`❌ [TWL Title Fetch] Failed to parse link source: "${linkSource}"`)
        return null
      }

      const twResourceKey = resolveTwResourceKey(resourceKey)
      if (!twResourceKey) return null

      try {
        const twMetadata = await catalogManager.getResourceMetadata(twResourceKey)
        const stamp = resourceContentStamp(twMetadata)

        return await fetchText({
          resourceKey: twResourceKey,
          stamp,
          entryId: entry.entryId,
          resolve: async () => {
            const ingredients = twMetadata?.contentMetadata?.ingredients
            return resolveTwTitle(getCachedTocTitleIndex(twResourceKey, stamp, ingredients), entry)
          },
        })
      } catch {
        return entry.term
      }
    },
    [resourceKey, catalogManager, fetchText]
  )

  const getTWTitle = useCallback(
    (link: TranslationWordsLink): string => {
      const twInfo = parseTWLink(link.twLink)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      return getCached(cacheKey) || twInfo.term
    },
    [getCached]
  )

  return {
    twTitles,
    loadingTitles,
    fetchTWTitle,
    getTWTitle,
  }
}
