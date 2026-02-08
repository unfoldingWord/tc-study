/**
 * WordLinkCard Component
 *
 * Individual card for a Translation Words Link.
 * Design matches Notes entries: quote on top, entry link on bottom with modal icon.
 * Entry title stays more prominent than the quote.
 */

import { ExternalLink, Loader } from 'lucide-react'
import type { TokenFilter, TranslationWordsLink } from '../types'
import { parseTWLink } from '../utils'

interface AlignedToken {
  content: string
  semanticId: string
  verseRef: string
  position: number
}

interface WordLinkCardProps {
  link: TranslationWordsLink
  isSelected: boolean
  twTitle: string
  isLoadingTitle: boolean
  onTitleClick: (link: TranslationWordsLink) => void  // Opens TW article modal
  onQuoteClick: (link: TranslationWordsLink) => void  // Broadcasts tokens for highlighting
  tokenFilter: TokenFilter | null
  targetResourceId?: string | null  // Source scripture resource (e.g., "unfoldingWord/en/ult")
}

export function WordLinkCard({
  link,
  isSelected,
  twTitle,
  isLoadingTitle,
  onTitleClick,
  onQuoteClick,
  tokenFilter,
  targetResourceId,
}: WordLinkCardProps) {
  const twInfo = parseTWLink(link.twLink)
  const isKeyTerm = twInfo.category === 'kt'
  const hasAlignedTokens = (link as any).alignedTokens && (link as any).alignedTokens.length > 0

  // Extract resource abbreviation (e.g., "ult" from "unfoldingWord/en/ult")
  const resourceAbbreviation = targetResourceId
    ? targetResourceId.split('/').pop()?.toUpperCase() || ''
    : ''

  return (
    <div
      className={`
        group rounded-lg p-3 cursor-pointer transition-all duration-150 border
        ${isSelected
          ? 'bg-gradient-to-br from-purple-50 via-purple-50 to-indigo-50 shadow-sm border-purple-200'
          : 'bg-white hover:shadow-sm hover:border-gray-200 border-gray-100'
        }
      `}
      onClick={hasAlignedTokens ? () => onQuoteClick(link) : undefined}
      role="article"
      aria-label="Translation words link"
      title={hasAlignedTokens ? 'Click to highlight these words in scripture' : undefined}
    >
      {/* Quote - On top, clickable to broadcast/highlight tokens (matches Notes layout) */}
      {hasAlignedTokens && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuoteClick(link)
          }}
          className="w-full text-left mb-2.5 px-3 py-2 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 hover:from-blue-100/80 hover:to-indigo-100/80 rounded-lg transition-all duration-150"
          title="Click to highlight these words in scripture"
        >
          <div className="text-base leading-relaxed">
            <span className="italic text-gray-700">
              &ldquo;
              {(link as any).alignedTokens.map((token: AlignedToken, index: number) => (
                <span key={token.semanticId || index}>
                  {index > 0 && ' '}
                  {token.content}
                </span>
              ))}
              &rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ml-2 px-1.5 py-0.5 bg-white/80 backdrop-blur rounded text-[10px] text-purple-600 font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Entry Link - On bottom, with modal icon (matches Notes support reference style) */}
      <div className="mt-2.5 pt-2.5 border-t border-gray-100/50">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTitleClick(link)
          }}
          className="flex items-center gap-1.5 w-full text-left transition-colors group/title"
          title={`View Translation Words article: ${twTitle}`}
        >
          <ExternalLink className={`w-3.5 h-3.5 flex-shrink-0 ${isKeyTerm ? 'text-indigo-600' : 'text-teal-600'}`} />
          {isLoadingTitle ? (
            <span className="flex items-center gap-2 italic text-gray-400 text-sm">
              <Loader className="w-3.5 h-3.5 animate-spin" />
              Loading...
            </span>
          ) : (
            <span className={`font-semibold text-base group-hover/title:text-blue-600 transition-colors ${isKeyTerm ? 'text-indigo-900' : 'text-teal-900'}`}>
              {twTitle}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
