/**
 * Always-on gateway scripture book catalog for Read.
 *
 * BCVNavigator only refreshes books while its modal is open; language switches
 * must still shrink/snap availableBooks from GL ingredients so panel filtering
 * and nav titles stay aligned with the current URL language.
 */

import { useEffect, useRef } from 'react'
import { useAppStore, useBookTitleSource } from '../../contexts/AppContext'
import { useCatalogManager, useNavigationStore } from '../../contexts'
import {
  buildBookInfosFromIngredients,
  getScriptureResources,
} from '../nav/bcvNavHelpers'

function ingredientsForBookList(r: {
  verifiedIngredients?: Array<{ identifier?: string; title?: string }>
  ingredients?: Array<{ identifier?: string; title?: string }>
}): Array<{ identifier?: string; title?: string }> {
  if (r.verifiedIngredients && r.verifiedIngredients.length > 0) return r.verifiedIngredients
  if (r.ingredients && r.ingredients.length > 0) return r.ingredients
  return []
}

export function useReadGatewayBookCatalog(preferLanguage: string | null | undefined) {
  const loadedResources = useAppStore((s) => s.loadedResources)
  const bookTitleSource = useBookTitleSource()
  const catalogManager = useCatalogManager()
  const catalogManagerRef = useRef(catalogManager)
  catalogManagerRef.current = catalogManager
  const lastSig = useRef('')

  useEffect(() => {
    if (!preferLanguage) return
    const scriptureResources = getScriptureResources(loadedResources, preferLanguage)
    if (!scriptureResources.length) return

    const preferredKey = bookTitleSource?.key ?? bookTitleSource?.id
    const ordered = preferredKey
      ? [
          ...scriptureResources.filter((r) => (r.key ?? r.id) === preferredKey),
          ...scriptureResources.filter((r) => (r.key ?? r.id) !== preferredKey),
        ]
      : scriptureResources

    const applyBooks = (
      ingredients: Array<{ identifier?: string; title?: string }>
    ): boolean => {
      if (!ingredients.length) return false
      const books = buildBookInfosFromIngredients(ingredients)
      if (!books.length) return false
      const lang = preferLanguage.toLowerCase()
      const sig = `${lang}|${books.map((b) => `${b.code}:${b.name}`).join(',')}`
      if (sig === lastSig.current) return true
      lastSig.current = sig
      useNavigationStore.getState().setAvailableBooks(books)
      return true
    }

    // Sync path — avoid cancel races while loadedResources churns during hydrate.
    const syncIngredients = ordered.flatMap((r) => ingredientsForBookList(r))
    if (applyBooks(syncIngredients)) return

    let cancelled = false
    void (async () => {
      try {
        const lists = await Promise.all(
          ordered.map(async (r) => {
            const local = ingredientsForBookList(r)
            if (local.length) return local
            const k = r.key ?? r.id
            try {
              const metadata = await catalogManagerRef.current.getResourceMetadata(k)
              return metadata?.contentMetadata?.ingredients ?? []
            } catch {
              return []
            }
          })
        )
        if (cancelled) return
        applyBooks(lists.flat())
      } catch (e) {
        console.warn('[Read] Gateway book catalog refresh failed:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [preferLanguage, loadedResources, bookTitleSource])
}
