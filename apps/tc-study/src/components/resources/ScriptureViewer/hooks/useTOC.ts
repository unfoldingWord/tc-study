/**
 * Hook for loading and managing Table of Contents (TOC) and available books
 */

import { useEffect, useRef, useState } from 'react'
import { useApp, useCatalogManager, useNavigation } from '../../../../contexts'
import type { BookInfo, ResourceTOC } from '../../../../contexts/types-only'
import { defaultSectionsService } from '../../../../lib/services/default-sections'
import { getStandardVerseCount } from '../../../../lib/versification'

export function useTOC(
  resourceKey: string,
  resourceId: string,
  isAnchor?: boolean
) {
  const catalogManager = useCatalogManager()
  const app = useApp()
  const navigation = useNavigation()
  const [availableBooks, setAvailableBooks] = useState<BookInfo[]>([])
  const [loadedTOC, setLoadedTOC] = useState<ResourceTOC | null>(null)
  const tocSetRef = useRef(false) // Track if TOC has been set to prevent infinite loops
  const [catalogCheckTrigger, setCatalogCheckTrigger] = useState(0)
  const metadataCheckIntervalRef = useRef<number>()

  // Poll catalog until metadata is available (for Phase 2 background loading)
  useEffect(() => {
    const checkForMetadata = async () => {
      try {
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
        if (metadata?.contentMetadata?.ingredients && metadata.contentMetadata.ingredients.length > 0) {
          // Metadata is available! Trigger TOC reload
          setCatalogCheckTrigger(prev => prev + 1)
          
          // Stop polling
          if (metadataCheckIntervalRef.current) {
            clearInterval(metadataCheckIntervalRef.current)
            metadataCheckIntervalRef.current = undefined
          }
        }
      } catch (err) {
        // Ignore errors during polling
      }
    }
    
    // Start polling if we don't have books yet
    if (availableBooks.length === 0) {
      checkForMetadata() // Check immediately
      metadataCheckIntervalRef.current = window.setInterval(checkForMetadata, 1000)
    }
    
    return () => {
      if (metadataCheckIntervalRef.current) {
        clearInterval(metadataCheckIntervalRef.current)
      }
    }
  }, [resourceKey, catalogManager, availableBooks.length])

  useEffect(() => {
    let cancelled = false

    const loadTOC = async () => {
      try {
        // Get resource metadata to find available books
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
        
        console.log('[useTOC] Retrieved metadata for', resourceKey, {
          hasMetadata: !!metadata,
          hasContentMetadata: !!metadata?.contentMetadata,
          hasIngredients: !!metadata?.contentMetadata?.ingredients,
          ingredientsCount: metadata?.contentMetadata?.ingredients?.length || 0,
          sample: metadata?.contentMetadata?.ingredients?.slice(0, 3)
        })

        if (cancelled) return

        if (metadata && metadata.contentMetadata?.ingredients) {
          // Extract book codes from ingredients
          const ingredients = metadata.contentMetadata.ingredients
          const bookCodes = new Set<string>()

          // Scripture resources have ingredients with identifiers as 3-letter codes (e.g., 'gen', 'exo', 'mat')
          // The path field contains the full file path (e.g., '01-GEN.usfm', '41-MAT.usfm')
          ingredients.forEach((ing: any) => {
            const identifier = ing.identifier
            if (!identifier) return

            // Normalize to lowercase
            const normalizedId = identifier.toLowerCase()

            // Book codes should be 2-4 characters (e.g., 'gen', 'exo', 'mat', 'jude')
            if (normalizedId && normalizedId.length >= 2 && normalizedId.length <= 4) {
              bookCodes.add(normalizedId)
            }
          })

          // Convert to BookInfo array
          const books: BookInfo[] = Array.from(bookCodes).map((code) => {
            // Get chapter count from ingredients if available
            const bookIngredients = ingredients.filter((ing: any) =>
              ing.identifier?.toLowerCase() === code
            )
            const chapters = bookIngredients.length || 1

            // Get verse counts from standard versification
            const verses = getStandardVerseCount(code)

            return {
              code,
              name: code.toUpperCase(), // Will be improved with proper book names
              chapters: verses?.length || chapters, // Use verse array length as source of truth for chapter count
              verses, // Array of verse counts per chapter
            }
          }).sort((a, b) => a.code.localeCompare(b.code))

          setAvailableBooks(books)

          // Store TOC for potential activation
            const toc: ResourceTOC = {
              resourceId,
              resourceType: 'scripture',
              books,
            }
          setLoadedTOC(toc)

          // Auto-set as anchor if:
          // 1. Explicitly marked as anchor (isAnchor prop)
          // 2. OR no anchor resource exists yet (first scripture resource wins)
          const shouldSetAsAnchor = (isAnchor || !app.anchorResourceId) && !tocSetRef.current
          
          if (shouldSetAsAnchor) {
            app.setAnchorResource(resourceId, toc)
            navigation.setAvailableBooks(books)
            
            // Load default sections for the current book (will be replaced by content sections when content loads)
            const currentBook = navigation.currentReference.book
            const sections = await defaultSectionsService.getDefaultSections(currentBook)
            if (!cancelled && sections.length > 0) {
              navigation.setBookSections(currentBook, sections)
            }
            
            tocSetRef.current = true
          }

          // Note: Auto-navigation to first book should be handled by parent component
          // if current book isn't available
        } else {
          console.warn('⚠️ No ingredients found in metadata for resource:', resourceKey)
          setAvailableBooks([])
          setLoadedTOC(null)
        }
      } catch (err) {
        console.error('❌ Error loading TOC:', err)
        setAvailableBooks([])
        setLoadedTOC(null)
      }
    }

    loadTOC()

    return () => {
      cancelled = true
    }
  }, [resourceKey, catalogManager, isAnchor, resourceId, app, navigation, catalogCheckTrigger])

  // Reset TOC set flag when resource changes
  useEffect(() => {
    tocSetRef.current = false
  }, [resourceId])

  // Function to manually set this resource as anchor
  const setAsAnchor = async () => {
    if (loadedTOC) {
      // Update AppContext
      app.setAnchorResource(resourceId, loadedTOC)
      // Update NavigationContext with the available books
      navigation.setAvailableBooks(loadedTOC.books)

      // Load default sections for the current book (will be replaced by content sections when content loads)
      const currentBook = navigation.currentReference.book
      const sections = await defaultSectionsService.getDefaultSections(currentBook)
      if (sections.length > 0) {
        navigation.setBookSections(currentBook, sections)
      }

      tocSetRef.current = true
    }
  }

  return { availableBooks, setAsAnchor }
}


