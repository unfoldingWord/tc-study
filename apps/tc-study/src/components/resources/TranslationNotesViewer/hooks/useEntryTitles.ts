/**
 * useEntryTitles Hook
 *
 * Fetches and caches entry titles (TW/TA) from resource TOCs
 * Used to display proper titles instead of raw rc:// links in markdown
 */

import { useCallback, useRef, useState } from 'react'
import { useCatalogManager } from '../../../../contexts'
import { parseRcLink } from '../../../../lib/markdown/rc-link-parser'

export function useEntryTitles(resourceKey: string) {
  const catalogManager = useCatalogManager()
  const [entryTitles, setEntryTitles] = useState<Map<string, string>>(new Map())
  const [loadingTitles, setLoadingTitles] = useState<Set<string>>(new Set())
  const entryTitlesRef = useRef<Map<string, string>>(new Map())

  // Fetch entry title from TOC
  const fetchEntryTitle = useCallback(async (rcLink: string): Promise<string | null> => {
    // Parse the rc:// link
    const parsed = parseRcLink(rcLink)
    
    if (!parsed.isValid) {
      console.warn('[Entry Titles] Invalid rc:// link:', rcLink)
      return null
    }

    // Only handle TW and TA links
    if (parsed.resourceType !== 'words' && parsed.resourceType !== 'academy') {
      return null
    }

    const cacheKey = `${parsed.resourceAbbrev}:${parsed.entryId}`

    // Check cache first
    if (entryTitlesRef.current.has(cacheKey)) {
      return entryTitlesRef.current.get(cacheKey) || null
    }

    // Check if already loading
    if (loadingTitles.has(cacheKey)) {
      return null
    }

    try {
      setLoadingTitles(prev => new Set(prev).add(cacheKey))

      // Extract language and owner from current resource key
      const parts = resourceKey.split('/')
      if (parts.length < 2) {
        throw new Error(`Invalid resourceKey format: ${resourceKey}`)
      }

      const owner = parts[0]
      const language = parts.length >= 2 ? parts[1].split('_')[0] : 'en'

      // Construct target resource key
      const targetResourceKey = `${owner}/${language}/${parsed.resourceAbbrev}`

      // Get resource metadata from catalog (contains TOC in ingredients)
      let metadata = await catalogManager.getResourceMetadata(targetResourceKey)

      // For TA: if catalog has no ingredients yet, trigger a load of this article so the loader
      // runs getMetadata and saves ingredients to the catalog (then we can resolve titles).
      if (
        metadata &&
        (!metadata.contentMetadata?.ingredients?.length || metadata.contentMetadata.ingredients.length < 10) &&
        parsed.resourceType === 'academy'
      ) {
        try {
          await catalogManager.loadContent(targetResourceKey, parsed.entryId)
          metadata = await catalogManager.getResourceMetadata(targetResourceKey)
        } catch {
          // Ignore load errors; we'll use fallback below if still no ingredients
        }
      }

      if (!metadata?.contentMetadata?.ingredients?.length) {
        // Metadata not ready yet - use fallback title
        const fallback = parsed.entryId.split('/').pop() || 'Unknown'
        entryTitlesRef.current.set(cacheKey, fallback)
        setEntryTitles(prev => new Map(prev).set(cacheKey, fallback))
        return fallback
      }

      const ingredients = metadata.contentMetadata.ingredients

      // Look up title from TOC ingredients
      const ingredient = ingredients.find((ing: any) => {
        // Match by identifier or path
        if (ing.identifier === parsed.entryId) return true
        if (ing.path && ing.path.replace(/\.md$/, '') === parsed.entryId) return true
        
        // For TA: also try matching by last segment (e.g. identifier "figs-nominaladj" vs entryId "translate/figs-nominaladj")
        if (parsed.resourceType === 'academy') {
          const entryLast = parsed.entryId.split('/').pop()
          const ingId = ing.identifier?.split('/').pop()
          if (entryLast && ingId && entryLast === ingId) return true
        }
        
        // For TW: also try matching just category/term (last two parts)
        if (parsed.resourceType === 'words') {
          const entryParts = parsed.entryId.split('/')
          const ingParts = ing.identifier?.split('/') || []
          if (entryParts.length >= 2 && ingParts.length >= 2) {
            const entryTerm = entryParts[entryParts.length - 1]
            const entryCategory = entryParts[entryParts.length - 2]
            const ingTerm = ingParts[ingParts.length - 1]
            const ingCategory = ingParts[ingParts.length - 2]
            if (entryTerm === ingTerm && entryCategory === ingCategory) {
              return true
            }
          }
        }
        
        return false
      })

      if (!ingredient?.title) {
        // Ingredient not found in TOC - use fallback
        const fallback = parsed.entryId.split('/').pop() || 'Unknown'
        entryTitlesRef.current.set(cacheKey, fallback)
        setEntryTitles(prev => new Map(prev).set(cacheKey, fallback))
        return fallback
      }

      const title = ingredient.title
      entryTitlesRef.current.set(cacheKey, title)
      setEntryTitles(prev => new Map(prev).set(cacheKey, title))
      return title
    } catch (error) {
      // Silently fail - use fallback title
      const fallback = parsed.entryId.split('/').pop() || 'Unknown'
      entryTitlesRef.current.set(cacheKey, fallback)
      setEntryTitles(prev => new Map(prev).set(cacheKey, fallback))
      return fallback
    } finally {
      setLoadingTitles(prev => {
        const newSet = new Set(prev)
        newSet.delete(cacheKey)
        return newSet
      })
    }
  }, [resourceKey, catalogManager])

  // Get entry title for display (sync)
  const getEntryTitle = useCallback((rcLink: string): string | null => {
    const parsed = parseRcLink(rcLink)
    
    if (!parsed.isValid) {
      return null
    }

    if (parsed.resourceType !== 'words' && parsed.resourceType !== 'academy') {
      return null
    }

    const cacheKey = `${parsed.resourceAbbrev}:${parsed.entryId}`
    return entryTitles.get(cacheKey) || null
  }, [entryTitles])

  return {
    entryTitles,
    loadingTitles,
    fetchEntryTitle,
    getEntryTitle,
  }
}
