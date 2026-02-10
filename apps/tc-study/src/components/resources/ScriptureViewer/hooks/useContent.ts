/**
 * Hook for loading scripture content from catalog
 */

import type { ProcessedScripture, ProcessedVerse } from '@bt-synergy/usfm-processor'
import { useEffect, useMemo, useState } from 'react'
import { useCatalogManager, useCurrentReference, useNavigation } from '../../../../contexts'
import type { BookInfo } from '../../../../contexts/types-only'
import { defaultSectionsService } from '../../../../lib/services/default-sections'
import { extractVerseCountsFromContent } from '../../../../lib/versification'
import { attachAlignmentSemanticIds } from '../utils/attachAlignmentSemanticIds'

export function useContent(
  resourceKey: string,
  availableBooks: BookInfo[],
  language?: string
) {
  const catalogManager = useCatalogManager()
  const currentRef = useCurrentReference()
  const navigation = useNavigation()
  const [loadedContent, setLoadedContent] = useState<ProcessedScripture | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create a stable string representation of available book codes to prevent infinite loops
  const availableBookCodesStr = availableBooks.map(b => b.code.toLowerCase()).sort().join(',')

  // Load content for current book from catalog
  useEffect(() => {
    let cancelled = false
    const bookCode = currentRef.book

    // Parse available book codes from string
    const availableBookCodes = new Set(availableBookCodesStr.split(',').filter(Boolean))

    // Don't try to load if we don't have available books yet
    if (availableBookCodes.size === 0) {
      return
    }

    // Check if book is available in this resource
    if (!availableBookCodes.has(bookCode.toLowerCase())) {
      setIsLoading(false)
      setError('BOOK_NOT_AVAILABLE')
      setLoadedContent(null)
      return
    }

    const loadBookContent = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Load scripture content from catalog (three-tier lookup)
        // ScriptureLoader now returns ProcessedScripture format
        const content = await catalogManager.loadContent(resourceKey, bookCode) as ProcessedScripture

        if (cancelled) return

        if (content && content.metadata && content.chapters) {
          // For target language resources (not original language), attach alignment semantic IDs
          const isOriginalLanguage = language === 'el-x-koine' || language === 'hbo'
          const alignmentsCount = content.alignments?.length ?? 0
          if (typeof console !== 'undefined' && console.log) {
            console.log('[TN Quote] useContent after load', {
              resourceKey,
              bookCode,
              language,
              isOriginalLanguage,
              alignmentsCount,
              willAttach: !isOriginalLanguage && alignmentsCount > 0,
            })
          }
          if (!isOriginalLanguage && content.alignments && content.alignments.length > 0) {
            // Attach to all verses in all chapters
            const allVerses: ProcessedVerse[] = []
            for (const chapter of content.chapters) {
              allVerses.push(...chapter.verses)
            }
            attachAlignmentSemanticIds(content, allVerses)
            // [TN Quote] confirm tokens have alignedOriginalWordIds after attach
            const firstVerseWithTokens = allVerses.find((v) => v.wordTokens?.length)
            const firstWordToken = firstVerseWithTokens?.wordTokens?.find((t: any) => t.type === 'word')
            if (typeof console !== 'undefined' && console.log) {
              console.log('[TN Quote] useContent after attachAlignmentSemanticIds', {
                versesCount: allVerses.length,
                firstVerseRef: firstVerseWithTokens?.reference,
                firstWordTokenAlign: firstWordToken
                  ? (firstWordToken as any).alignedOriginalWordIds
                  : 'no word token',
              })
            }
          }

          // Update verse counts in NavigationContext from actual content
          if (content.metadata.chapterVerseMap) {
            const verseCounts = extractVerseCountsFromContent(content.metadata.chapterVerseMap)
            navigation.updateBookVerseCount(bookCode, verseCounts)
          }

          // Update sections in NavigationContext
          // Use sections from content if available, otherwise fall back to default sections
          const sections = content.translatorSections && content.translatorSections.length > 0
            ? content.translatorSections
            : await defaultSectionsService.getDefaultSections(bookCode)
          
          if (sections.length > 0) {
            navigation.setBookSections(bookCode, sections)
          } else {
            console.warn('⚠️ No sections available for', bookCode)
          }

          setLoadedContent(content)
        } else {
          console.warn('⚠️ No ProcessedScripture returned from catalog for:', bookCode)
          console.warn('   Content type:', typeof content)
          console.warn('   Has metadata?', content && 'metadata' in content)
          console.warn('   Has chapters?', content && 'chapters' in content)
          setLoadedContent(null)
        }
      } catch (err) {
        if (cancelled) return
        console.error('❌ Error loading ProcessedScripture from catalog:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoadedContent(null)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadBookContent()

    return () => {
      cancelled = true
    }
  }, [currentRef.book, resourceKey, catalogManager, availableBookCodesStr])

  // Get current chapter(s) data from ProcessedScripture
  // For cross-chapter ranges, we need all chapters in the range
  const relevantChapters = useMemo(() => {
    if (!loadedContent) {
      return []
    }

    const startChapter = currentRef.chapter
    const endChapter = currentRef.endChapter || startChapter
    
    const chapters = loadedContent.chapters.filter(
      (ch) => ch.number >= startChapter && ch.number <= endChapter
    )
    
    return chapters
  }, [loadedContent, currentRef.chapter, currentRef.endChapter])

  // Keep currentChapter for backward compatibility (first chapter in range)
  const currentChapter = useMemo(() => {
    return relevantChapters.length > 0 ? relevantChapters[0] : null
  }, [relevantChapters])

  // Get verses in range (supports cross-chapter ranges)
  const displayVerses = useMemo(() => {
    if (relevantChapters.length === 0) {
      return []
    }

    const startChapter = currentRef.chapter
    const endChapter = currentRef.endChapter || startChapter
    const startVerse = currentRef.verse
    // If no endVerse is specified and we're on a single chapter, default to startVerse (single verse)
    const endVerse = currentRef.endVerse || (startChapter === endChapter ? startVerse : undefined)

    const verses: (ProcessedVerse & { chapterNumber: number })[] = []

    for (const chapter of relevantChapters) {
      const chapterNumber = chapter.number

      // Determine verse range for this chapter
      let chapterStartVerse = 1
      let chapterEndVerse = 999

      if (chapterNumber === startChapter) {
        chapterStartVerse = startVerse
      }

      if (chapterNumber === endChapter && endVerse !== undefined) {
        chapterEndVerse = endVerse
      }

      // Filter verses in this chapter and add chapter metadata
      const chapterVerses = chapter.verses
        .filter((v) => v.number >= chapterStartVerse && v.number <= chapterEndVerse)
        .map((v) => ({
          ...v,
          chapterNumber, // Add chapter number for cross-chapter range support
        }))

      verses.push(...chapterVerses)
    }

    return verses
  }, [relevantChapters, currentRef])

  return {
    loadedContent,
    isLoading,
    error,
    currentChapter,
    displayVerses: displayVerses as ProcessedVerse[], // Type-cast to maintain compatibility
  }
}


