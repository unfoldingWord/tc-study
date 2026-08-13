/**
 * Translation Academy Entry Viewer
 * 
 * Lightweight viewer for displaying single TA entries in the Entry Modal.
 * Unlike the full TranslationAcademyViewer, this only shows article content without TOC.
 */

import { FileText, GraduationCap, Code2, Eye } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLoaderRegistry } from '../../contexts/CatalogContext'
import { removeFirstHeading } from '../../lib/markdown/markdownProcessor'
import { parseRcLink, parseRelativeLink, parseVerseRangeFromText } from '../../lib/markdown/rc-link-parser'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'
import type { BaseEntryViewerProps } from '../../lib/viewers/EntryViewerRegistry'
import { useNavigation } from '../../contexts/NavigationContext'
import { useEntryModalStore } from '../../features/entries'
import { LoadingSpinner } from '../../shared/LoadingSpinner'
import { entryContentLoadKey } from './entryContentLoadKey'

// Valid 3-letter Bible book codes (uppercase) — OBS handled separately
const VALID_BIBLE_BOOK_CODES = new Set([
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI',
  '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER',
  'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP',
  'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL',
  'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
  '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
])

interface TranslationAcademyArticle {
  id: string
  title: string
  content: string
  question?: string
  relatedArticles?: string[]
}

/**
 * Lightweight entry viewer for Translation Academy
 * Only displays the article content - no TOC, no back button
 */
export function TranslationAcademyEntryViewer({
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
  const { navigateToReference, setNavigationMode } = useNavigation()
  const minimizeModal = useEntryModalStore((s) => s.minimizeModal)
  const onContentLoadedRef = useRef(onContentLoaded)
  onContentLoadedRef.current = onContentLoaded
  const [article, setArticle] = useState<TranslationAcademyArticle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)

  // Load article content when resourceKey/entryId change.
  // Do not depend on metadata objects — parent often rebuilds them each render.
  useEffect(() => {
    if (!entryId || !resourceKey) {
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    // Get the Translation Academy loader
    const loader = loaderRegistry.getLoader('academy')
    if (!loader) {
      console.error('[TranslationAcademyEntryViewer] No loader found for "academy"')
      setError('No loader available for Translation Academy')
      setLoading(false)
      return
    }

    // Validate entry ID format (should be like "translate/translate-unknown")
    if (!entryId.includes('/')) {
      console.error('[TranslationAcademyEntryViewer] Invalid entry ID format:', entryId)
      setError(`Invalid entry ID format: "${entryId}". Expected format: "manual/article"`)
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
          question?: string
          relatedArticles?: unknown
        }

        // Get the raw content (could be markdown or HTML)
        let rawContent = content.content || content.body || ''

        // Remove the first heading to avoid duplication with custom header
        // Uses same approach as bt-studio for consistency
        rawContent = removeFirstHeading(rawContent).trim()

        const articleData: TranslationAcademyArticle = {
          id: entryId,
          title: content.title || entryId.split('/').pop() || entryId,
          content: rawContent,
          question: content.question || undefined,
          relatedArticles: Array.isArray(content.relatedArticles)
            ? (content.relatedArticles as string[])
            : [],
        }

        setArticle(articleData)
        setLoading(false)

        // Notify parent that content is loaded (for floating button title)
        onContentLoadedRef.current?.(articleData)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[TranslationAcademyEntryViewer] Failed to load article:', err)
        setError(err instanceof Error ? err.message : 'Failed to load entry')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [loadKey, resourceKey, entryId, loaderRegistry])

  // Handle clicking on related article links
  const handleRelatedArticleClick = (relatedEntryId: string) => {
    if (onEntryLinkClick) {
      onEntryLinkClick(resourceKey, relatedEntryId)
    }
  }

  // Loading state
  if (loading) {
    return (
      <LoadingSpinner
        centered
        label="Loading article"
        className="text-helps"
        containerClassName="h-full p-8"
      />
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 text-center">
        <FileText className="w-12 h-12 text-danger opacity-70 mx-auto mb-3" />
        <p className="text-danger font-semibold mb-2">Failed to load article</p>
        <p className="text-sm text-fg-secondary">{error}</p>
      </div>
    )
  }

  // No article loaded
  if (!article) {
    return (
      <div className="p-6 text-center text-fg-secondary">
        <FileText className="w-12 h-12 text-fg-muted mx-auto mb-3" />
        <p>No article loaded</p>
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
          <div className="flex items-start gap-3">
            <GraduationCap className="w-6 h-6 text-helps-fg mt-1 flex-shrink-0" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-fg mb-2">{article.title}</h1>
              {article.question && (
                <p className="text-lg text-fg-secondary leading-relaxed italic">
                  This page answers: {article.question}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Main Content - toggle between rendered and raw markdown */}
        {article.content ? (
          showRawMarkdown ? (
            <div className="mb-8">
              <div className="bg-elevated text-fg border border-border p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap">
                  <code>{article.content}</code>
                </pre>
              </div>
            </div>
          ) : (
            <MarkdownRenderer 
              content={article.content}
              className="prose max-w-none mb-8 text-fg prose-headings:text-fg prose-p:text-fg-secondary prose-strong:text-fg prose-a:text-accent prose-li:text-fg-secondary prose-blockquote:text-fg prose-blockquote:opacity-100 [&_blockquote]:text-fg [&_blockquote_p]:text-fg [&_blockquote_em]:text-inherit"
              onInternalLinkClick={(href, linkType, linkText) => {

                
                // Handle rc links (Door43 resource links)
                if (linkType === 'rc' && href.startsWith('rc://')) {
                  const parsed = parseRcLink(href)
                  
                  if (parsed.isValid) {
                    // TN-style links carry scripture/OBS references
                    if (parsed.resourceType === 'notes' && parsed.scriptureRef) {
                      const bookCode = parsed.scriptureRef.bookCode.toUpperCase()

                      // OBS story navigation — rc://*\/tn/help/obs/[story]/[frame]
                      if (bookCode === 'OBS') {
                        const story = parseInt(parsed.scriptureRef.chapter, 10) || 1
                        const frame = parseInt(parsed.scriptureRef.verse, 10) || 1

                        minimizeModal()
                        // Switch to frame mode so the specific frame is shown (not the whole story)
                        setNavigationMode('verse')
                        navigateToReference({ book: 'obs', chapter: story, verse: frame })
                        return
                      }

                      // Scripture navigation
                      if (VALID_BIBLE_BOOK_CODES.has(bookCode)) {
                        let chapter = parseInt(parsed.scriptureRef.chapter, 10)
                        let verse = parseInt(parsed.scriptureRef.verse, 10)
                        let endChapter: number | undefined
                        let endVerse: number | undefined
                        if (linkText) {
                          const range = parseVerseRangeFromText(linkText)
                          if (range?.chapter) {
                            chapter = parseInt(range.chapter, 10)
                            verse = parseInt(range.verseStart || '1', 10)
                            if (range.endChapter) {
                              endChapter = parseInt(range.endChapter, 10)
                              endVerse = parseInt(range.verseEnd || '1', 10)
                            } else if (range.verseEnd) {
                              endVerse = parseInt(range.verseEnd, 10)
                            }
                          }
                        }
                        if (!isNaN(chapter) && chapter >= 1 && !isNaN(verse) && verse >= 1) {

                          minimizeModal()
                          navigateToReference({
                            book: bookCode.toLowerCase(),
                            chapter,
                            verse,
                            ...(endChapter ? { endChapter } : {}),
                            ...(endVerse ? { endVerse } : {}),
                          })
                          return
                        }
                      }
                    }

                    if (onEntryLinkClick) {
                      // TA → TA: navigate within current resource
                      if (parsed.resourceType === 'academy') {
                        onEntryLinkClick(resourceKey, parsed.entryId)
                      } else {
                        // Cross-resource (TW, etc.): resolve language and navigate
                        const parts = resourceKey.split('/')
                        let targetLanguage = parsed.language
                        let owner = 'unfoldingWord'
                        if (parts.length >= 3) {
                          owner = parts[0]
                          if (targetLanguage === '*') targetLanguage = parts[1]
                        }
                        const targetResourceKey = `${owner}/${targetLanguage}/${parsed.resourceAbbrev}`

                        onEntryLinkClick(targetResourceKey, parsed.entryId)
                      }
                    }
                  }
                }
                // Handle relative links (e.g., ../translate/figs-metaphor)
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

        {/* Related Articles */}
        {article.relatedArticles && article.relatedArticles.length > 0 && (
          <div className={`mt-8 pt-6 border-t border-border ${isRtl ? 'text-right' : ''}`}>
            <h3 className="text-lg font-semibold text-fg mb-3">Related Articles</h3>
            <div className={`flex flex-wrap gap-2 ${isRtl ? 'flex-row-reverse justify-end' : ''}`}>
              {article.relatedArticles.map((relatedLink, idx) => {
                // Extract article ID from link if it's a full rc link
                const articleId = relatedLink.includes('/')
                  ? relatedLink.split('/').slice(-2).join('/')
                  : relatedLink
                const displayName = articleId.split('/').pop() || articleId
                
                return (
                  <button
                    key={idx}
                    onClick={() => handleRelatedArticleClick(articleId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-helps-soft hover:bg-muted text-helps-fg rounded-md text-sm font-medium transition-colors"
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    {displayName}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </article>
    </div>
  )
}

// Export display name for debugging
TranslationAcademyEntryViewer.displayName = 'TranslationAcademyEntryViewer'
