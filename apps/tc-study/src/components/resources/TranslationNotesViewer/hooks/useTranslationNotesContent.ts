/**
 * Hook for loading Translation Notes content.
 * Results are cached by resourceKey+book so switching tabs doesn't re-fetch.
 */

import type { ProcessedNotes, TranslationNote } from '@bt-synergy/resource-parsers'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLoaderRegistry } from '../../../../contexts/CatalogContext'
import {
  getHelpsContentHydrateTick,
  shouldReuseHelpsContentCache,
  subscribeHelpsContentHydrate,
} from '../../../../features/helps/helpsContentHydrate'

const CACHE_MAX = 50
const notesCache = new Map<string, { notes: TranslationNote[]; error: string | null }>()

function cacheKey(resourceKey: string, bookCode: string, loaderTypeId: string) {
  return `notes:${loaderTypeId}:${resourceKey}:${bookCode}`
}

export function useTranslationNotesContent(
  resourceKey: string,
  bookCode: string,
  loaderTypeId: string = 'notes'
) {
  const loaderRegistry = useLoaderRegistry()
  const hydrateTick = useSyncExternalStore(
    subscribeHelpsContentHydrate,
    getHelpsContentHydrateTick,
    getHelpsContentHydrateTick
  )
  const cached =
    resourceKey && bookCode
      ? notesCache.get(cacheKey(resourceKey, bookCode, loaderTypeId))
      : undefined
  const reuseCached = shouldReuseHelpsContentCache(cached)
  const [notes, setNotes] = useState<TranslationNote[]>(reuseCached ? cached?.notes ?? [] : [])
  const [loading, setLoading] = useState(!reuseCached)
  const [error, setError] = useState<string | null>(reuseCached ? cached?.error ?? null : null)

  useEffect(() => {
    if (!resourceKey || !bookCode) {
      setNotes([])
      setError(null)
      setLoading(false)
      return
    }

    const key = cacheKey(resourceKey, bookCode, loaderTypeId)
    const hit = notesCache.get(key)
    if (hit && shouldReuseHelpsContentCache(hit)) {
      setNotes(hit.notes)
      setError(hit.error)
      setLoading(false)
      return
    }

    let cancelled = false

    const loadNotes = async () => {
      setLoading(true)
      setError(null)

      try {
        const loader = loaderRegistry.getLoader(loaderTypeId)
        if (!loader) {
          throw new Error('Translation Notes loader not found')
        }

        const processedNotes = (await loader.loadContent(resourceKey, bookCode)) as ProcessedNotes | null

        if (cancelled) return

        if (processedNotes && processedNotes.notes) {
          const data = { notes: processedNotes.notes, error: null }
          if (notesCache.size >= CACHE_MAX) notesCache.delete(notesCache.keys().next().value!)
          notesCache.set(key, data)
          setNotes(data.notes)
        } else {
          setNotes([])
        }
      } catch (err) {
        if (cancelled) return

        console.error('❌ Failed to load translation notes:', {
          resourceKey,
          bookCode,
          error: err instanceof Error ? err.message : String(err),
        })

        const errMsg = err instanceof Error && err.message.includes('404')
          ? `Notes not available for ${bookCode.toUpperCase()}`
          : (err instanceof Error ? err.message : 'Failed to load notes')
        notesCache.delete(key)
        setError(errMsg)
        setNotes([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadNotes()
    return () => { cancelled = true }
  }, [resourceKey, bookCode, loaderTypeId, loaderRegistry, hydrateTick])

  return { notes, loading, error }
}
