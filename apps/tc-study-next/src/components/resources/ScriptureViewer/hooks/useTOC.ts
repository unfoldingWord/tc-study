/**
 * Hook for loading and managing Table of Contents (TOC) and available books.
 *
 * Prefer Phase-1 AppStore ingredients so scripture content can load on language
 * switch before catalog metadata is written (Phase 2).
 */

import { useEffect, useRef, useState } from 'react'
import { useApp, useCatalogManager, useNavigation } from '../../../../contexts'
import type { BookInfo, ResourceTOC } from '../../../../contexts/types-only'
import { buildBookInfosFromIngredients } from '../../../../features/nav/bcvNavHelpers'
import { defaultSectionsService } from '../../../../lib/services/default-sections'
import { isOriginalLanguageResource } from '../../../../utils/resourceHelpers'

type IngredientLike = { identifier?: string; title?: string }

function hasGatewayScripture(
  loaded: Record<
    string,
    | {
        type?: unknown
        category?: unknown
        language?: string
        languageCode?: string
        subject?: string
      }
    | undefined
  >
): boolean {
  return Object.values(loaded).some((r) => {
    if (!r) return false
    const isScripture =
      String(r.category ?? '').toLowerCase() === 'scripture' ||
      String(r.type ?? '').toLowerCase() === 'scripture'
    if (!isScripture) return false
    const lang = r.languageCode || r.language || ''
    return !isOriginalLanguageResource(lang, r.subject || '')
  })
}

function ingredientsFromLoadedResource(
  loaded: Record<string, { verifiedIngredients?: IngredientLike[]; ingredients?: IngredientLike[] } | undefined>,
  resourceId: string,
  resourceKey: string
): IngredientLike[] {
  const baseKey = resourceId.replace(/#\d+$/, '')
  for (const key of [resourceId, resourceKey, baseKey]) {
    const self = loaded[key]
    if (!self) continue
    if (self.verifiedIngredients && self.verifiedIngredients.length > 0) {
      return self.verifiedIngredients
    }
    if (self.ingredients && self.ingredients.length > 0) {
      return self.ingredients
    }
  }
  return []
}

function shouldBecomeAnchor(options: {
  isAnchor?: boolean
  selfIsOriginal: boolean
  anchorResourceId: string | null | undefined
  loadedResources: Record<
    string,
    { language?: string; languageCode?: string; subject?: string } | undefined
  >
}): boolean {
  const { isAnchor, selfIsOriginal, anchorResourceId, loadedResources } = options
  if (isAnchor) return true

  // Original-language must not win the anchor race over gateway scripture.
  if (selfIsOriginal && hasGatewayScripture(loadedResources)) return false

  if (!anchorResourceId) return true

  const current = loadedResources[anchorResourceId]
  const currentLang = current?.languageCode || current?.language || ''
  const currentIsOl = isOriginalLanguageResource(currentLang, current?.subject || '')
  // Gateway scripture may replace an OL-only anchor after language switch.
  return currentIsOl && !selfIsOriginal
}

export function useTOC(resourceKey: string, resourceId: string, isAnchor?: boolean) {
  const catalogManager = useCatalogManager()
  const app = useApp()
  const navigation = useNavigation()
  const [availableBooks, setAvailableBooks] = useState<BookInfo[]>([])
  const [loadedTOC, setLoadedTOC] = useState<ResourceTOC | null>(null)
  const [isLoadingTOC, setIsLoadingTOC] = useState(true)
  const tocSetRef = useRef(false)
  const [catalogCheckTrigger, setCatalogCheckTrigger] = useState(0)
  const metadataCheckIntervalRef = useRef<number | undefined>(undefined)

  // Re-trigger TOC when Phase-1 ingredients appear or catalog metadata lands.
  useEffect(() => {
    const checkForMetadata = async () => {
      try {
        const local = ingredientsFromLoadedResource(app.loadedResources, resourceId, resourceKey)
        if (local.length > 0) {
          setCatalogCheckTrigger((prev) => prev + 1)
          if (metadataCheckIntervalRef.current) {
            clearInterval(metadataCheckIntervalRef.current)
            metadataCheckIntervalRef.current = undefined
          }
          return
        }
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
        if (metadata?.contentMetadata?.ingredients && metadata.contentMetadata.ingredients.length > 0) {
          setCatalogCheckTrigger((prev) => prev + 1)
          if (metadataCheckIntervalRef.current) {
            clearInterval(metadataCheckIntervalRef.current)
            metadataCheckIntervalRef.current = undefined
          }
        }
      } catch {
        // Ignore polling errors
      }
    }

    if (!isLoadingTOC && availableBooks.length === 0) {
      checkForMetadata()
      metadataCheckIntervalRef.current = window.setInterval(checkForMetadata, 2000)
    }

    return () => {
      if (metadataCheckIntervalRef.current) {
        clearInterval(metadataCheckIntervalRef.current)
      }
    }
  }, [
    resourceKey,
    resourceId,
    catalogManager,
    availableBooks.length,
    isLoadingTOC,
    app.loadedResources,
  ])

  useEffect(() => {
    let cancelled = false

    const applyBooks = async (ingredients: IngredientLike[]) => {
      const books = buildBookInfosFromIngredients(ingredients)
      if (!books.length) return

      setAvailableBooks(books)

      const toc: ResourceTOC = {
        resourceId,
        resourceType: 'scripture',
        books,
      }
      setLoadedTOC(toc)

      const self = app.loadedResources[resourceId] || app.loadedResources[resourceKey]
      const selfLang = self?.languageCode || self?.language || ''
      const selfIsOriginal = isOriginalLanguageResource(selfLang, self?.subject || '')

      if (
        !tocSetRef.current &&
        shouldBecomeAnchor({
          isAnchor,
          selfIsOriginal,
          anchorResourceId: app.anchorResourceId,
          loadedResources: app.loadedResources,
        })
      ) {
        app.setAnchorResource(resourceId, toc)
        if (!(selfIsOriginal && hasGatewayScripture(app.loadedResources))) {
          navigation.setAvailableBooks(books)
        }
        const currentBook = navigation.currentReference.book
        const sections = await defaultSectionsService.getDefaultSections(currentBook)
        if (!cancelled && sections.length > 0) {
          navigation.setBookSections(currentBook, sections)
        }
        tocSetRef.current = true
      }
    }

    const loadTOC = async () => {
      setIsLoadingTOC(true)
      try {
        const localIngredients = ingredientsFromLoadedResource(
          app.loadedResources,
          resourceId,
          resourceKey
        )
        if (localIngredients.length > 0) {
          if (!cancelled) await applyBooks(localIngredients)
          return
        }

        const metadata = await catalogManager.getResourceMetadata(resourceKey)
        if (cancelled) return

        const catalogIngredients = metadata?.contentMetadata?.ingredients
        if (catalogIngredients && catalogIngredients.length > 0) {
          await applyBooks(catalogIngredients)
        } else {
          console.warn('⚠️ No ingredients found in metadata for resource:', resourceKey)
          setAvailableBooks([])
          setLoadedTOC(null)
        }
      } catch (err) {
        console.error('❌ Error loading TOC:', err)
        setAvailableBooks([])
        setLoadedTOC(null)
      } finally {
        if (!cancelled) setIsLoadingTOC(false)
      }
    }

    loadTOC()

    return () => {
      cancelled = true
    }
  }, [resourceKey, catalogManager, isAnchor, resourceId, app, navigation, catalogCheckTrigger])

  useEffect(() => {
    tocSetRef.current = false
  }, [resourceId])

  const setAsAnchor = async () => {
    if (!loadedTOC) return
    app.setAnchorResource(resourceId, loadedTOC)
    const self = app.loadedResources[resourceId] || app.loadedResources[resourceKey]
    const selfLang = self?.languageCode || self?.language || ''
    const selfIsOriginal = isOriginalLanguageResource(selfLang, self?.subject || '')
    if (!(selfIsOriginal && hasGatewayScripture(app.loadedResources))) {
      navigation.setAvailableBooks(loadedTOC.books)
    }
    const currentBook = navigation.currentReference.book
    const sections = await defaultSectionsService.getDefaultSections(currentBook)
    if (sections.length > 0) {
      navigation.setBookSections(currentBook, sections)
    }
    tocSetRef.current = true
  }

  return { availableBooks, isLoadingTOC, setAsAnchor }
}
