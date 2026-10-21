/**
 * useTWPreviews Hook
 *
 * Fetches the first content paragraph of Translation Words articles via
 * shared helps-text cache (memory → IndexedDB → words loader).
 */

import { useCallback, useRef } from 'react'
import { useCatalogManager, useLoaderRegistry } from '../../../../contexts'
import { parseTWLink } from '../../../../features/helps/quoteTokens'
import { resourceContentStamp } from '../../../../features/helps/resourceContentStamp'
import { useHelpsTextCache } from '../../../../features/helps/useHelpsTextCache'
import { extractFirstContentParagraph } from '../../../../lib/markdown/markdownProcessor'
import type { TranslationWordsLink } from '../types'

function resolveTwResourceKey(twlResourceKey: string): string | null {
  const parts = twlResourceKey.split('/')
  if (parts.length < 2) return null
  const [owner, ...rest] = parts
  if (rest.length === 1) {
    const language = rest[0].split('_')[0]
    return `${owner}/${language}/tw`
  }
  return `${owner}/${rest[0]}/tw`
}

function linkSourceFor(link: TranslationWordsLink): string | null {
  let linkSource = link.twLink || link.articlePath
  if (!linkSource && link.id?.startsWith('rc://')) {
    linkSource = link.id
  }
  return linkSource || null
}

export function useTWPreviews(resourceKey: string) {
  const loaderRegistry = useLoaderRegistry()
  const catalogManager = useCatalogManager()
  const stampByResourceRef = useRef<Map<string, string>>(new Map())
  const {
    values: twPreviews,
    loading: loadingPreviews,
    fetchText,
    getCached,
    hasCached,
  } = useHelpsTextCache('tw-preview')

  const fetchTWPreview = useCallback(
    async (link: TranslationWordsLink): Promise<string | null> => {
      const linkSource = linkSourceFor(link)
      if (!linkSource) return null

      const twInfo = parseTWLink(linkSource)
      if (twInfo.category === 'unknown' || !twInfo.term) return null

      const cacheKey = `${twInfo.category}/${twInfo.term}`
      const twResourceKey = resolveTwResourceKey(resourceKey)
      if (!twResourceKey) return null

      const loader = loaderRegistry.getLoader('words')
      if (!loader) return null

      let stamp = stampByResourceRef.current.get(twResourceKey)
      if (!stamp) {
        try {
          const meta = await catalogManager.getResourceMetadata(twResourceKey)
          stamp = resourceContentStamp(meta)
        } catch {
          stamp = 'nostamp'
        }
        stampByResourceRef.current.set(twResourceKey, stamp)
      }

      return await fetchText({
        resourceKey: twResourceKey,
        stamp,
        entryId: cacheKey,
        resolve: async () => {
          try {
            const articleId = `bible/${twInfo.category}/${twInfo.term}`
            const raw = (await loader.loadContent(twResourceKey, articleId)) as {
              definition?: string
              content?: string
              body?: string
            }
            const fromDefinition = raw?.definition?.trim() ?? ''
            const fromContent = extractFirstContentParagraph(raw?.content || raw?.body || '')
            const preview = fromDefinition || fromContent
            // Empty string is a settled miss (article missing) — persist to avoid retry storms.
            return { value: preview, confident: true }
          } catch {
            return { value: '', confident: true }
          }
        },
      })
    },
    [resourceKey, loaderRegistry, catalogManager, fetchText]
  )

  const getTWPreview = useCallback(
    (link: TranslationWordsLink): string | null => {
      const twInfo = parseTWLink(link.twLink || link.articlePath)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      if (!hasCached(cacheKey)) return null
      const value = getCached(cacheKey) ?? ''
      return value || null
    },
    [getCached, hasCached]
  )

  const isTWPreviewPending = useCallback(
    (link: TranslationWordsLink): boolean => {
      const twInfo = parseTWLink(link.twLink || link.articlePath)
      if (twInfo.category === 'unknown' || !twInfo.term) return false
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      return !hasCached(cacheKey)
    },
    [hasCached]
  )

  return {
    twPreviews,
    loadingPreviews,
    fetchTWPreview,
    getTWPreview,
    isTWPreviewPending,
  }
}
