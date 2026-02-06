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
        group rounded-lg p-3 transition-all duration-150 border
        ${isSelected
          ? 'bg-gradient-to-br from-purple-50 via-purple-50 to-indigo-50 shadow-sm border-purple-200'
          : 'bg-white hover:shadow-sm hover:border-gray-200 border-gray-100'
        }
      `}
    >
      {/* TW Article Title - Prominent, clickable to open modal */}
      <button
        onClick={() => onTitleClick(link)}
        className="w-full text-left transition-colors group/title"
        title={`View Translation Words article: ${twTitle}`}
      >
        <div className="flex items-start gap-2">
          <Hash className={`w-4 h-4 mt-1 flex-shrink-0 ${isKeyTerm ? 'text-indigo-600' : 'text-teal-600'}`} />
          <div className="flex-1">
            {isLoadingTitle ? (
              <div className="flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">Loading...</span>
              </div>
            ) : (
              <div className={`font-semibold text-base group-hover/title:text-blue-600 transition-colors ${isKeyTerm ? 'text-indigo-900' : 'text-teal-900'}`}>
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
          className="w-full text-left mt-2 px-3 py-2 bg-gradient-to-r from-purple-50/80 to-indigo-50/80 hover:from-purple-100/80 hover:to-indigo-100/80 rounded-lg transition-all duration-150"
          title="Click to highlight these words in scripture"
        >
          <div className="text-base text-gray-700 leading-relaxed">
            <span className="italic">
              {(link as any).alignedTokens.map((token: AlignedToken, index: number) => (
                <span key={token.semanticId || index}>
                  {index > 0 && ' '}
                  {token.content}
                </span>
              ))}
            </span>
            {resourceAbbreviation && (
              <span className="ml-2 px-1.5 py-0.5 bg-white/80 backdrop-blur rounded text-[10px] text-purple-600 font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}
    </div>
  )
}
