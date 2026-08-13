/**
 * useTWPreviews Hook
 *
 * Fetches and caches the first content paragraph of Translation Words articles
 * (same in-memory Map + preload pattern as useTWTitles).
 */

import { useCallback, useRef, useState } from 'react'
import { useLoaderRegistry } from '../../../../contexts'
import { parseTWLink } from '../../../../features/helps/quoteTokens'
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
  const [twPreviews, setTwPreviews] = useState<Map<string, string>>(new Map())
  const [loadingPreviews, setLoadingPreviews] = useState<Set<string>>(new Set())
  const twPreviewsRef = useRef<Map<string, string>>(new Map())
  const loadingRef = useRef<Set<string>>(new Set())

  const fetchTWPreview = useCallback(
    async (link: TranslationWordsLink): Promise<string | null> => {
      const linkSource = linkSourceFor(link)
      if (!linkSource) return null

      const twInfo = parseTWLink(linkSource)
      if (twInfo.category === 'unknown' || !twInfo.term) return null

      const cacheKey = `${twInfo.category}/${twInfo.term}`
      if (twPreviewsRef.current.has(cacheKey)) {
        return twPreviewsRef.current.get(cacheKey) ?? null
      }
      if (loadingRef.current.has(cacheKey)) return null

      const twResourceKey = resolveTwResourceKey(resourceKey)
      if (!twResourceKey) return null

      const loader = loaderRegistry.getLoader('words')
      if (!loader) return null

      try {
        loadingRef.current.add(cacheKey)
        setLoadingPreviews((prev) => new Set(prev).add(cacheKey))

        const articleId = `bible/${twInfo.category}/${twInfo.term}`
        const raw = (await loader.loadContent(twResourceKey, articleId)) as {
          definition?: string
          content?: string
          body?: string
        }

        const fromDefinition = raw?.definition?.trim() ?? ''
        const fromContent = extractFirstContentParagraph(raw?.content || raw?.body || '')
        const preview = fromDefinition || fromContent

        twPreviewsRef.current.set(cacheKey, preview)
        setTwPreviews((prev) => new Map(prev).set(cacheKey, preview))
        return preview
      } catch {
        // Cache empty to avoid retry storms when article is missing
        twPreviewsRef.current.set(cacheKey, '')
        setTwPreviews((prev) => new Map(prev).set(cacheKey, ''))
        return ''
      } finally {
        loadingRef.current.delete(cacheKey)
        setLoadingPreviews((prev) => {
          const next = new Set(prev)
          next.delete(cacheKey)
          return next
        })
      }
    },
    [resourceKey, loaderRegistry]
  )

  const getTWPreview = useCallback(
    (link: TranslationWordsLink): string | null => {
      const twInfo = parseTWLink(link.twLink || link.articlePath)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      if (!twPreviews.has(cacheKey)) return null
      const value = twPreviews.get(cacheKey) ?? ''
      return value || null
    },
    [twPreviews]
  )

  return {
    twPreviews,
    loadingPreviews,
    fetchTWPreview,
    getTWPreview,
  }
}
