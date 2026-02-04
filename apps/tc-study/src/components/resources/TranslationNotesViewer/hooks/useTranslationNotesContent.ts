/**
 * Hook for loading Translation Notes content
 */

import type { TranslationNote } from '@bt-synergy/resource-parsers'
import { useEffect, useState } from 'react'
import { useLoaderRegistry } from '../../../../contexts/CatalogContext'

export function useTranslationNotesContent(resourceKey: string, bookCode: string) {
  const loaderRegistry = useLoaderRegistry()
  const [notes, setNotes] = useState<TranslationNote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!resourceKey || !bookCode) {
      setNotes([])
      return
    }

    let cancelled = false

    const loadNotes = async () => {
      setLoading(true)
      setError(null)

      try {
        const loader = loaderRegistry.getLoader('notes')
        if (!loader) {
          throw new Error('Translation Notes loader not found')
        }

        console.log(`📖 Loading translation notes for: ${resourceKey}/${bookCode}`)
        const processedNotes = await loader.loadContent(resourceKey, bookCode)

        if (cancelled) return

        if (processedNotes && processedNotes.notes) {
          setNotes(processedNotes.notes)
        } else {
          console.warn('⚠️ No notes returned from loader')
          setNotes([])
        }
      } catch (err) {
        if (cancelled) return

        console.error('❌ Failed to load translation notes:', {
          resourceKey,
          bookCode,
          error: err instanceof Error ? err.message : String(err),
        })

        // Check if it's a 404 (book not available)
        if (err instanceof Error && err.message.includes('404')) {
          setError(`Notes not available for ${bookCode.toUpperCase()}`)
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load notes')
        }
        setNotes([])
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadNotes()

    return () => {
      cancelled = true
    }
  }, [resourceKey, bookCode, loaderRegistry])

  return { notes, loading, error }
}
