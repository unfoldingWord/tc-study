/**
 * Translation Note Card Component
 * 
 * Displays a single translation note with quote, note content, and support reference link
 */

import type { TranslationNote } from '@bt-synergy/resource-parsers'
import { Code, ExternalLink } from 'lucide-react'
import { startTransition, useState } from 'react'
import { useCurrentReference, useNavigation } from '../../../../contexts'
import { parseRcLink } from '../../../../lib/markdown/rc-link-parser'
import { MarkdownRenderer } from '../../../ui/MarkdownRenderer'
import { parseScriptureLink } from '../utils/parseScriptureLink'

interface AlignedToken {
  content: string
  semanticId: string
  verseRef: string
  position: number
  type?: 'word' | 'punctuation' | 'whitespace' | 'text' | 'gap'
}

interface TranslationNoteCardProps {
  note: TranslationNote & { alignedTokens?: AlignedToken[] }
  isSelected: boolean
  onClick: () => void
  onQuoteClick?: () => void
  onSupportReferenceClick?: (supportRef: string) => void
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
  targetResourceId?: string
  resourceKey?: string
  languageDirection?: 'ltr' | 'rtl'
  taTitle?: string
  isLoadingTATitle?: boolean
  getEntryTitle?: (rcLink: string) => string | null
}

export function TranslationNoteCard({
  note,
  isSelected,
  onClick,
  onQuoteClick,
  onSupportReferenceClick,
  onEntryLinkClick,
  targetResourceId,
  resourceKey,
  languageDirection = 'ltr',
  taTitle = 'Learn more',
  isLoadingTATitle = false,
  getEntryTitle,
}: TranslationNoteCardProps) {
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)
  const currentRef = useCurrentReference()
  const { navigateToReference } = useNavigation()
  const hasAlignedTokens = note.alignedTokens && note.alignedTokens.length > 0
  
  // Extract resource abbreviation (e.g., "ULT" from "unfoldingWord/en/ult")
  const resourceAbbreviation = targetResourceId 
    ? targetResourceId.split('/').pop()?.toUpperCase() || ''
    : ''
  
  // Handle internal link clicks (scripture navigation, TA/TW entry links)
  const handleInternalLinkClick = (href: string, linkType: 'rc' | 'relative' | 'unknown', linkText?: string) => {
    // Handle rc:// links (TA/TW entries)
    if (linkType === 'rc' && href.startsWith('rc://')) {
      const parsed = parseRcLink(href)
      
      if (!parsed.isValid) {
        console.warn('🔗 [TN] Invalid rc:// link:', href)
        return
      }
      
      // Handle TW and TA entry links (open in modal/viewer)
      if ((parsed.resourceType === 'words' || parsed.resourceType === 'academy') && onEntryLinkClick && resourceKey) {
        // Extract language and owner from current resource key
        const parts = resourceKey.split('/')
        const owner = parts[0] || 'unfoldingWord'
        const language = parts.length >= 2 ? parts[1].split('_')[0] : 'en'
        
        // Construct target resource key
        const targetResourceKey = `${owner}/${language}/${parsed.resourceAbbrev}`
        
        console.log('🔗 [TN] Opening entry:', {
          resourceType: parsed.resourceType,
          targetResourceKey,
          entryId: parsed.entryId,
        })
        
        onEntryLinkClick(targetResourceKey, parsed.entryId)
        return
      }
      
      // Fallback: use old support reference handler for backward compatibility
      if (onSupportReferenceClick) {
        onSupportReferenceClick(href)
        return
      }
    }
    
    // Handle scripture navigation (relative links)
    if (linkType === 'relative' && linkText && currentRef.book) {
      const scriptureRef = parseScriptureLink(linkText, href, currentRef.book)
      if (scriptureRef) {
        console.log('📖 [TN] Navigating to scripture reference:', scriptureRef)
        // Use startTransition to make navigation non-blocking
        // This prevents the heavy quote matching/alignment computation from freezing the UI
        startTransition(() => {
          navigateToReference(scriptureRef)
        })
        return
      }
    }
    
    // Unknown link type - log for debugging
    console.warn('🔗 [TN] Unhandled link:', { href, linkType, linkText })
  }
  return (
    <div
      className={`
        group rounded-lg p-3 cursor-pointer transition-all duration-150 border
        ${isSelected 
          ? 'bg-gradient-to-br from-amber-50 via-amber-50 to-orange-50 shadow-sm border-amber-200' 
          : 'bg-white hover:shadow-sm hover:border-gray-200 border-gray-100'
        }
      `}
      onClick={() => {
        onClick()
        if (hasAlignedTokens && onQuoteClick) {
          onQuoteClick()
        }
      }}
      role="article"
      aria-label="Translation note"
    >
      {/* Target Language Quote - Clickable aligned tokens */}
      {hasAlignedTokens && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onQuoteClick) {
              onQuoteClick()
            }
          }}
          className="w-full text-left mb-2.5 px-3 py-2 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 hover:from-blue-100/80 hover:to-indigo-100/80 rounded-lg transition-all duration-150"
          title="Click to highlight these words in scripture"
        >
          <div className="text-base leading-relaxed" dir={languageDirection}>
            <span className="italic text-gray-700">
              &ldquo;
              {note.alignedTokens!.map((token, index) => {
                // For whitespace and text tokens, render them as-is (they already contain their spacing)
                if (token.type === 'whitespace' || token.type === 'text') {
                  return (
                    <span key={token.semanticId || index}>
                      {token.content}
                    </span>
                  )
                }
                
                const prevToken = index > 0 ? note.alignedTokens![index - 1] : null
                // Add space before this token if:
                // - Not the first token
                // - Previous token wasn't a gap, whitespace, or text (which have their own spacing)
                // - Current token is not punctuation or gap
                const needsSpace = index > 0 && 
                  prevToken?.type !== 'gap' && 
                  prevToken?.type !== 'whitespace' &&
                  prevToken?.type !== 'text' &&
                  token.type !== 'punctuation' && 
                  token.type !== 'gap'
                
                return (
                  <span key={token.semanticId || index}>
                    {needsSpace && ' '}
                    {token.content}
                  </span>
                )
              })}
              &rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ml-2 px-1.5 py-0.5 bg-white/80 backdrop-blur rounded text-[10px] text-blue-600 font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Note Content - Translation guidance (markdown) */}
      {note.note && (
        <div className="relative">
          {showRawMarkdown ? (
            <pre className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-mono bg-gray-50 p-2.5 rounded-lg overflow-x-auto">
              {note.note}
            </pre>
          ) : (
            <MarkdownRenderer
              content={note.note}
              className="text-base text-gray-700 leading-relaxed prose prose-base max-w-none"
              onInternalLinkClick={handleInternalLinkClick}
              getEntryTitle={getEntryTitle}
            />
          )}
          {/* Toggle button - small and discrete */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowRawMarkdown(!showRawMarkdown)
            }}
            className="absolute top-0 right-0 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors opacity-0 group-hover:opacity-100"
            title={showRawMarkdown ? "Show rendered markdown" : "Show raw markdown"}
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Support Reference - Link to Translation Academy */}
      {note.supportReference && note.supportReference.startsWith('rc://') && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100/50" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (onSupportReferenceClick) {
                onSupportReferenceClick(note.supportReference)
              }
            }}
            className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 transition-colors"
            title={`Learn more: ${taTitle}`}
          >
            <ExternalLink className="w-3 h-3" />
            {isLoadingTATitle ? (
              <span className="italic text-gray-400">Loading...</span>
            ) : (
              <span>{taTitle}</span>
            )}
          </button>
        </div>
      )}

      {/* Tags (if present) */}
      {note.tags && note.tags.trim() && (
        <div className="mt-2 flex flex-wrap gap-1">
          {note.tags.split(',').filter(Boolean).map((tag, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 bg-gray-100/50 text-gray-600 rounded text-[10px]"
            >
              {tag.trim()}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
