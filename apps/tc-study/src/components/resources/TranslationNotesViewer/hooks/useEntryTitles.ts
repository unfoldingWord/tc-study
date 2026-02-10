/**
 * useEntryTitles Hook
 *
 * Fetches and caches entry titles (TW/TA) from resource TOCs
 * Used to display proper titles instead of raw rc:// links in markdown
 *
 * When taMetadata (stateful) is passed, TA titles are resolved synchronously from it;
 * re-render happens when taMetadata state updates (no retries needed for TA).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCatalogManager } from '../../../../contexts'
import { parseRcLink } from '../../../../lib/markdown/rc-link-parser'
import type { TAMetadataForTitles } from './useTAMetadataForTitles'

// Staggered retries for when taMetadata is not used (e.g. TW) or not yet loaded
const TITLE_RETRY_DELAYS_MS = [400, 900, 1900, 3700, 6500, 10000]
const TITLE_RETRY_MAX = TITLE_RETRY_DELAYS_MS.length

function findTitleInIngredients(
  ingredients: Array<{ identifier?: string; path?: string; title?: string }>,
  entryId: string,
  resourceType: 'academy' | 'words'
): string | null {
  const ingredient = ingredients.find((ing: any) => {
    if (ing.identifier === entryId) return true
    if (ing.path && ing.path.replace(/\.md$/, '') === entryId) return true
    if (resourceType === 'academy') {
      const entryLast = entryId.split('/').pop()
      const ingId = ing.identifier?.split('/').pop()
      if (entryLast && ingId && entryLast === ingId) return true
    }
    if (resourceType === 'words') {
      const entryParts = entryId.split('/')
      const ingParts = ing.identifier?.split('/') || []
      if (entryParts.length >= 2 && ingParts.length >= 2) {
        const entryTerm = entryParts[entryParts.length - 1]
        const entryCategory = entryParts[entryParts.length - 2]
        const ingTerm = ingParts[ingParts.length - 1]
        const ingCategory = ingParts[ingParts.length - 2]
        if (entryTerm === ingTerm && entryCategory === ingCategory) return true
      }
    }
    return false
  })
  return ingredient?.title ?? null
}

export function useEntryTitles(resourceKey: string, taMetadata?: TAMetadataForTitles | null) {
  const catalogManager = useCatalogManager()
  const [entryTitles, setEntryTitles] = useState<Map<string, string>>(new Map())
  const [loadingTitles, setLoadingTitles] = useState<Set<string>>(new Set())
  const entryTitlesRef = useRef<Map<string, string>>(new Map())
  const retryCountRef = useRef<Map<string, number>>(new Map())
  const retryTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Clear retry timeouts when resourceKey (e.g. language) changes or unmount
  useEffect(() => {
    return () => {
      retryTimeoutsRef.current.forEach(t => clearTimeout(t))
      retryTimeoutsRef.current.clear()
      retryCountRef.current.clear()
    }
  }, [resourceKey])

  // Fetch entry title from TOC
  const fetchEntryTitle = useCallback(async (rcLink: string, forceRefetch = false): Promise<string | null> => {
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

    // Check cache first (skip when forceRefetch so we can retry after catalog is ready)
    if (!forceRefetch && entryTitlesRef.current.has(cacheKey)) {
      return entryTitlesRef.current.get(cacheKey) || null
    }

    // Check if already loading (skip when forceRefetch)
    if (!forceRefetch && loadingTitles.has(cacheKey)) {
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
        // Metadata not ready yet - use fallback title, then retry when catalog may have loaded (e.g. after language switch)
        const fallback = parsed.entryId.split('/').pop() || 'Unknown'
        entryTitlesRef.current.set(cacheKey, fallback)
        setEntryTitles(prev => new Map(prev).set(cacheKey, fallback))

        const retries = retryCountRef.current.get(cacheKey) ?? 0
        if (retries < TITLE_RETRY_MAX) {
          retryCountRef.current.set(cacheKey, retries + 1)
          const existing = retryTimeoutsRef.current.get(cacheKey)
          if (existing) clearTimeout(existing)
          const delayMs = TITLE_RETRY_DELAYS_MS[retries] ?? 2000
          const t = setTimeout(() => {
            retryTimeoutsRef.current.delete(cacheKey)
            fetchEntryTitle(rcLink, true)
          }, delayMs)
          retryTimeoutsRef.current.set(cacheKey, t)
        }
        return fallback
      }

      const ingredients = metadata.contentMetadata.ingredients
      const titleFromIngredient = findTitleInIngredients(
        ingredients,
        parsed.entryId,
        parsed.resourceType as 'academy' | 'words'
      )

      if (!titleFromIngredient) {
        // Ingredient not found in TOC - use fallback
        const fallback = parsed.entryId.split('/').pop() || 'Unknown'
        entryTitlesRef.current.set(cacheKey, fallback)
        setEntryTitles(prev => new Map(prev).set(cacheKey, fallback))
        return fallback
      }

      const title = titleFromIngredient
      retryCountRef.current.delete(cacheKey)
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

  // Get entry title for display (sync). Prefer stateful taMetadata for TA so re-render happens when it loads.
  const getEntryTitle = useCallback((rcLink: string): string | null => {
    const parsed = parseRcLink(rcLink)
    if (!parsed.isValid || (parsed.resourceType !== 'words' && parsed.resourceType !== 'academy')) {
      return null
    }
    const cacheKey = `${parsed.resourceAbbrev}:${parsed.entryId}`

    if (parsed.resourceType === 'academy' && taMetadata?.contentMetadata?.ingredients?.length) {
      const title = findTitleInIngredients(
        taMetadata.contentMetadata.ingredients,
        parsed.entryId,
        'academy'
      )
      if (title) return title
    }

    return entryTitles.get(cacheKey) || null
  }, [entryTitles, taMetadata])

  const invalidateTitles = useCallback(() => {
    entryTitlesRef.current.clear()
    setEntryTitles(new Map())
    retryCountRef.current.clear()
    retryTimeoutsRef.current.forEach(t => clearTimeout(t))
    retryTimeoutsRef.current.clear()
  }, [])

  return {
    entryTitles,
    loadingTitles,
    fetchEntryTitle,
    getEntryTitle,
    invalidateTitles,
  }
}
