/**
 * Markdown Renderer Component
 * 
 * React component for rendering markdown content with support for internal links.
 * Uses the remark/unified ecosystem for robust markdown processing.
 */

import { useEffect, useState } from 'react'
import { Loader } from 'lucide-react'
import { RemarkMarkdownRenderer } from '../../lib/markdown/remarkRenderer'

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
  const [renderedContent, setRenderedContent] = useState<React.ReactNode>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!content) {
      setRenderedContent(null)
      setIsLoading(false)
      return
    }

    const renderContent = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Create renderer with current options
        const renderer = new RemarkMarkdownRenderer({
          linkTarget: '_blank',
          headerBaseLevel: 3,
          allowDangerousHtml: false,
          onInternalLinkClick,
          getEntryTitle
        })

        // Render markdown to React
        const result = await renderer.renderToReact(content)
        setRenderedContent(result)
      } catch (err) {
        console.error('Markdown rendering error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setRenderedContent(<span className="text-red-500">Error rendering markdown</span>)
      } finally {
        setIsLoading(false)
      }
    }

    renderContent()
  }, [content, onInternalLinkClick, getEntryTitle])

  if (!content) {
    return null
  }

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-gray-500 ${className}`}>
        <Loader className="w-4 h-4 animate-spin" />
        <span className="text-sm">Rendering...</span>
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
