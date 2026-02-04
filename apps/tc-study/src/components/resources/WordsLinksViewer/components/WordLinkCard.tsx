/**
 * WordLinkCard Component
 * 
 * Individual card for a Translation Words Link
 */

import { Hash, Loader } from 'lucide-react'
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
        rounded-lg border transition-all
        ${isSelected
          ? 'bg-blue-50 border-blue-300 shadow-md'
          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }
      `}
    >
      {/* TW Article Title - Prominent, clickable to open modal */}
      <button
        onClick={() => onTitleClick(link)}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors group"
        title={`View Translation Words article: ${twTitle}`}
      >
        <div className="flex items-start gap-2">
          <Hash className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isKeyTerm ? 'text-indigo-600' : 'text-teal-600'}`} />
          <div className="flex-1">
            {isLoadingTitle ? (
              <div className="flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">Loading...</span>
              </div>
            ) : (
              <div className={`font-semibold text-base group-hover:text-blue-600 transition-colors ${isKeyTerm ? 'text-indigo-900' : 'text-teal-900'}`}>
                {twTitle}
              </div>
            )}

          </div>
        </div>
      </button>
      
      {/* Target Language Quote - Clickable to broadcast/highlight tokens */}
      {hasAlignedTokens && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuoteClick(link)
          }}
          className="w-full text-left px-4 py-2.5 border-t border-gray-100 hover:bg-blue-50 transition-colors group"
          title="Click to highlight these words in scripture"
        >
          <div className="text-sm text-gray-700 leading-relaxed">
            <span className="text-gray-400">"</span>
            <span className="italic">
              {(link as any).alignedTokens.map((token: AlignedToken, index: number) => (
                <span key={token.semanticId || index}>
                  {index > 0 && ' '}
                  {token.content}
                </span>
              ))}
            </span>
            <span className="text-gray-400">"</span>
            {resourceAbbreviation && (
              <span className="text-xs text-gray-500 font-medium ml-2">
                — {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}
    </div>
  )
}
