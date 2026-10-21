/**
 * Translation Note Card Component
 * 
 * Displays a single translation note with quote, note content, and support reference link
 */

import type { TranslationNote } from '@bt-synergy/resource-parsers'
import { ChevronDown, ChevronUp, Code, Filter, GraduationCap } from 'lucide-react'
import { memo, startTransition, useCallback, useState } from 'react'
import { useNavigationStore } from '../../../../contexts'
import { useAppStore } from '../../../../contexts/AppContext'
import { shouldShowHelpsExcerptSkeleton } from '../../../../features/helps/helpsExcerptSkeleton'
import {
  resolveHelpsQuoteStatusForNote,
  type HelpsQuoteStatus,
} from '../../../../features/helps/resolveHelpsQuoteStatus'
import { supportRefQuoteChipKind } from '../../../../features/helps/supportRefQuotePaint'
import { getResourceBadgeLabel } from '../../../../features/tabs/tabShortLabel'
import type { HastRoot } from '../../../../lib/markdown/markdownToHast'
import { parseRcLink } from '../../../../lib/markdown/rc-link-parser'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { isDebugBuild } from '../../../../utils/debugBuild'
import { MarkdownRenderer, MarkdownSkeleton } from '../../../ui/MarkdownRenderer'
import {
  HELPS_CARD_FOOTER,
  HELPS_CARD_FOOTER_BUTTON_TA,
  HELPS_CARD_FOOTER_ICON,
  HELPS_CARD_FOOTER_ICON_BUTTON,
  HELPS_CARD_FOOTER_ICON_BUTTON_ACTIVE,
  helpsCardStateClass,
} from '../../helpsCardStyles'
import { QuotedFilterText } from '../../shared/QuotedFilterText'
import type { TokenFilter } from '../../WordsLinksViewer/types'
import { introNoteHeading, shouldCollapseIntroNote } from '../utils/introNoteHeading'
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
  quoteStatus?: HelpsQuoteStatus
  quoteWarmPending?: boolean
  /** Precomputed markdown AST — skips remark parse when present. */
  bodyHast?: HastRoot
}

interface TranslationNoteCardProps {
  note: NoteWithTokens
  isSelected: boolean
  /** This note's support-reference is the active book-wide filter (applied from this card). */
  isFilterSource?: boolean
  /** Called with the note object so callers can use a single stable handler */
  onClick: (note: NoteWithTokens) => void
  /** Called with the note object so callers can use a single stable handler */
  onQuoteClick?: (note: NoteWithTokens) => void
  onSupportReferenceClick?: (supportRef: string, title?: string) => void
  /** CombinedHelps: filter book notes that share this TA support-reference. */
  onFilterBySupportReference?: (supportRef: string, title?: string) => void
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
  targetResourceId?: string
  resourceKey?: string
  languageDirection?: 'ltr' | 'rtl'
  taTitle?: string
  isLoadingTATitle?: boolean
  getEntryTitle?: (rcLink: string) => string | null
  /** When true, clicking the literal quote broadcasts OBS frame highlight even without aligned tokens. */
  obsMode?: boolean
  /** Active scripture token filter — underline that word in the quote chip. */
  tokenFilter?: TokenFilter | null
}

function IntroExpandButton({
  expanded,
  onToggle,
  className = '',
}: {
  expanded: boolean
  onToggle: () => void
  className?: string
}) {
  const label = expanded ? 'Show less' : 'Show more'
  const Icon = expanded ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      aria-expanded={expanded}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={`p-1 rounded-md text-fg-muted hover:text-fg-secondary hover:bg-muted shrink-0 ${className}`}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  )
}

const quoteChipClass =
  'w-full text-start mb-stack px-chrome py-chrome-tight bg-chip-quote hover:bg-chip-quote-hover rounded-md transition-colors duration-150'
const quoteChipStaticClass =
  'w-full text-start mb-stack px-chrome py-chrome-tight bg-chip-quote rounded-md border border-border-subtle'

export const TranslationNoteCard = memo(function TranslationNoteCard({
  note,
  isSelected,
  isFilterSource = false,
  onClick,
  onQuoteClick,
  onSupportReferenceClick,
  onFilterBySupportReference,
  onEntryLinkClick,
  targetResourceId,
  resourceKey,
  languageDirection = 'ltr',
  taTitle = 'Learn more',
  isLoadingTATitle = false,
  getEntryTitle,
  obsMode = false,
  tokenFilter = null,
}: TranslationNoteCardProps) {
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)
  const [introExpanded, setIntroExpanded] = useState(false)
  const isIntro = shouldCollapseIntroNote(note)
  const introHeading = isIntro ? introNoteHeading(note.note) : ''
  // Narrow selector: only re-render when the book changes (OBS↔scripture switch),
  // not on every chapter/verse navigation or obsFrameCountByStory update.
  const currentBook = useNavigationStore((s) => s.currentReference.book)
  const hasAlignedTokens = !!(note.alignedTokens && note.alignedTokens.length > 0)
  // Missing quoteStatus: wait only when there is a Quote to align. Empty-quote
  // notes (often chapter intros) never enter quote-build — settle to `none`.
  const quoteStatus = resolveHelpsQuoteStatusForNote({
    quoteStatus: note.quoteStatus,
    hasAlignedTokens,
    quote: note.quote,
  })
  const quoteChipKind = supportRefQuoteChipKind({
    hasAlignedTokens,
    quoteStatus,
    olQuote: note.quote,
    quoteWarmPending: note.quoteWarmPending,
  })
  const excerptLoading = shouldShowHelpsExcerptSkeleton({
    kind: 'tn',
    obsMode,
    quoteStatus,
  })
  const filterText = tokenFilter?.content ?? null

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
        group relative rounded-md p-content cursor-pointer transition-colors duration-150 border
        ${helpsCardStateClass(isSelected, isFilterSource)}

      `}
      data-helps-filter-source={isFilterSource || undefined}
      onClick={() => {
        if (isIntro && !introExpanded) {
          setIntroExpanded(true)
          return
        }
        // Quote persist/token-click first — select-driven navigate must not race ahead.
        onQuoteClick?.(note)
        onClick(note)
      }}
      role="article"
      aria-label="Translation note"
    >
      {isIntro && introExpanded ? (
        <IntroExpandButton
          expanded
          onToggle={() => setIntroExpanded(false)}
          className="absolute top-1 right-1 z-10 bg-surface/80"
        />
      ) : null}
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
                      <QuotedFilterText quote={token.content} filterText={filterText} />
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
                    <QuotedFilterText quote={token.content} filterText={filterText} />
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

      {quoteChipKind === 'placeholder' && !obsMode && (
        <div
          className={`${quoteChipStaticClass} animate-pulse`}
          role="status"
          title="Building quote"
          aria-label="Building quote"
        >
          <LoadingSpinner size="sm" label="Building quote" className="text-fg-muted" />
        </div>
      )}

      {(quoteChipKind === 'ol' || quoteChipKind === 'ol-pending') && !obsMode && note.quote?.trim() && (
        <div
          className={quoteChipStaticClass}
          title={
            quoteChipKind === 'ol-pending'
              ? 'Building quote'
              : 'Original language phrase (target language alignment not available)'
          }
          dir={languageDirection}
        >
          <div className="flex items-center gap-2 text-base leading-relaxed" dir={languageDirection}>
            <span className="italic text-fg-secondary min-w-0">
              &ldquo;<QuotedFilterText quote={note.quote} filterText={filterText} />&rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ms-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium shrink-0">
                {resourceAbbreviation}
              </span>
            )}
            {quoteChipKind === 'ol-pending' && (
              <span
                className="shrink-0 inline-flex"
                role="status"
                title="Building quote"
                aria-label="Building quote"
              >
                <LoadingSpinner size="sm" label="Building quote" className="text-fg-muted" />
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
              &ldquo;<QuotedFilterText quote={note.quote} filterText={filterText} />&rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ms-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}

      {/* Note Content - Translation guidance (markdown). Intros stay collapsed until expanded. */}
      {isIntro && !excerptLoading && note.note && !introExpanded ? (
        <div
          className="flex items-start gap-2"
          dir={languageDirection}
          onClick={(e) => {
            e.stopPropagation()
            setIntroExpanded(true)
          }}
        >
          <p className="flex-1 min-w-0 text-base font-medium text-fg leading-relaxed">{introHeading}</p>
          <IntroExpandButton expanded={false} onToggle={() => setIntroExpanded(true)} />
        </div>
      ) : excerptLoading ? (
        <div
          className="relative"
          dir={languageDirection}
          role="status"
          title="Loading excerpt"
          aria-label="Loading excerpt"
        >
          <MarkdownSkeleton className="text-base leading-relaxed" />
        </div>
      ) : note.note ? (
        <div className="relative" dir={languageDirection}>
          {isDebugBuild() && showRawMarkdown ? (
            <pre className="text-xs text-fg-secondary leading-relaxed whitespace-pre-wrap font-mono bg-muted p-2.5 rounded-lg overflow-x-auto">
              {note.note}
            </pre>
          ) : (
            <MarkdownRenderer
              content={note.note}
              hast={note.bodyHast}
              className={`text-base text-fg-secondary leading-relaxed prose prose-base max-w-none prose-headings:text-fg prose-p:text-fg-secondary prose-strong:text-fg prose-a:text-accent${isIntro && introExpanded ? ' pe-6' : ''}`}
              onInternalLinkClick={handleInternalLinkClick}
              getEntryTitle={getEntryTitle}
            />
          )}
          {isIntro ? (
            <div className="mt-2 flex" dir={languageDirection}>
              <span className="ms-auto">
                <IntroExpandButton expanded onToggle={() => setIntroExpanded(false)} />
              </span>
            </div>
          ) : null}
          {isDebugBuild() ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowRawMarkdown(!showRawMarkdown)
              }}
              className="absolute top-0 right-0 p-1 text-fg-muted hover:text-fg-secondary hover:bg-muted rounded-md transition-colors opacity-0 group-hover:opacity-100"
              title={showRawMarkdown ? 'Show rendered markdown' : 'Show raw markdown'}
              aria-label={showRawMarkdown ? 'Show rendered markdown' : 'Show raw markdown'}
            >
              <Code className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Support Reference — open TA; optional filter icon for book-wide matches */}
      {note.supportReference && note.supportReference.startsWith('rc://') && (
        <div className={HELPS_CARD_FOOTER} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (onSupportReferenceClick) {
                  onSupportReferenceClick(note.supportReference, taTitle)
                }
              }}
              className={`${HELPS_CARD_FOOTER_BUTTON_TA} flex-1 min-w-0`}
              title={`Learn more: ${taTitle}`}
              aria-label={`Learn more: ${taTitle}`}
            >
              <GraduationCap className={HELPS_CARD_FOOTER_ICON} />
              {isLoadingTATitle ? (
                <LoadingSpinner size="sm" label="Loading title" className="text-fg-muted" />
              ) : (
                <span className="truncate">{taTitle}</span>
              )}
            </button>
            {onFilterBySupportReference ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onFilterBySupportReference(note.supportReference, taTitle)
                }}
                className={
                  isFilterSource ? HELPS_CARD_FOOTER_ICON_BUTTON_ACTIVE : HELPS_CARD_FOOTER_ICON_BUTTON
                }
                aria-pressed={isFilterSource}
                title={`Filter book notes: ${taTitle}`}
                aria-label={`Filter book notes: ${taTitle}`}
              >
                <Filter className={HELPS_CARD_FOOTER_ICON} />
              </button>
            ) : null}
          </div>
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
