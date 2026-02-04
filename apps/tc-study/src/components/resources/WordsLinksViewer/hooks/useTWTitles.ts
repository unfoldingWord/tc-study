/**
 * useTWTitles Hook
 * 
 * Fetches and caches Translation Words article titles
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCatalogManager } from '../../../../contexts'
import type { TranslationWordsLink } from '../types'
import { parseTWLink } from '../utils'

export function useTWTitles(resourceKey: string) {
  const catalogManager = useCatalogManager()
  const [twTitles, setTwTitles] = useState<Map<string, string>>(new Map())
  const [loadingTitles, setLoadingTitles] = useState<Set<string>>(new Set())
  const twTitlesRef = useRef<Map<string, string>>(new Map())
  const fallbackTitlesRef = useRef<Set<string>>(new Set()) // Track which titles are fallbacks
  
  // Fetch TW title for a link from TOC
  const fetchTWTitle = useCallback(async (link: TranslationWordsLink): Promise<string | null> => {
    // Try multiple sources for the TW link
    let linkSource = link.twLink || link.articlePath
    
    // If id looks like an RC link, use it
    if (!linkSource && link.id && link.id.startsWith('rc://')) {
      linkSource = link.id
    }
    
    // If still no link source, we can't fetch the title
    if (!linkSource) {
      console.error(`❌ [TWL Title Fetch] No valid link source found for link:`, {
        id: link.id,
        twLink: link.twLink,
        articlePath: link.articlePath,
      })
      return null
    }
    
    const twInfo = parseTWLink(linkSource)
    
    // If parsing failed, we can't fetch the title
    if (twInfo.category === 'unknown' || !twInfo.term) {
      console.error(`❌ [TWL Title Fetch] Failed to parse link source: "${linkSource}"`)
      return null
    }
    
    const cacheKey = `${twInfo.category}/${twInfo.term}`
    
    // Check cache first
    if (twTitlesRef.current.has(cacheKey)) {
      return twTitlesRef.current.get(cacheKey) || null
    }
    
    // Check if already loading
    if (loadingTitles.has(cacheKey)) {
      return null
    }
    
    try {
      setLoadingTitles(prev => new Set(prev).add(cacheKey))
      
      // Find TW resource (same language, same owner)
      const parts = resourceKey.split('/')
      if (parts.length < 2) {
        throw new Error(`Invalid resourceKey format: ${resourceKey}`)
      }
      
      const [owner, ...rest] = parts
      let twResourceKey: string
      let language: string
      
      if (rest.length === 1) {
        // Format: "owner/language_resourceId" (e.g., "unfoldingWord/en_twl")
        const langResource = rest[0]
        language = langResource.split('_')[0]
        twResourceKey = `${owner}/${language}_tw`
      } else if (rest.length >= 2) {
        // Format: "owner/language/resourceId" (e.g., "es-419_gl/es-419/twl")
        language = rest[0]
        twResourceKey = `${owner}/${language}/tw`
      } else {
        throw new Error(`Invalid resourceKey format: ${resourceKey}`)
      }
      
      // Construct article ID to match against TOC
      const articleId = `bible/${twInfo.category}/${twInfo.term}`
      
      // Get TW resource metadata from catalog (contains TOC in ingredients)
      const twMetadata = await catalogManager.getResourceMetadata(twResourceKey)
      
      if (!twMetadata?.contentMetadata?.ingredients) {
        // TW metadata not ready yet - cache the term as fallback to prevent infinite retries
        const fallback = twInfo.term
        fallbackTitlesRef.current.add(cacheKey) // Mark as fallback
        twTitlesRef.current.set(cacheKey, fallback)
        setTwTitles(prev => new Map(prev).set(cacheKey, fallback))
        return fallback
      }
      
      const ingredients = twMetadata.contentMetadata.ingredients
      
      // Look up title from TOC ingredients
      const ingredient = ingredients.find((ing: any) => {
        if (ing.identifier === articleId) return true
        if (ing.path && ing.path.replace(/\.md$/, '') === articleId) return true
        const ingParts = ing.identifier?.split('/') || []
        const articleParts = articleId.split('/')
        if (ingParts.length >= 3 && articleParts.length >= 3) {
          return ingParts[ingParts.length - 2] === articleParts[articleParts.length - 2] &&
                 ingParts[ingParts.length - 1] === articleParts[articleParts.length - 1]
        }
        return false
      })
      
      if (!ingredient?.title) {
        // Ingredient not found in TOC - cache the term as fallback
        const fallback = twInfo.term
        fallbackTitlesRef.current.add(cacheKey) // Mark as fallback
        twTitlesRef.current.set(cacheKey, fallback)
        setTwTitles(prev => new Map(prev).set(cacheKey, fallback))
        return fallback
      }
      
      const title = ingredient.title
      fallbackTitlesRef.current.delete(cacheKey) // Remove from fallback set if it was there
      twTitlesRef.current.set(cacheKey, title)
      setTwTitles(prev => new Map(prev).set(cacheKey, title))
      return title
    } catch (error) {
      // Silently fail - cache term as fallback to prevent infinite retries
      const fallbackTitle = twInfo.term
      twTitlesRef.current.set(cacheKey, fallbackTitle)
      setTwTitles(prev => new Map(prev).set(cacheKey, fallbackTitle))
      return fallbackTitle
    } finally {
      setLoadingTitles(prev => {
        const newSet = new Set(prev)
        newSet.delete(cacheKey)
        return newSet
      })
    }
  }, [resourceKey, catalogManager])
  
  // Get TW title for display
  const getTWTitle = useCallback((link: TranslationWordsLink): string => {
    const twInfo = parseTWLink(link.twLink)
    const cacheKey = `${twInfo.category}/${twInfo.term}`
    return twTitles.get(cacheKey) || twInfo.term
  }, [twTitles])
  
  return {
    twTitles,
    loadingTitles,
    fetchTWTitle,
    getTWTitle,
  }
}
