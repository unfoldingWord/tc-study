/**
 * useWordsLinksContent Hook
 * 
 * Loads Translation Words Links content for the current book
 */

import { useEffect, useState } from 'react'
import { useCurrentReference, useLoaderRegistry } from '../../../../contexts'
import type { ProcessedWordsLinks } from '../types'

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
  
  const [content, setContent] = useState<ProcessedWordsLinks | null>(wordsLinksContent || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Load content when book changes
  useEffect(() => {
    if (wordsLinksContent) {
      // Content provided as prop, use it
      setContent(wordsLinksContent)
      return
    }
    
    if (!currentRef.book || !loaderRegistry) return
    
    const loadContent = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Get loader for words-links
        const loader = loaderRegistry.getLoader('words-links')
        if (!loader) {
          throw new Error('Words Links loader not found')
        }
        
        // Load content for current book
        const loadedContent = await loader.loadContent(resourceKey, currentRef.book)
        const content = loadedContent as ProcessedWordsLinks | null
        
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
  }, [currentRef.book, currentRef.chapter, resourceKey, loaderRegistry, wordsLinksContent])
  
  return { content, loading, error }
}
