/**
 * hast → React with rc/relative link handlers and optional getEntryTitle injection.
 */

import { BookOpen, GraduationCap, Hash } from 'lucide-react'
import React, { Fragment } from 'react'
import * as prod from 'react/jsx-runtime'
import rehypeReact from 'rehype-react'
import { unified } from 'unified'
import type { HastRoot } from './markdownToHast'
import { getRcLinkDisplayName, isRelativeLink, parseRcLink } from './rc-link-parser'

type MdElementProps = React.HTMLAttributes<HTMLElement> & {
  href?: string
  className?: string
  children?: React.ReactNode
}

export interface HastToReactOptions {
  allowDangerousHtml?: boolean
  linkTarget?: '_blank' | '_self'
  headerBaseLevel?: number
  customComponents?: Record<string, React.ComponentType<MdElementProps>>
  onInternalLinkClick?: (
    href: string,
    linkType: 'rc' | 'relative' | 'unknown',
    linkText?: string
  ) => void
  getEntryTitle?: (rcLink: string) => string | null
}

function buildComponents(options: HastToReactOptions) {
  const linkTarget = options.linkTarget || '_blank'
  return {
    a: (props: MdElementProps) => {
      const href = props.href || ''

      const getLinkText = (): string => {
        const children = props.children
        if (typeof children === 'string') return children
        if (Array.isArray(children)) {
          return children.map((c) => (typeof c === 'string' ? c : '')).join('')
        }
        return ''
      }
      const linkText = getLinkText()

      if (href.startsWith('rc://')) {
        const parsed = parseRcLink(href)

        if (!parsed.isValid) {
          return (
            <span
              className="text-fg-muted cursor-not-allowed"
              title={`Invalid rc:// link: ${href}`}
            >
              {props.children}
            </span>
          )
        }

        const Icon =
          parsed.resourceType === 'academy'
            ? GraduationCap
            : parsed.resourceType === 'words'
              ? Hash
              : BookOpen

        let displayText = linkText
        if (options.getEntryTitle) {
          const title = options.getEntryTitle(href)
          if (title) {
            displayText = title
          } else if (linkText === href || linkText.startsWith('rc://')) {
            displayText = getRcLinkDisplayName(parsed)
          }
        } else if (linkText === href || linkText.startsWith('rc://')) {
          displayText = getRcLinkDisplayName(parsed)
        }

        const linkTitle = `${parsed.resourceAbbrev.toUpperCase()}: ${parsed.entryId}`
        return (
          <button
            type="button"
            onClick={() => options.onInternalLinkClick?.(href, 'rc', linkText)}
            className="inline-flex items-center gap-1 text-accent hover:text-accent-hover hover:bg-muted rounded px-1 py-0.5 transition-colors cursor-pointer font-medium"
            title={linkTitle}
            aria-label={linkTitle}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{displayText}</span>
          </button>
        )
      }

      if (isRelativeLink(href)) {
        const relativeTitle = `Relative link: ${href}`
        return (
          <button
            type="button"
            onClick={() => options.onInternalLinkClick?.(href, 'relative', linkText)}
            className="inline-flex items-center gap-1 text-fg-secondary hover:text-fg hover:bg-muted rounded px-1 py-0.5 transition-colors cursor-pointer"
            title={relativeTitle}
            aria-label={relativeTitle}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{props.children}</span>
          </button>
        )
      }

      return (
        <a
          {...props}
          target={linkTarget}
          rel={linkTarget === '_blank' ? 'noopener noreferrer' : undefined}
          className="text-accent hover:text-accent-hover underline"
        />
      )
    },
    h1: (props: MdElementProps) => (
      <h1 {...props} className="text-2xl font-bold mb-4 mt-6 first:mt-0" />
    ),
    h2: (props: MdElementProps) => (
      <h2 {...props} className="text-xl font-semibold mb-3 mt-5" />
    ),
    h3: (props: MdElementProps) => (
      <h3 {...props} className="text-lg font-semibold mb-2 mt-4" />
    ),
    h4: (props: MdElementProps) => (
      <h4 {...props} className="text-base font-semibold mb-2 mt-3" />
    ),
    h5: (props: MdElementProps) => (
      <h5 {...props} className="text-sm font-semibold mb-1 mt-2" />
    ),
    h6: (props: MdElementProps) => (
      <h6 {...props} className="text-xs font-semibold mb-1 mt-2" />
    ),
    p: (props: MdElementProps) => (
      <p {...props} className="mb-4 last:mb-0 leading-relaxed" />
    ),
    ul: (props: MdElementProps) => (
      <ul {...props} className="mb-4 ml-6 list-disc space-y-1" />
    ),
    ol: (props: MdElementProps) => (
      <ol {...props} className="mb-4 ml-6 list-decimal space-y-1" />
    ),
    li: (props: MdElementProps) => <li {...props} className="leading-relaxed" />,
    code: (props: MdElementProps) => {
      if (!props.className) {
        return (
          <code
            {...props}
            className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800 dark:text-gray-200"
          />
        )
      }
      return <code {...props} />
    },
    pre: (props: MdElementProps) => (
      <pre
        {...props}
        className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto mb-4 text-sm"
      />
    ),
    blockquote: (props: MdElementProps) => (
      <blockquote
        {...props}
        className="border-l-4 border-accent pl-4 italic mb-4 text-fg [&_p]:text-fg [&_em]:text-inherit [&_strong]:text-inherit [&_blockquote]:text-fg [&_blockquote_p]:text-fg"
      />
    ),
    strong: (props: MdElementProps) => <strong {...props} className="font-semibold" />,
    em: (props: MdElementProps) => <em {...props} className="italic" />,
    hr: (props: MdElementProps) => (
      <hr {...props} className="my-6 border-t border-gray-300" />
    ),
    table: (props: MdElementProps) => (
      <div className="overflow-x-auto mb-4">
        <table
          {...props}
          className="min-w-full border-collapse border border-gray-300 dark:border-gray-700"
        />
      </div>
    ),
    thead: (props: MdElementProps) => (
      <thead {...props} className="bg-gray-50 dark:bg-gray-800" />
    ),
    tbody: (props: MdElementProps) => <tbody {...props} />,
    tr: (props: MdElementProps) => (
      <tr {...props} className="border-b border-gray-200 dark:border-gray-700" />
    ),
    th: (props: MdElementProps) => (
      <th
        {...props}
        className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left font-semibold"
      />
    ),
    td: (props: MdElementProps) => (
      <td
        {...props}
        className="border border-gray-300 dark:border-gray-700 px-4 py-2"
      />
    ),
    ...options.customComponents,
  }
}

/**
 * Convert a hast tree to React nodes (applies link handlers / titles).
 * Sync: rehype-react registers a compiler; `.stringify` returns JSX.
 */
export function hastToReact(
  hast: HastRoot,
  options: HastToReactOptions = {}
): React.ReactNode {
  if (!hast || !Array.isArray(hast.children) || hast.children.length === 0) {
    return null
  }

  const compiler = unified().use(rehypeReact, {
    Fragment,
    jsx: prod.jsx,
    jsxs: prod.jsxs,
    components: buildComponents({
      linkTarget: '_blank',
      ...options,
    }),
  })

  return compiler.stringify(hast as Parameters<typeof compiler.stringify>[0]) as React.ReactNode
}
