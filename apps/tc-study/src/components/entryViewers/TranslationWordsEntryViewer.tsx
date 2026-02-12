/**
 * Translation Words Entry Viewer
 * 
 * Lightweight viewer for displaying single TW entries in the Entry Modal.
 * Unlike the full TranslationWordsViewer, this only shows article content without TOC.
 */

import { FileText, Loader, Code2, Eye, BookOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCatalogManager, useLoaderRegistry } from '../../contexts/CatalogContext'
import { removeFirstHeading, removeFirstHeadingAndDefinition } from '../../lib/markdown/markdownProcessor'
import { parseRcLink, parseRelativeLink, parseVerseRangeFromText } from '../../lib/markdown/rc-link-parser'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'
import type { BaseEntryViewerProps } from '../../lib/viewers/EntryViewerRegistry'
import { useNavigation } from '../../contexts/NavigationContext'
import { useStudyStore } from '../../store/studyStore'

// Valid 3-letter book codes (uppercase)
const VALID_BOOK_CODES = new Set([
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI',
  '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER',
  'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP',
  'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL',
  'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
  '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'
])

interface TranslationWord {
  id: string
  term: string
  definition: string
  content?: string
}

/**
 * Lightweight entry viewer for Translation Words
 * Only displays the article content - no TOC, no back button
 */
export function TranslationWordsEntryViewer({
  resourceKey: rawResourceKey,
  entryId,
  metadata: propMetadata,
  direction = 'ltr',
  onEntryLinkClick,
  onContentLoaded,
}: BaseEntryViewerProps) {
  // Use resource key as-is (no normalization needed)
  // Background downloads and cache use 3-part format: owner/language/resourceId
  const resourceKey = rawResourceKey

  const loaderRegistry = useLoaderRegistry()
  const catalogManager = useCatalogManager()
  const { navigateToReference, getBookInfo } = useNavigation()
  const minimizeModal = useStudyStore((s: any) => s.minimizeModal)
  const setNavStatus = useStudyStore((s: any) => s.setNavigationStatus)
  const navStatus = useStudyStore((s: any) => s.modal.navigationStatus)
  
  const [word, setWord] = useState<TranslationWord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<any>(propMetadata)
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)

  // Fetch metadata from catalog if not provided
  useEffect(() => {
    if (!propMetadata && resourceKey && catalogManager) {
      catalogManager.getResourceMetadata(resourceKey)
        .then((catalogMetadata) => {
          if (catalogMetadata) {
            setMetadata(catalogMetadata)
          }
        })
        .catch((err) => {
          console.error('[TranslationWordsEntryViewer] Failed to fetch metadata:', err)
        })
    } else if (propMetadata) {
      setMetadata(propMetadata)
    }
  }, [resourceKey, propMetadata, catalogManager])

  // Load word content when entryId changes
  useEffect(() => {
    if (!entryId || !resourceKey) {
      return
    }

    console.log('[TranslationWordsEntryViewer] Loading entry:', entryId)
    setLoading(true)
    setError(null)

    // Get the Translation Words loader
    const loader = loaderRegistry.getLoader('words')
    if (!loader) {
      console.error('[TranslationWordsEntryViewer] No loader found for "words"')
      setError('No loader available for Translation Words')
      setLoading(false)
      return
    }

    // Validate entry ID format
    if (!entryId.includes('/')) {
      console.error('[TranslationWordsEntryViewer] Invalid entry ID format:', entryId)
      setError(`Invalid entry ID format: "${entryId}". Expected format: "bible/category/term"`)
      setLoading(false)
      return
    }

    // Load the entry content
    loader.loadContent(resourceKey, entryId)
      .then((content: any) => {
        console.log('[TranslationWordsEntryViewer] Loaded content:', content)
        
        // Get the raw content (could be markdown or HTML)
        let rawContent = content.content || content.body || ''
        
        console.log('[TranslationWordsEntryViewer] Raw content length:', rawContent.length)
        console.log('[TranslationWordsEntryViewer] First 200 chars:', rawContent.substring(0, 200))
        
        // Remove the first heading AND definition section to avoid duplication
        // TW entries typically have: # Title \n## Definition \n[definition text]\n## More sections...
        // We show the title in the custom header, so strip both title and definition
        let processedContent = removeFirstHeadingAndDefinition(rawContent).trim()
        
        // If the removal didn't work well, fallback to just removing first heading
        if (processedContent.length === 0 || processedContent.length > rawContent.length * 0.98) {
          processedContent = removeFirstHeading(rawContent).trim()
        }
        
        rawContent = processedContent
        
        console.log('[TranslationWordsEntryViewer] Processed content length:', rawContent.length)
        console.log('[TranslationWordsEntryViewer] First 200 chars after processing:', rawContent.substring(0, 200))
        
        const wordData: TranslationWord = {
          id: entryId,
          term: content.term || content.title || entryId.split('/').pop() || entryId,
          definition: content.definition || '',
          content: rawContent,
        }
        
        setWord(wordData)
        setLoading(false)
        
        // Notify parent that content is loaded (for floating button title)
        if (onContentLoaded) {
          onContentLoaded(wordData)
        }
      })
      .catch((err) => {
        console.error('[TranslationWordsEntryViewer] Failed to load word:', err)
        setError(err instanceof Error ? err.message : 'Failed to load entry')
        setLoading(false)
      })
  }, [resourceKey, entryId, metadata, loaderRegistry])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading entry...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 text-center">
        <FileText className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-600 font-semibold mb-2">Failed to load entry</p>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    )
  }

  // No word loaded
  if (!word) {
    return (
      <div className="p-6 text-center text-gray-600">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p>No entry loaded</p>
      </div>
    )
  }

  // Render article content
  const isRtl = direction === 'rtl'
  return (
    <div className="h-full relative" dir={direction}>
      {/* Debug toggle button for raw markdown (dev tool - only in development) */}
      {import.meta.env.DEV && (
        <button
          onClick={() => setShowRawMarkdown(!showRawMarkdown)}
          className={`absolute top-4 z-10 flex items-center justify-center p-1.5 bg-gray-500/30 hover:bg-gray-600/50 text-gray-600 hover:text-gray-800 rounded transition-all opacity-50 hover:opacity-100 ${isRtl ? 'left-4' : 'right-4'}`}
          title={showRawMarkdown ? "Show rendered view" : "Show raw markdown"}
          dir="ltr"
        >
          {showRawMarkdown ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <Code2 className="w-3.5 h-3.5" />
          )}
        </button>
      )}

      <article className={`max-w-4xl mx-auto p-6 ${isRtl ? 'text-right' : 'text-left'}`}>
        {/* Custom styled header */}
        <header className="mb-6 pb-4 border-b border-gray-200">
          <h1 className="text-3xl font-bold text-gray-900">{word.term}</h1>
        </header>

        {/* Main Content - toggle between rendered and raw markdown */}
        {word.content ? (
          showRawMarkdown ? (
            <div className="mb-8">
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap">
                  <code>{word.content}</code>
                </pre>
              </div>
            </div>
          ) : (
            <MarkdownRenderer 
              content={word.content}
              className="prose prose-slate max-w-none mb-8"
              onInternalLinkClick={(href, linkType, linkText) => {
                console.log('[TranslationWordsEntryViewer] Internal link clicked:', href, linkType, linkText)
                
                // Handle rc links (Door43 resource links)
                if (linkType === 'rc' && href.startsWith('rc://')) {
                  const parsed = parseRcLink(href)
                  
                  if (parsed.isValid) {
                    // Special handling for Translation Notes - these are scripture references!
                    if (parsed.resourceType === 'notes' && parsed.scriptureRef) {
                      console.log('[TranslationWordsEntryViewer] Scripture navigation link:', parsed.scriptureRef, 'linkText:', linkText)
                      
                      // Book code comes from the URL (reliable)
                      const bookCode = parsed.scriptureRef.bookCode.toUpperCase()
                      
                      // Validate book code
                      if (!VALID_BOOK_CODES.has(bookCode)) {
                        console.warn('[TranslationWordsEntryViewer] Invalid book code:', bookCode)
                        setNavStatus('error')
                        setTimeout(() => setNavStatus('idle'), 2000)
                        return
                      }
                      
                      // Chapter and verse should be parsed from link text (in brackets)
                      // Fallback to URL if parsing fails
                      let chapter = parseInt(parsed.scriptureRef.chapter, 10)
                      let verseStart = parseInt(parsed.scriptureRef.verse, 10)
                      let endChapter: number | undefined = undefined
                      let endVerse: number | undefined = undefined
                      
                      if (linkText) {
                        const verseRange = parseVerseRangeFromText(linkText)
                        if (verseRange && verseRange.chapter) {
                          // Link text has chapter:verse info - use it!
                          chapter = parseInt(verseRange.chapter, 10)
                          verseStart = parseInt(verseRange.verseStart || '1', 10)
                          
                          // Handle cross-chapter ranges (e.g., "5:3-6:4")
                          if (verseRange.endChapter) {
                            endChapter = parseInt(verseRange.endChapter, 10)
                            endVerse = parseInt(verseRange.verseEnd || '1', 10)
                          }
                          // Handle same-chapter ranges (e.g., "3:9-11")
                          else if (verseRange.verseEnd) {
                            endVerse = parseInt(verseRange.verseEnd, 10)
                          }
                          
                          console.log('[TranslationWordsEntryViewer] Parsed from link text:', { 
                            chapter, 
                            verseStart, 
                            endChapter, 
                            endVerse 
                          })
                        }
                      }
                      
                      // Always minimize the modal when user clicks a scripture link
                      // Even if the book isn't available in current panel, it might work in another panel
                      minimizeModal()
                      
                      // Basic validation
                      if (isNaN(chapter) || chapter < 1 || isNaN(verseStart) || verseStart < 1) {
                        console.warn('[TranslationWordsEntryViewer] Invalid chapter/verse:', { chapter, verseStart })
                        setNavStatus('warning')
                        setTimeout(() => setNavStatus('idle'), 2000)
                        // Don't return - still try to navigate
                      }
                      
                      // Check if the book is available for navigation in current context
                      const normalizedBookCode = bookCode.toLowerCase()
                      const bookInfo = getBookInfo(normalizedBookCode)
                      let validationPassed = true
                      
                      if (!bookInfo) {
                        console.warn('[TranslationWordsEntryViewer] Book not available in current context (may work in other panels):', normalizedBookCode)
                        setNavStatus('warning')
                        setTimeout(() => setNavStatus('idle'), 2000)
                        validationPassed = false
                      } else {
                        // Validate chapter is within book bounds
                        if (chapter > bookInfo.chapters) {
                          console.warn('[TranslationWordsEntryViewer] Chapter out of bounds in current context:', { 
                            chapter, 
                            maxChapters: bookInfo.chapters 
                          })
                          setNavStatus('warning')
                          setTimeout(() => setNavStatus('idle'), 2000)
                          validationPassed = false
                        }
                        
                        // Validate verse is within chapter bounds (if verse count is available)
                        if (bookInfo.verses && bookInfo.verses.length > 0) {
                          const maxVerse = bookInfo.verses[chapter - 1]
                          if (maxVerse && verseStart > maxVerse) {
                            console.warn('[TranslationWordsEntryViewer] Verse out of bounds in current context:', { 
                              verse: verseStart, 
                              maxVerse 
                            })
                            setNavStatus('warning')
                            setTimeout(() => setNavStatus('idle'), 2000)
                            validationPassed = false
                          }
                        }
                      }
                      
                      // Show navigating state if validation passed
                      if (validationPassed) {
                        setNavStatus('navigating')
                      }
                      
                      // ALWAYS navigate - even if validation failed
                      // Another panel might support this reference
                      navigateToReference({
                        book: normalizedBookCode,
                        chapter: chapter,
                        verse: verseStart,
                        ...(endChapter ? { endChapter } : {}),
                        ...(endVerse ? { endVerse } : {})
                      })
                      
                      console.log('[TranslationWordsEntryViewer] Navigated to scripture reference:', {
                        book: normalizedBookCode,
                        chapter: chapter,
                        verse: verseStart,
                        ...(endChapter ? { endChapter } : {}),
                        ...(endVerse ? { endVerse } : {}),
                        validationPassed
                      })
                      
                      // Show success if validation passed
                      if (validationPassed) {
                        setTimeout(() => {
                          setNavStatus('success')
                          setTimeout(() => setNavStatus('idle'), 1500)
                        }, 100)
                      }
                      
                      // Optionally also open the TN entry if handler is provided
                      // (Uncomment if you want both navigation and entry opening)
                      // if (onEntryLinkClick) {
                      //   const parts = resourceKey.split('/')
                      //   const owner = parts[0] || 'unfoldingWord'
                      //   const langResource = parts[1] || ''
                      //   const lastUnderscoreIndex = langResource.lastIndexOf('_')
                      //   const targetLanguage = parsed.language === '*' && lastUnderscoreIndex > 0
                      //     ? langResource.substring(0, lastUnderscoreIndex)
                      //     : parsed.language
                      //   const targetResourceKey = `${owner}/${targetLanguage}_tn`
                      //   onEntryLinkClick(targetResourceKey, parsed.entryId)
                      // }
                    }
                    // If it's linking to TW, navigate within current resource
                    else if (parsed.resourceType === 'words' && onEntryLinkClick) {
                      onEntryLinkClick(resourceKey, parsed.entryId)
                    }
                    // Cross-resource navigation (TA, etc.)
                    else if (onEntryLinkClick) {
                      console.log('[TranslationWordsEntryViewer] Cross-resource link:', parsed)
                      console.log('[TranslationWordsEntryViewer] Current resourceKey:', resourceKey)
                      
                      // Extract language from current resource key
                      // Format: owner/language/resourceId (3-part format)
                      const parts = resourceKey.split('/')
                      let targetLanguage = parsed.language
                      let owner = 'unfoldingWord' // Default owner
                      
                      if (parts.length >= 3) {
                        // 3-part format: owner/language/resourceId
                        owner = parts[0]
                        const language = parts[1]
                        
                        if (targetLanguage === '*') {
                          // Use same language as current resource
                          targetLanguage = language
                        }
                      } else if (parts.length === 2) {
                        // Legacy 2-part format: owner/language_resourceId
                        owner = parts[0]
                        const langResource = parts[1]
                        
                        const lastUnderscoreIndex = langResource.lastIndexOf('_')
                        if (lastUnderscoreIndex > 0 && targetLanguage === '*') {
                          targetLanguage = langResource.substring(0, lastUnderscoreIndex)
                        }
                      }
                      
                      // Construct target resource key (3-part format)
                      const targetResourceKey = `${owner}/${targetLanguage}/${parsed.resourceAbbrev}`
                      console.log('[TranslationWordsEntryViewer] Navigating to:', targetResourceKey, parsed.entryId)
                      
                      // Navigate to the target resource
                      onEntryLinkClick(targetResourceKey, parsed.entryId)
                    }
                  }
                }
                // Handle relative links (e.g., ../kt/grace)
                else if (linkType === 'relative') {
                  const resolvedPath = parseRelativeLink(href, entryId)
                  console.log('[TranslationWordsEntryViewer] Relative link resolved:', href, '->', resolvedPath)
                  
                  if (onEntryLinkClick) {
                    onEntryLinkClick(resourceKey, resolvedPath)
                  }
                }
              }}
            />
          )
        ) : (
          <p className="text-gray-500">No content available</p>
        )}
      </article>
    </div>
  )
}

// Export display name for debugging
TranslationWordsEntryViewer.displayName = 'TranslationWordsEntryViewer'
