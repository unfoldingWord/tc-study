/**
 * Translation Note Card Component
 * 
 * Displays a single translation note with quote, note content, and support reference link
 */

import type { TranslationNote } from '@bt-synergy/resource-parsers'
import { Code, ExternalLink } from 'lucide-react'
import { memo, startTransition, useCallback, useState } from 'react'
import { useNavigationStore } from '../../../../contexts'
import { useAppStore } from '../../../../contexts/AppContext'
import { getResourceBadgeLabel } from '../../../../features/tabs/tabShortLabel'
import { parseRcLink } from '../../../../lib/markdown/rc-link-parser'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { MarkdownRenderer } from '../../../ui/MarkdownRenderer'
import { parseScriptureLink } from '../utils/parseScriptureLink'

interface AlignedToken {
  content: string
  semanticId: string
  verseRef: string
  position: number
  type?: 'word' | 'punctuation' | 'whitespace' | 'text' | 'gap'
}

export type NoteWithTokens = TranslationNote & {
  quoteTokens?: Array<{ text: string; id?: string | number; strong?: string; lemma?: string; morph?: string }>
  alignedTokens?: AlignedToken[]
  semanticIds?: string[]
}

interface TranslationNoteCardProps {
  note: NoteWithTokens
  isSelected: boolean
  /** Called with the note object so callers can use a single stable handler */
  onClick: (note: NoteWithTokens) => void
  /** Called with the note object so callers can use a single stable handler */
  onQuoteClick?: (note: NoteWithTokens) => void
  onSupportReferenceClick?: (supportRef: string) => void
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
  targetResourceId?: string
  resourceKey?: string
  languageDirection?: 'ltr' | 'rtl'
  taTitle?: string
  isLoadingTATitle?: boolean
  getEntryTitle?: (rcLink: string) => string | null
  /** When true, clicking the literal quote broadcasts OBS frame highlight even without aligned tokens. */
  obsMode?: boolean
}

const quoteChipClass =
  'w-full text-start mb-stack px-chrome py-chrome-tight bg-chip-quote hover:bg-chip-quote-hover rounded-md transition-colors duration-150'
const quoteChipStaticClass =
  'w-full text-start mb-stack px-chrome py-chrome-tight bg-chip-quote rounded-md border border-border-subtle'

export const TranslationNoteCard = memo(function TranslationNoteCard({
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
  obsMode = false,
}: TranslationNoteCardProps) {
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)
  // Narrow selector: only re-render when the book changes (OBS↔scripture switch),
  // not on every chapter/verse navigation or obsFrameCountByStory update.
  const currentBook = useNavigationStore((s) => s.currentReference.book)
  const hasAlignedTokens = !!(note.alignedTokens && note.alignedTokens.length > 0)

  // DCS abbreviation from AppStore (e.g. glt key → TPL); fall back to key segment
  const targetScripture = useAppStore((s) =>
    targetResourceId ? s.loadedResources[targetResourceId] : undefined
  )
  const resourceAbbreviation = getResourceBadgeLabel(targetResourceId, targetScripture)
  
  // Stable callback: useNavigationStore.getState() avoids subscribing to the store,
  // preventing re-renders (and cascading MarkdownRenderer effect re-fires) on every
  // navigation store update (e.g. setObsStoryFrameCount changing obsFrameCountByStory).
  const handleInternalLinkClick = useCallback((href: string, linkType: 'rc' | 'relative' | 'unknown', linkText?: string) => {
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
    if (linkType === 'relative' && linkText && currentBook) {
      const scriptureRef = parseScriptureLink(linkText, href, currentBook)
      if (scriptureRef) {
        // Use startTransition to make navigation non-blocking
        startTransition(() => {
          useNavigationStore.getState().navigateToReference(scriptureRef)
        })
        return
      }
    }
    
    // Unknown link type - log for debugging
    console.warn('🔗 [TN] Unhandled link:', { href, linkType, linkText })
  }, [currentBook, onEntryLinkClick, onSupportReferenceClick, resourceKey])
  return (
    <div
      className={`
        group rounded-md p-content cursor-pointer transition-colors duration-150 border
        ${isSelected 
          ? 'bg-highlight/50 border-highlight-strong' 
          : 'bg-surface hover:border-border border-border-subtle'
        }
      `}
      onClick={() => {
        onClick(note)
        if ((hasAlignedTokens || obsMode) && onQuoteClick) {
          onQuoteClick(note)
        }
      }}
      role="article"
      aria-label="Translation note"
    >
      {/* Target Language Quote - Clickable aligned tokens when available */}
      {hasAlignedTokens && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (onQuoteClick) {
              onQuoteClick(note)
            }
          }}
          className={quoteChipClass}
          title="Click to highlight these words in scripture"
          dir={languageDirection}
        >
          <div className="text-base leading-relaxed" dir={languageDirection}>
            <span className="italic text-fg-secondary">
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
              <span className="ms-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Fallback: Original language quote when target alignment is missing (e.g. scripture has no \zaln) */}
      {!hasAlignedTokens && note.quote && note.quote.trim().length > 0 && !obsMode && (
        <div
          className={quoteChipStaticClass}
          title="Original language phrase (target language alignment not available)"
          dir={languageDirection}
        >
          <div className="text-base leading-relaxed" dir={languageDirection}>
            <span className="italic text-fg-secondary">
              &ldquo;{note.quote}&rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ms-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </div>
      )}

      {!hasAlignedTokens && obsMode && note.quote && note.quote.trim().length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onQuoteClick?.(note)
          }}
          className={quoteChipClass}
          title="Click to highlight this phrase in the story frame"
          dir={languageDirection}
        >
          <div className="text-base leading-relaxed" dir={languageDirection}>
            <span className="italic text-fg-secondary">
              &ldquo;{note.quote}&rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ms-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Note Content - Translation guidance (markdown) */}
      {note.note && (
        <div className="relative" dir={languageDirection}>
          {showRawMarkdown ? (
            <pre className="text-xs text-fg-secondary leading-relaxed whitespace-pre-wrap font-mono bg-muted p-2.5 rounded-lg overflow-x-auto">
              {note.note}
            </pre>
          ) : (
            <MarkdownRenderer
              content={note.note}
              className="text-base text-fg-secondary leading-relaxed prose prose-base max-w-none prose-headings:text-fg prose-p:text-fg-secondary prose-strong:text-fg prose-a:text-accent"
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
            className="absolute top-0 right-0 p-1 text-fg-muted hover:text-fg-secondary hover:bg-muted rounded-md transition-colors opacity-0 group-hover:opacity-100"
            title={showRawMarkdown ? "Show rendered markdown" : "Show raw markdown"}
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Support Reference - Link to Translation Academy */}
      {note.supportReference && note.supportReference.startsWith('rc://') && (
        <div className="mt-2.5 pt-2.5 border-t border-border-subtle" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (onSupportReferenceClick) {
                onSupportReferenceClick(note.supportReference)
              }
            }}
            className="flex items-center gap-1.5 text-xs text-helps-fg hover:text-helps transition-colors"
            title={`Learn more: ${taTitle}`}
          >
            <ExternalLink className="w-3 h-3" />
            {isLoadingTATitle ? (
              <LoadingSpinner size="sm" label="Loading title" className="text-fg-muted" />
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
              className="px-1.5 py-0.5 bg-muted text-fg-secondary rounded text-[10px]"
            >
              {tag.trim()}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
