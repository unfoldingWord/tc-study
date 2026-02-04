/**
 * useTATitles Hook
 * 
 * Fetches and caches Translation Academy article titles
 */

import { useCallback, useRef, useState } from 'react'
import { useCatalogManager } from '../../../../contexts'
import type { TranslationNote } from '@bt-synergy/resource-parsers'

// Parse TA support reference to extract article path
// Example: rc://*/ta/man/translate/figs-metaphor -> translate/figs-metaphor
function parseTAReference(supportRef: string): string | null {
  const match = supportRef.match(/rc:\/\/\*\/ta\/man\/(.+)/)
  return match ? match[1] : null
}

export function useTATitles(resourceKey: string) {
  const catalogManager = useCatalogManager()
  const [taTitles, setTaTitles] = useState<Map<string, string>>(new Map())
  const [loadingTitles, setLoadingTitles] = useState<Set<string>>(new Set())
  const taTitlesRef = useRef<Map<string, string>>(new Map())
  
  // Fetch TA title for a note from TOC
  const fetchTATitle = useCallback(async (note: TranslationNote): Promise<string | null> => {
    if (!note.supportReference) {
      return null
    }
    
    const articlePath = parseTAReference(note.supportReference)
    if (!articlePath) {
      return null
    }
    
    // Check cache first
    if (taTitlesRef.current.has(articlePath)) {
      return taTitlesRef.current.get(articlePath) || null
    }
    
    // Check if already loading
    if (loadingTitles.has(articlePath)) {
      return null
    }
    
    try {
      setLoadingTitles(prev => new Set(prev).add(articlePath))
      
      // Find TA resource (same language, same owner)
      const parts = resourceKey.split('/')
      if (parts.length < 2) {
        throw new Error(`Invalid resourceKey format: ${resourceKey}`)
      }
      
      const [owner, langPart] = parts
      const language = langPart.split('_')[0]
      const taResourceKey = `${owner}/${language}/ta`
      
      // Get TA resource metadata from catalog (contains TOC in ingredients)
      const taMetadata = await catalogManager.getResourceMetadata(taResourceKey)
      
      if (!taMetadata?.contentMetadata?.ingredients) {
        // TA metadata not ready yet - use fallback title
        const fallback = articlePath.split('/').pop() || 'Learn more'
        taTitlesRef.current.set(articlePath, fallback)
        setTaTitles(prev => new Map(prev).set(articlePath, fallback))
        return fallback
      }
      
      const ingredients = taMetadata.contentMetadata.ingredients
      
      // Look up title from TOC ingredients
      const ingredient = ingredients.find((ing: any) => {
        // Match by path or identifier
        if (ing.identifier === articlePath) return true
        if (ing.path && ing.path.replace(/\.md$/, '') === articlePath) return true
        return false
      })
      
      if (!ingredient?.title) {
        // Ingredient not found in TOC - use fallback
        const fallback = articlePath.split('/').pop() || 'Learn more'
        taTitlesRef.current.set(articlePath, fallback)
        setTaTitles(prev => new Map(prev).set(articlePath, fallback))
        return fallback
      }
      
      const title = ingredient.title
      taTitlesRef.current.set(articlePath, title)
      setTaTitles(prev => new Map(prev).set(articlePath, title))
      return title
    } catch (error) {
      // Silently fail - use fallback title
      const fallback = articlePath.split('/').pop() || 'Learn more'
      taTitlesRef.current.set(articlePath, fallback)
      setTaTitles(prev => new Map(prev).set(articlePath, fallback))
      return fallback
    } finally {
      setLoadingTitles(prev => {
        const newSet = new Set(prev)
        newSet.delete(articlePath)
        return newSet
      })
    }
  }, [resourceKey, catalogManager])
  
  // Get TA title for display
  const getTATitle = useCallback((note: TranslationNote): string => {
    if (!note.supportReference) {
      return 'Learn more'
    }
    
    const articlePath = parseTAReference(note.supportReference)
    if (!articlePath) {
      return 'Learn more'
    }
    
    return taTitles.get(articlePath) || articlePath.split('/').pop() || 'Learn more'
  }, [taTitles])
  
  return {
    taTitles,
    loadingTitles,
    fetchTATitle,
    getTATitle,
  }
}
