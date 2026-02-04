/**
 * useOriginalLanguageContent Hook
 * 
 * Gets original language scripture content for building quotes.
 * 
 * Loads original language content independently (as the "medium point" for matching).
 * This content is used to match TWL origWords to tokens, which then align to target language tokens.
 * 
 * Following the same pattern as ScriptureViewer - simple, direct loading without complex signal patterns.
 */

import type { OptimizedChapter } from '@bt-synergy/resource-parsers'
import type { ProcessedScripture } from '@bt-synergy/usfm-processor'
import { useEffect, useState } from 'react'
import { useCatalogManager, useCurrentReference, useLoaderRegistry } from '../../../../contexts'
import { convertProcessedScriptureToOptimizedChapters } from '../utils/convertProcessedToOptimized'

interface UseOriginalLanguageContentOptions {
  resourceKey: string // TWL resource key (e.g., "unfoldingWord/en/twl")
  resourceId: string // TWL viewer resource ID (not used but kept for API consistency)
}

interface OriginalLanguageResource {
  resourceKey: string
  language: string
  bookCode: string
}

export function useOriginalLanguageContent({ resourceKey }: UseOriginalLanguageContentOptions) {
  const currentRef = useCurrentReference()
  const loaderRegistry = useLoaderRegistry()
  const catalogManager = useCatalogManager()
  
  const [originalLanguageResources, setOriginalLanguageResources] = useState<OriginalLanguageResource[]>([])
  const [originalContent, setOriginalContent] = useState<OptimizedChapter[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Main effect: Load original language content
  useEffect(() => {
    console.log('🔍 [useOriginalLanguageContent] Effect triggered:', {
      book: currentRef.book,
      chapter: currentRef.chapter,
      hasCatalogManager: !!catalogManager,
      hasLoaderRegistry: !!loaderRegistry
    })
    
    if (!currentRef.book || !currentRef.chapter || !catalogManager || !loaderRegistry) {
      console.log('❌ [useOriginalLanguageContent] Early return - missing dependencies')
      return
    }
    
    let cancelled = false
    
    const loadOriginalContent = async () => {
      try {
        setLoading(true)
        setError(null)
        setOriginalContent(null)
        
        console.log('🔍 [useOriginalLanguageContent] Starting load:', {
          book: currentRef.book,
          chapter: currentRef.chapter
        })
        
        // Find available original language resources
        // NOTE: Original language resources (UGNT, UHB) are always from unfoldingWord,
        // regardless of which organization's TWL we're using
        const bookCode = currentRef.book?.toUpperCase() || ''
        
        // Determine if this is NT or OT
        const ntBooks = ['MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV']
        const isNT = ntBooks.includes(bookCode)
        
        console.log('🔍 [useOriginalLanguageContent] Book type:', {
          bookCode,
          isNT
        })
        
        const resources: OriginalLanguageResource[] = []
        
        if (isNT) {
          // Look for Greek New Testament (UGNT) - always from unfoldingWord
          const greekResourceKey = 'unfoldingWord/el-x-koine/ugnt'
          const greekMetadata = await catalogManager.getResourceMetadata(greekResourceKey)
          console.log('🔍 [useOriginalLanguageContent] Greek metadata:', {
            resourceKey: greekResourceKey,
            hasMetadata: !!greekMetadata
          })
          if (greekMetadata) {
            resources.push({
              resourceKey: greekResourceKey,
              language: 'el-x-koine',
              bookCode,
            })
          }
        } else {
          // Look for Hebrew Bible (UHB) - always from unfoldingWord
          const hebrewResourceKey = 'unfoldingWord/hbo/uhb'
          const hebrewMetadata = await catalogManager.getResourceMetadata(hebrewResourceKey)
          console.log('🔍 [useOriginalLanguageContent] Hebrew metadata:', {
            resourceKey: hebrewResourceKey,
            hasMetadata: !!hebrewMetadata
          })
          if (hebrewMetadata) {
            resources.push({
              resourceKey: hebrewResourceKey,
              language: 'hbo',
              bookCode,
            })
          }
        }
        
        if (cancelled) return
        setOriginalLanguageResources(resources)
        
        console.log('🔍 [useOriginalLanguageContent] Resources found:', resources.length)
        
        if (resources.length === 0) {
          console.log('❌ [useOriginalLanguageContent] No original language resources found')
          setLoading(false)
          return
        }
        
        const resource = resources[0]
        const chapter = currentRef.chapter

        console.log('🔍 [useOriginalLanguageContent] Loading content:', {
          resourceKey: resource.resourceKey,
          book: currentRef.book,
          chapter
        })

        // Load content directly (simple, direct approach like ScriptureViewer)
        
        const loader = loaderRegistry.getLoader('scripture')
        if (!loader) {
          throw new Error('Scripture loader not found')
        }

        const loadedContent = await loader.loadContent(resource.resourceKey, currentRef.book)
        if (cancelled) return

        console.log('🔍 [useOriginalLanguageContent] Loaded content:', {
          hasContent: !!loadedContent,
          type: typeof loadedContent,
          hasChapters: loadedContent && typeof loadedContent === 'object' && 'chapters' in loadedContent
        })

        if (loadedContent && typeof loadedContent === 'object' && 'chapters' in loadedContent) {
          const processedScripture = loadedContent as ProcessedScripture
          const optimizedChapters = convertProcessedScriptureToOptimizedChapters(processedScripture)
          
          console.log('🔍 [useOriginalLanguageContent] Converted chapters:', {
            totalChapters: optimizedChapters.length,
            chapterNumbers: optimizedChapters.map(ch => ch.number),
            targetChapter: chapter
          })
          
          // Filter to current chapter only (as per user requirement)
          const filteredChapters = optimizedChapters.filter(ch => ch.number === chapter)
          
          console.log('🔍 [useOriginalLanguageContent] Filtered chapters:', {
            count: filteredChapters.length,
            hasTokens: filteredChapters[0]?.verses?.[0]?.tokens?.length || 0
          })
          
          if (filteredChapters.length === 0) {
            console.log('❌ [useOriginalLanguageContent] No chapters matched current chapter')
            setLoading(false)
            return
          }
          
          setOriginalContent(filteredChapters)
          console.log('✅ [useOriginalLanguageContent] Content loaded successfully')
        } else {
          throw new Error('Invalid original language content structure')
        }
      } catch (err) {
        if (cancelled) return
        console.error('❌ [useOriginalLanguageContent] Failed to load original language content:', err)
        console.error('❌ [useOriginalLanguageContent] Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        })
        setError(err instanceof Error ? err.message : 'Failed to load original language content')
      } finally {
        if (!cancelled) {
          console.log('🔍 [useOriginalLanguageContent] Load complete, loading:', false)
          setLoading(false)
        }
      }
    }
    
    loadOriginalContent()

    return () => {
      cancelled = true
    }
  }, [currentRef.book, currentRef.chapter, catalogManager, loaderRegistry, resourceKey])
  
  return {
    originalLanguageResources,
    originalContent,
    loading,
    error,
  }
}
