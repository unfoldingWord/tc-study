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
import { getCachedTocTitleIndex, lookupTocTitle } from '../../../../features/helps/tocTitleIndex'
import { useHelpsTextCache } from '../../../../features/helps/useHelpsTextCache'
import type { TranslationWordsLink } from '../types'

function resolveTwResourceKey(twlResourceKey: string): string | null {
  const parts = twlResourceKey.split('/')
  if (parts.length < 2) return null
  const [owner, ...rest] = parts
  if (rest.length === 1) {
    const language = rest[0].split('_')[0]
    return `${owner}/${language}_tw`
  }
  if (rest.length >= 2) {
    return `${owner}/${rest[0]}/tw`
  }
  return null
}

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

      const twInfo = parseTWLink(linkSource)
      if (twInfo.category === 'unknown' || !twInfo.term) {
        console.error(`❌ [TWL Title Fetch] Failed to parse link source: "${linkSource}"`)
        return null
      }

      const cacheKey = `${twInfo.category}/${twInfo.term}`
      const twResourceKey = resolveTwResourceKey(resourceKey)
      if (!twResourceKey) return null

      try {
        const twMetadata = await catalogManager.getResourceMetadata(twResourceKey)
        const stamp = resourceContentStamp(twMetadata)
        const articleId = `bible/${twInfo.category}/${twInfo.term}`

        return await fetchText({
          resourceKey: twResourceKey,
          stamp,
          entryId: cacheKey,
          resolve: async () => {
            const ingredients = twMetadata?.contentMetadata?.ingredients
            const index = getCachedTocTitleIndex(twResourceKey, stamp, ingredients)
            if (!index) {
              return { value: twInfo.term, confident: false }
            }
            const title =
              lookupTocTitle(index, articleId) ||
              lookupTocTitle(index, cacheKey)
            if (!title) {
              return { value: twInfo.term, confident: false }
            }
            return { value: title, confident: true }
          },
        })
      } catch {
        return twInfo.term
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
