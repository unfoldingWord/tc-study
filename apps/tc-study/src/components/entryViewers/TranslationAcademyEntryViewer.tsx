/**
 * Translation Academy Entry Viewer
 * 
 * Lightweight viewer for displaying single TA entries in the Entry Modal.
 * Unlike the full TranslationAcademyViewer, this only shows article content without TOC.
 */

import { FileText, GraduationCap, Loader, Code2, Eye } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCatalogManager, useLoaderRegistry } from '../../contexts/CatalogContext'
import { removeFirstHeading } from '../../lib/markdown/markdownProcessor'
import { parseRcLink, parseRelativeLink } from '../../lib/markdown/rc-link-parser'
import { MarkdownRenderer } from '../ui/MarkdownRenderer'
import type { BaseEntryViewerProps } from '../../lib/viewers/EntryViewerRegistry'

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
  const [article, setArticle] = useState<TranslationAcademyArticle | null>(null)
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
          console.error('[TranslationAcademyEntryViewer] Failed to fetch metadata:', err)
        })
    } else if (propMetadata) {
      setMetadata(propMetadata)
    }
  }, [resourceKey, propMetadata, catalogManager])

  // Load article content when entryId changes
  useEffect(() => {
    if (!entryId || !resourceKey) {
      return
    }

    console.log('[TranslationAcademyEntryViewer] Loading entry:', entryId)
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
      .then((content: any) => {
        console.log('[TranslationAcademyEntryViewer] Loaded content:', content)
        
        // Get the raw content (could be markdown or HTML)
        let rawContent = content.content || content.body || ''
        
        console.log('[TranslationAcademyEntryViewer] Raw content length:', rawContent.length)
        console.log('[TranslationAcademyEntryViewer] First 200 chars:', rawContent.substring(0, 200))
        
        // Remove the first heading to avoid duplication with custom header
        // Uses same approach as bt-studio for consistency
        rawContent = removeFirstHeading(rawContent).trim()
        
        console.log('[TranslationAcademyEntryViewer] Processed content length:', rawContent.length)
        console.log('[TranslationAcademyEntryViewer] First 200 chars after processing:', rawContent.substring(0, 200))
        
        const articleData: TranslationAcademyArticle = {
          id: entryId,
          title: content.title || entryId.split('/').pop() || entryId,
          content: rawContent,
          question: content.question || undefined,
          relatedArticles: content.relatedArticles || [],
        }
        
        setArticle(articleData)
        setLoading(false)
        
        // Notify parent that content is loaded (for floating button title)
        if (onContentLoaded) {
          onContentLoaded(articleData)
        }
      })
      .catch((err) => {
        console.error('[TranslationAcademyEntryViewer] Failed to load article:', err)
        setError(err instanceof Error ? err.message : 'Failed to load entry')
        setLoading(false)
      })
  }, [resourceKey, entryId, metadata, loaderRegistry])

  // Handle clicking on related article links
  const handleRelatedArticleClick = (relatedEntryId: string) => {
    if (onEntryLinkClick) {
      onEntryLinkClick(resourceKey, relatedEntryId)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin text-purple-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading article...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 text-center">
        <FileText className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-600 font-semibold mb-2">Failed to load article</p>
        <p className="text-sm text-gray-600">{error}</p>
      </div>
    )
  }

  // No article loaded
  if (!article) {
    return (
      <div className="p-6 text-center text-gray-600">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p>No article loaded</p>
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
          <div className="flex items-start gap-3">
            <GraduationCap className="w-6 h-6 text-purple-600 mt-1 flex-shrink-0" />
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{article.title}</h1>
              {article.question && (
                <p className="text-lg text-gray-700 leading-relaxed italic">
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
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                <pre className="text-sm font-mono whitespace-pre-wrap">
                  <code>{article.content}</code>
                </pre>
              </div>
            </div>
          ) : (
            <MarkdownRenderer 
              content={article.content}
              className="prose prose-slate max-w-none mb-8"
              onInternalLinkClick={(href, linkType) => {
                console.log('[TranslationAcademyEntryViewer] Internal link clicked:', href, linkType)
                
                // Handle rc links (Door43 TA article links)
                if (linkType === 'rc' && href.startsWith('rc://')) {
                  const parsed = parseRcLink(href)
                  
                  if (parsed.isValid && onEntryLinkClick) {
                    // If it's linking to TA, navigate within current resource
                    if (parsed.resourceType === 'academy') {
                      onEntryLinkClick(resourceKey, parsed.entryId)
                    }
                    // If it's linking to TW or other resources, would need cross-resource navigation
                    else {
                      console.log('[TranslationAcademyEntryViewer] Cross-resource link not yet supported:', parsed)
                      // TODO: Implement cross-resource navigation
                    }
                  }
                }
                // Handle relative links (e.g., ../translate/figs-metaphor)
                else if (linkType === 'relative') {
                  const resolvedPath = parseRelativeLink(href, entryId)
                  console.log('[TranslationAcademyEntryViewer] Relative link resolved:', href, '->', resolvedPath)
                  
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

        {/* Related Articles */}
        {article.relatedArticles && article.relatedArticles.length > 0 && (
          <div className={`mt-8 pt-6 border-t border-gray-200 ${isRtl ? 'text-right' : ''}`}>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Related Articles</h3>
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md text-sm font-medium transition-colors"
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
