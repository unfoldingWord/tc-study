/**
 * useWordsLinksContent Hook
 * 
 * Loads Translation Words Links content for the current book
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useCacheAdapter, useCurrentReference, useLoaderRegistry } from '../../../../contexts'
import { RESOURCE_TYPE_IDS } from '../../../../resourceTypes/resourceTypeIds'
import { processedFromSoT, resolveLane1SoT } from '../../../../features/sot/resolveLane1SoT'
import {
  getHelpsContentHydrateTick,
  subscribeHelpsContentHydrate,
} from '../../../../features/helps/helpsContentHydrate'
import type { ProcessedWordsLinks } from '../types'

interface UseWordsLinksContentOptions {
  resourceKey: string
  wordsLinksContent?: ProcessedWordsLinks
  /** Loader registry id (e.g. `words-links` or `obs-words-links`). */
  loaderTypeId?: string
}

export function useWordsLinksContent({
  resourceKey,
  wordsLinksContent,
  loaderTypeId = 'words-links',
}: UseWordsLinksContentOptions) {
  const currentRef = useCurrentReference()
  const loaderRegistry = useLoaderRegistry()
  const cacheAdapter = useCacheAdapter()
  const hydrateTick = useSyncExternalStore(
    subscribeHelpsContentHydrate,
    getHelpsContentHydrateTick,
    getHelpsContentHydrateTick
  )
  
  const [content, setContent] = useState<ProcessedWordsLinks | null>(wordsLinksContent || null)
  const [loading, setLoading] = useState(() => Boolean(resourceKey) && !wordsLinksContent)
  const [error, setError] = useState<string | null>(null)
  
  // Load content when book changes
  useEffect(() => {
    if (wordsLinksContent) {
      // Content provided as prop, use it
      setContent(wordsLinksContent)
      return
    }

    if (!resourceKey) {
      setContent(null)
      setLoading(false)
      setError(null)
      return
    }
    
    if (!currentRef.book || !loaderRegistry) return
    
    const loadContent = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Get loader for words-links
        const loader = loaderRegistry.getLoader(loaderTypeId)
        if (!loader) {
          throw new Error('Words Links loader not found')
        }
        
        const typeId =
          loaderTypeId === 'obs-words-links'
            ? RESOURCE_TYPE_IDS.OBS_WORDS_LINKS
            : RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS
        const sot = cacheAdapter
          ? await resolveLane1SoT({
              resourceKey,
              book: currentRef.book,
              typeId,
              cache: cacheAdapter,
              loader,
            })
          : null
        const fromSoT = sot ? processedFromSoT<ProcessedWordsLinks>(sot) : null
        const loadedContent = (fromSoT && 'links' in fromSoT
          ? fromSoT
          : ((await loader.loadContent(
              resourceKey,
              currentRef.book
            )) as ProcessedWordsLinks | null))
        const content = loadedContent
        
        if (loadedContent && typeof loadedContent === 'object') {
          setContent(content)
        } else {
          throw new Error('Invalid content structure')
        }
      } catch (err) {
        console.error('❌ Failed to load words links content:', err)
        setError(err instanceof Error ? err.message : 'Failed to load content')
      } finally {
        setLoading(false)
      }
    }
    
    loadContent()
  }, [
    currentRef.book,
    resourceKey,
    loaderRegistry,
    cacheAdapter,
    wordsLinksContent,
    loaderTypeId,
    hydrateTick,
  ])
  
  return { content, loading, error }
}
