/**
 * Translation Words Entry Viewer
 *
 * Lightweight viewer for displaying single TW entries in the Entry Modal.
 * Unlike the full TranslationWordsViewer, this only shows article content without TOC.
 */

import { FileText, Code2, Eye } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLoaderRegistry } from '../../contexts/CatalogContext'
import { removeFirstHeading, removeFirstHeadingAndDefinition } from '../../lib/markdown/markdownProcessor'
import { parseRcLink, parseRelativeLink, parseVerseRangeFromText } from '../../lib/markdown/rc-link-parser'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'
import type { BaseEntryViewerProps } from '../../lib/viewers/EntryViewerRegistry'
import { useNavigation } from '../../contexts/NavigationContext'
import { useEntryModalStore } from '../../features/entries'
import { LoadingSpinner } from '../../shared/LoadingSpinner'
import { entryContentLoadKey } from './entryContentLoadKey'

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
  direction = 'ltr',
  onEntryLinkClick,
  onContentLoaded,
}: BaseEntryViewerProps) {
  // Use resource key as-is (no normalization needed)
  // Background downloads and cache use 3-part format: owner/language/resourceId
  const resourceKey = rawResourceKey
  const loadKey = entryContentLoadKey(resourceKey, entryId)

  const loaderRegistry = useLoaderRegistry()
  const { navigateToReference, getBookInfo, setNavigationMode } = useNavigation()
  const minimizeModal = useEntryModalStore((s) => s.minimizeModal)
  const setNavStatus = useEntryModalStore((s) => s.setNavigationStatus)
  const onContentLoadedRef = useRef(onContentLoaded)
  onContentLoadedRef.current = onContentLoaded

  const [word, setWord] = useState<TranslationWord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)

  // Load word content when resourceKey/entryId change.
  // Do not depend on metadata objects — parent often rebuilds them each render.
  useEffect(() => {
    if (!entryId || !resourceKey) {
      return
    }

    let cancelled = false
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
      .then((raw) => {
        if (cancelled) return

        const content = raw as {
          content?: string
          body?: string
          title?: string
          term?: string
          definition?: string
        }

        // Get the raw content (could be markdown or HTML)
        let rawContent = content.content || content.body || ''

        // Remove the first heading AND definition section to avoid duplication
        // TW entries typically have: # Title \n## Definition \n[definition text]\n## More sections...
        // We show the title in the custom header, so strip both title and definition
        let processedContent = removeFirstHeadingAndDefinition(rawContent).trim()

        // If the removal didn't work well, fallback to just removing first heading
        if (processedContent.length === 0 || processedContent.length > rawContent.length * 0.98) {
          processedContent = removeFirstHeading(rawContent).trim()
        }

        rawContent = processedContent

        const wordData: TranslationWord = {
          id: entryId,
          term: content.term || content.title || entryId.split('/').pop() || entryId,
          definition: content.definition || '',
          content: rawContent,
        }

        setWord(wordData)
        setLoading(false)

        // Notify parent that content is loaded (for floating button title)
        onContentLoadedRef.current?.(wordData)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[TranslationWordsEntryViewer] Failed to load word:', err)
        setError(err instanceof Error ? err.message : 'Failed to load entry')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadKey, resourceKey, entryId, loaderRegistry])

  // Loading state
  if (loading) {
    return (
      <LoadingSpinner
        centered
        label="Loading entry"
        className="text-accent"
        containerClassName="h-full p-8"
      />
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 text-center">
        <FileText className="w-12 h-12 text-danger opacity-70 mx-auto mb-3" />
        <p className="text-danger font-semibold mb-2">Failed to load entry</p>
        <p className="text-sm text-fg-secondary">{error}</p>
      </div>
    )
  }

  // No word loaded
  if (!word) {
    return (
      <div className="p-6 text-center text-fg-secondary">
        <FileText className="w-12 h-12 text-fg-muted mx-auto mb-3" />
        <p>No entry loaded</p>
      </div>
    )
  }

  // Render article content
  const isRtl = direction === 'rtl'
  return (
    <div className="h-full relative bg-surface text-fg" dir={direction}>
      {/* Debug toggle button for raw markdown (dev tool - only in development) */}
      {import.meta.env.DEV && (
        <button
          onClick={() => setShowRawMarkdown(!showRawMarkdown)}
          className={`absolute top-4 z-10 flex items-center justify-center p-1.5 bg-muted/80 hover:bg-muted text-fg-secondary hover:text-fg rounded transition-all opacity-50 hover:opacity-100 ${isRtl ? 'left-4' : 'right-4'}`}
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
        <header className="mb-6 pb-4 border-b border-border">
          <h1 className="text-3xl font-bold text-fg">{word.term}</h1>
        </header>

        {/* Main Content - toggle between rendered and raw markdown */}
        {word.content ? (
          showRawMarkdown ? (
            <div className="mb-8">
              <div className="bg-elevated text-fg border border-border p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap">
                  <code>{word.content}</code>
                </pre>
              </div>
            </div>
          ) : (
            <MarkdownRenderer
              content={word.content}
              className="prose max-w-none mb-8 text-fg prose-headings:text-fg prose-p:text-fg-secondary prose-strong:text-fg prose-a:text-accent prose-li:text-fg-secondary prose-blockquote:text-fg prose-blockquote:opacity-100 [&_blockquote]:text-fg [&_blockquote_p]:text-fg [&_blockquote_em]:text-inherit"
              onInternalLinkClick={(href, linkType, linkText) => {

                // Handle rc links (Door43 resource links)
                if (linkType === 'rc' && href.startsWith('rc://')) {
                  const parsed = parseRcLink(href)

                  if (parsed.isValid) {
                    // Special handling for Translation Notes - these are scripture references!
                    if (parsed.resourceType === 'notes' && parsed.scriptureRef) {

                      // Book code comes from the URL (reliable)
                      const bookCode = parsed.scriptureRef.bookCode.toUpperCase()

                      // OBS story navigation — rc://*\/tn/help/obs/[story]/[frame]
                      if (bookCode === 'OBS') {
                        const story = parseInt(parsed.scriptureRef.chapter, 10) || 1
                        const frame = parseInt(parsed.scriptureRef.verse, 10) || 1
                        minimizeModal()
                        // Switch to frame mode so the specific frame is shown (not the whole story)
                        setNavigationMode('verse')
                        navigateToReference({ book: 'obs', chapter: story, verse: frame })
                        setNavStatus('navigating')
                        setTimeout(() => {
                          setNavStatus('success')
                          setTimeout(() => setNavStatus('idle'), 1500)
                        }, 100)
                        return
                      }

                      // Validate book code (Bible books only past this point)
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
                        if (chapter > (bookInfo.chapters ?? Infinity)) {
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

                      // Navigate to the target resource
                      onEntryLinkClick(targetResourceKey, parsed.entryId)
                    }
                  }
                }
                // Handle relative links (e.g., ../kt/grace)
                else if (linkType === 'relative') {
                  const resolvedPath = parseRelativeLink(href, entryId)

                  if (onEntryLinkClick) {
                    onEntryLinkClick(resourceKey, resolvedPath)
                  }
                }
              }}
            />
          )
        ) : (
          <p className="text-fg-muted">No content available</p>
        )}
      </article>
    </div>
  )
}

// Export display name for debugging
TranslationWordsEntryViewer.displayName = 'TranslationWordsEntryViewer'
