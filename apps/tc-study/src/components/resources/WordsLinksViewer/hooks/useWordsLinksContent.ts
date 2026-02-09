/**
 * useWordsLinksContent Hook
 *
 * Loads Translation Words Links content for the current book.
 * Results are cached by resourceKey+book so switching tabs doesn't re-fetch.
 */

import { useEffect, useState } from 'react'
import { useCurrentReference, useLoaderRegistry } from '../../../../contexts'
import type { ProcessedWordsLinks } from '../types'

const CACHE_MAX = 50
const contentCache = new Map<string, ProcessedWordsLinks>()

function cacheKey(resourceKey: string, book: string) {
  return `twl:${resourceKey}:${book}`
}

interface UseWordsLinksContentOptions {
  resourceKey: string
  wordsLinksContent?: ProcessedWordsLinks
}

export function useWordsLinksContent({
  resourceKey,
  wordsLinksContent,
}: UseWordsLinksContentOptions) {
  const currentRef = useCurrentReference()
  const loaderRegistry = useLoaderRegistry()
  const key = resourceKey && currentRef.book ? cacheKey(resourceKey, currentRef.book) : ''
  const cached = key && !wordsLinksContent ? contentCache.get(key) : undefined

  const [content, setContent] = useState<ProcessedWordsLinks | null>(wordsLinksContent ?? cached ?? null)
  const [loading, setLoading] = useState(!wordsLinksContent && !cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wordsLinksContent) {
      setContent(wordsLinksContent)
      setLoading(false)
      return
    }

    if (!currentRef.book || !loaderRegistry) return

    const cacheKeyForBook = cacheKey(resourceKey, currentRef.book)
    const hit = contentCache.get(cacheKeyForBook)
    if (hit !== undefined) {
      setContent(hit)
      setLoading(false)
      return
    }

    let cancelled = false

    const loadContent = async () => {
      try {
        setLoading(true)
        setError(null)

        const loader = loaderRegistry.getLoader('words-links')
        if (!loader) {
          throw new Error('Words Links loader not found')
        }

        const loadedContent = await loader.loadContent(resourceKey, currentRef.book)
        const content = loadedContent as ProcessedWordsLinks | null

        if (cancelled) return
        if (loadedContent && typeof loadedContent === 'object') {
          if (contentCache.size >= CACHE_MAX) contentCache.delete(contentCache.keys().next().value!)
          contentCache.set(cacheKeyForBook, content)
          setContent(content)
        } else {
          throw new Error('Invalid content structure')
        }
      } catch (err) {
        if (!cancelled) {
          console.error('❌ Failed to load words links content:', err)
          setError(err instanceof Error ? err.message : 'Failed to load content')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadContent()
    return () => { cancelled = true }
  }, [currentRef.book, currentRef.chapter, resourceKey, loaderRegistry, wordsLinksContent])

  return { content, loading, error }
}
