/**
 * Remark Markdown Renderer
 * 
 * Converts markdown content to React components using the unified/remark ecosystem.
 * Similar to bt-studio's approach but adapted for tc-study architecture.
 */

import { BookOpen, GraduationCap, Hash } from 'lucide-react'
import React, { Fragment } from 'react'
import * as prod from 'react/jsx-runtime'
import rehypeReact from 'rehype-react'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import type { Processor } from 'unified'
import { unified } from 'unified'
import { getRcLinkDisplayName, isRelativeLink, parseRcLink } from './rc-link-parser'

export interface MarkdownRendererOptions {
  allowDangerousHtml?: boolean
  linkTarget?: '_blank' | '_self'
  headerBaseLevel?: number
  customComponents?: Record<string, React.ComponentType<any>>
  
  // Handler for internal links (rc links, relative paths, etc.)
  // linkText is the text content of the link (useful for parsing verse ranges)
  onInternalLinkClick?: (href: string, linkType: 'rc' | 'relative' | 'unknown', linkText?: string) => void
  
  // Resolver for getting display titles for rc:// links (TW/TA entries)
  // Returns null if no title is available (will use link text or fallback)
  getEntryTitle?: (rcLink: string) => string | null
}

export class RemarkMarkdownRenderer {
  private processor: Processor | null = null
  private options: MarkdownRendererOptions

  constructor(options: MarkdownRendererOptions = {}) {
    this.options = {
      linkTarget: '_blank',
      headerBaseLevel: 3,
      allowDangerousHtml: false,
      ...options
    }
    this.initializeProcessor()
  }

  /**
   * Initialize the remark processor with plugins
   */
  private initializeProcessor() {
    if (this.processor) return this.processor

    this.processor = unified()
      .use(remarkParse) // Parse markdown to AST
      .use(remarkGfm) // Add GitHub Flavored Markdown support (tables, strikethrough, etc.)
      .use(remarkRehype, { 
        allowDangerousHtml: this.options.allowDangerousHtml || false 
      }) // Convert markdown AST to HTML AST
      .use(rehypeReact, {
        Fragment,
        jsx: prod.jsx,
        jsxs: prod.jsxs,
        components: {
          // Standard component mappings with Tailwind classes
          a: (props: any) => {
            const href = props.href || ''
            
            // Extract link text for passing to handler (useful for parsing verse ranges)
            const getLinkText = (): string => {
              const children = props.children
              if (typeof children === 'string') return children
              if (Array.isArray(children)) {
                return children.map(c => typeof c === 'string' ? c : '').join('')
              }
              return ''
            }
            const linkText = getLinkText()
            
            // Handle rc:// links (Door43 resource links)
            if (href.startsWith('rc://')) {
              const parsed = parseRcLink(href)
              
              if (!parsed.isValid) {
                // Invalid rc:// link - render as disabled link
                return (
                  <span className="text-gray-500 cursor-not-allowed" title={`Invalid rc:// link: ${href}`}>
                    {props.children}
                  </span>
                )
              }

              // Get icon based on resource type
              const Icon = parsed.resourceType === 'academy' 
                ? GraduationCap 
                : parsed.resourceType === 'words'
                ? Hash
                : BookOpen

              // Determine color scheme based on resource type
              const colorClass = parsed.resourceType === 'academy'
                ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-50'
                : parsed.resourceType === 'words'
                ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                : 'text-green-600 hover:text-green-800 hover:bg-green-50'

              // Try to get entry title from resolver
              let displayText = linkText
              if (this.options.getEntryTitle) {
                const title = this.options.getEntryTitle(href)
                if (title) {
                  displayText = title
                } else if (linkText === href || linkText.startsWith('rc://')) {
                  // If no title and linkText is the raw link, use fallback from parsed data
                  displayText = getRcLinkDisplayName(parsed)
                }
              } else if (linkText === href || linkText.startsWith('rc://')) {
                // No resolver but linkText is raw link - use fallback
                displayText = getRcLinkDisplayName(parsed)
              }

              return (
                <button
                  onClick={() => this.options.onInternalLinkClick?.(href, 'rc', linkText)}
                  className={`inline-flex items-center gap-1 ${colorClass} rounded px-1 py-0.5 transition-colors cursor-pointer font-medium`}
                  title={`${parsed.resourceAbbrev.toUpperCase()}: ${parsed.entryId}`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{displayText}</span>
                </button>
              )
            }
            
            // Handle relative links (../, ./)
            if (isRelativeLink(href)) {
              return (
                <button
                  onClick={() => this.options.onInternalLinkClick?.(href, 'relative', linkText)}
                  className="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded px-1 py-0.5 transition-colors cursor-pointer"
                  title={`Relative link: ${href}`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{props.children}</span>
                </button>
              )
            }
            
            // External link
            return (
              <a 
                {...props} 
                target={this.options.linkTarget || '_blank'}
                rel={this.options.linkTarget === '_blank' ? 'noopener noreferrer' : undefined}
                className="text-blue-600 hover:text-blue-800 underline"
              />
            )
          },
          h1: (props: any) => <h1 {...props} className="text-2xl font-bold mb-4 mt-6 first:mt-0" />,
          h2: (props: any) => <h2 {...props} className="text-xl font-semibold mb-3 mt-5" />,
          h3: (props: any) => <h3 {...props} className="text-lg font-semibold mb-2 mt-4" />,
          h4: (props: any) => <h4 {...props} className="text-base font-semibold mb-2 mt-3" />,
          h5: (props: any) => <h5 {...props} className="text-sm font-semibold mb-1 mt-2" />,
          h6: (props: any) => <h6 {...props} className="text-xs font-semibold mb-1 mt-2" />,
          p: (props: any) => <p {...props} className="mb-4 last:mb-0 leading-relaxed" />,
          ul: (props: any) => <ul {...props} className="mb-4 ml-6 list-disc space-y-1" />,
          ol: (props: any) => <ol {...props} className="mb-4 ml-6 list-decimal space-y-1" />,
          li: (props: any) => <li {...props} className="leading-relaxed" />,
          code: (props: any) => {
            // Inline code (no className means inline)
            if (!props.className) {
              return (
                <code {...props} className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800 dark:text-gray-200" />
              )
            }
            // Code block (has className from language)
            return <code {...props} />
          },
          pre: (props: any) => (
            <pre {...props} className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto mb-4 text-sm" />
          ),
          blockquote: (props: any) => (
            <blockquote {...props} className="border-l-4 border-blue-300 pl-4 italic mb-4 text-gray-700 dark:text-gray-300" />
          ),
          strong: (props: any) => <strong {...props} className="font-semibold" />,
          em: (props: any) => <em {...props} className="italic" />,
          hr: (props: any) => <hr {...props} className="my-6 border-t border-gray-300" />,
          
          // Table components (GitHub Flavored Markdown)
          table: (props: any) => (
            <div className="overflow-x-auto mb-4">
              <table {...props} className="min-w-full border-collapse border border-gray-300 dark:border-gray-700" />
            </div>
          ),
          thead: (props: any) => <thead {...props} className="bg-gray-50 dark:bg-gray-800" />,
          tbody: (props: any) => <tbody {...props} />,
          tr: (props: any) => <tr {...props} className="border-b border-gray-200 dark:border-gray-700" />,
          th: (props: any) => (
            <th {...props} className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left font-semibold" />
          ),
          td: (props: any) => (
            <td {...props} className="border border-gray-300 dark:border-gray-700 px-4 py-2" />
          ),
          
          // User custom components (override everything else)
          ...this.options.customComponents
        }
      }) // Convert HTML AST to React components

    return this.processor
  }

  /**
   * Update the renderer options
   */
  updateOptions(newOptions: Partial<MarkdownRendererOptions>) {
    this.options = { ...this.options, ...newOptions }
    this.processor = null // Force re-initialization
    this.initializeProcessor()
  }

  /**
   * Parse markdown content and return React components
   */
  async renderToReact(content: string): Promise<React.ReactNode> {
    if (!content) return null

    // Preprocess content
    const preprocessedContent = this.preprocessContent(content)

    const processor = this.initializeProcessor()
    const file = await processor!.process(preprocessedContent)
    
    return file.result as React.ReactNode
  }

  /**
   * Preprocess content to handle escaped characters and special patterns
   */
  private preprocessContent(content: string): string {
    let processed = content
      // Handle escaped characters
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\r/g, '\r')
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')

    // Handle standalone rc links (Door43 format)
    // Convert double-bracket rc links to markdown format
    processed = processed.replace(
      /\[\[rc:\/\/([^\]]+)\]\]/g,
      '[rc://$1](rc://$1)'
    )

    // Handle standalone relative links
    // Convert [[../path]] to [../path](../path)
    processed = processed.replace(
      /\[\[(\.\.[^\]]+)\]\]/g,
      '[$1]($1)'
    )

    return processed
  }

  /**
   * Render markdown synchronously (for simple use cases)
   * Returns a Promise for API consistency
   */
  render(content: string): Promise<React.ReactNode> {
    return this.renderToReact(content)
  }
}

// Export a singleton instance for convenience
export const remarkRenderer = new RemarkMarkdownRenderer({
  linkTarget: '_blank',
  headerBaseLevel: 3,
  allowDangerousHtml: false
})

export default RemarkMarkdownRenderer
