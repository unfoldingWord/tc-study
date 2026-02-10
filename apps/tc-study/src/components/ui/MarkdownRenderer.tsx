/**
 * Markdown Renderer Component
 * 
 * React component for rendering markdown content with support for internal links.
 * Uses the remark/unified ecosystem for robust markdown processing.
 * Rendered output is cached by content so switching tabs doesn't re-render.
 */

import { useEffect, useState } from 'react'
import { RemarkMarkdownRenderer } from '../../lib/markdown/remarkRenderer'

const RENDER_CACHE_MAX = 80
const renderCache = new Map<string, React.ReactNode>()

function getCached(content: string): React.ReactNode | undefined {
  return renderCache.get(content)
}

function setCached(content: string, node: React.ReactNode): void {
  if (renderCache.size >= RENDER_CACHE_MAX) {
    const firstKey = renderCache.keys().next().value
    if (firstKey !== undefined) renderCache.delete(firstKey)
  }
  renderCache.set(content, node)
}

function MarkdownSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      <div className="h-3 w-full max-w-[100%] rounded bg-gray-200 animate-pulse" />
      <div className="h-3 w-full max-w-[95%] rounded bg-gray-200 animate-pulse" />
      <div className="h-3 w-full max-w-[88%] rounded bg-gray-200 animate-pulse" />
    </div>
  )
}

interface MarkdownRendererProps {
  content: string
  className?: string
  onInternalLinkClick?: (href: string, linkType: 'rc' | 'relative' | 'unknown', linkText?: string) => void
  getEntryTitle?: (rcLink: string) => string | null
}

export function MarkdownRenderer({ 
  content, 
  className = '',
  onInternalLinkClick,
  getEntryTitle
}: MarkdownRendererProps) {
  // When getEntryTitle is used, rendered link text depends on async titles - don't use cache
  // so we re-render when titles resolve (otherwise cache keyed only by content would show entry IDs).
  const useCache = !getEntryTitle
  const cached = useCache && content ? getCached(content) : undefined
  const [renderedContent, setRenderedContent] = useState<React.ReactNode>(cached ?? null)
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!content) {
      setRenderedContent(null)
      setIsLoading(false)
      return
    }

    if (useCache) {
      const cachedResult = getCached(content)
      if (cachedResult !== undefined) {
        setRenderedContent(cachedResult)
        setIsLoading(false)
        return
      }
    }

    let cancelled = false

    const renderContent = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const renderer = new RemarkMarkdownRenderer({
          linkTarget: '_blank',
          headerBaseLevel: 3,
          allowDangerousHtml: false,
          onInternalLinkClick,
          getEntryTitle
        })

        const result = await renderer.renderToReact(content)
        if (cancelled) return
        if (useCache) setCached(content, result)
        setRenderedContent(result)
      } catch (err) {
        if (cancelled) return
        console.error('Markdown rendering error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setRenderedContent(<span className="text-red-500">Error rendering markdown</span>)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    renderContent()
    return () => { cancelled = true }
  }, [content, onInternalLinkClick, getEntryTitle])

  if (!content) {
    return null
  }

  if (isLoading) {
    return (
      <div className={className}>
        <MarkdownSkeleton className="text-base leading-relaxed" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={`text-red-600 ${className}`}>
        <p className="font-semibold">Error rendering markdown</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className={className}>
      {renderedContent}
    </div>
  )
}

export default MarkdownRenderer
