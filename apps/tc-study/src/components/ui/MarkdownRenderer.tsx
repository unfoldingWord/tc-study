/**
 * Markdown Renderer Component
 *
 * Accepts optional precomputed `hast` so title resolution can re-run hast→React
 * without re-parsing markdown.
 */

import { useEffect, useState } from 'react'
import { hastToReact } from '../../lib/markdown/hastToReact'
import {
  markdownToHast,
  type HastRoot,
} from '../../lib/markdown/markdownToHast'

const RENDER_CACHE_MAX = 80
const renderCache = new Map<string, React.ReactNode>()
const HAST_CACHE_MAX = 80
const hastCache = new Map<string, HastRoot>()

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

function getHastCached(content: string): HastRoot | undefined {
  return hastCache.get(content)
}

function setHastCached(content: string, tree: HastRoot): void {
  if (hastCache.size >= HAST_CACHE_MAX) {
    const firstKey = hastCache.keys().next().value
    if (firstKey !== undefined) hastCache.delete(firstKey)
  }
  hastCache.set(content, tree)
}

export function MarkdownSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      <div className="h-3 w-full max-w-[100%] rounded bg-muted animate-pulse" />
      <div className="h-3 w-full max-w-[95%] rounded bg-muted animate-pulse" />
      <div className="h-3 w-full max-w-[88%] rounded bg-muted animate-pulse" />
    </div>
  )
}

interface MarkdownRendererProps {
  content: string
  /** Precomputed hast JSON — when set, skip markdown parse. */
  hast?: HastRoot | null
  className?: string
  onInternalLinkClick?: (
    href: string,
    linkType: 'rc' | 'relative' | 'unknown',
    linkText?: string
  ) => void
  getEntryTitle?: (rcLink: string) => string | null
}

export function MarkdownRenderer({
  content,
  hast: hastProp,
  className = '',
  onInternalLinkClick,
  getEntryTitle,
}: MarkdownRendererProps) {
  // React cache only when titles are static (no getEntryTitle).
  const useReactCache = !getEntryTitle && !hastProp
  const cached = useReactCache && content ? getCached(content) : undefined
  const [renderedContent, setRenderedContent] = useState<React.ReactNode>(
    cached ?? null
  )
  const [isLoading, setIsLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!content && !hastProp) {
      setRenderedContent(null)
      setIsLoading(false)
      return
    }

    if (useReactCache) {
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

        let tree = hastProp ?? null
        if (!tree) {
          tree = getHastCached(content) ?? null
          if (!tree) {
            tree = await markdownToHast(content)
            setHastCached(content, tree)
          }
        }

        if (cancelled) return

        const result = hastToReact(tree, {
          linkTarget: '_blank',
          headerBaseLevel: 3,
          allowDangerousHtml: false,
          onInternalLinkClick,
          getEntryTitle,
        })

        if (cancelled) return
        if (useReactCache) setCached(content, result)
        setRenderedContent(result)
      } catch (err) {
        if (cancelled) return
        console.error('Markdown rendering error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setRenderedContent(
          <span className="text-red-500">Error rendering markdown</span>
        )
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void renderContent()
    return () => {
      cancelled = true
    }
  }, [content, hastProp, onInternalLinkClick, getEntryTitle, useReactCache])

  if (!content && !hastProp) {
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

  return <div className={className}>{renderedContent}</div>
}

export default MarkdownRenderer
