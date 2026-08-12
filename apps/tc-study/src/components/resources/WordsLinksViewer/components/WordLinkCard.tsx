/**
 * WordLinkCard Component
 *
 * Individual card for a Translation Words Link.
 * Design matches Notes entries: quote on top, first-paragraph preview, entry link on bottom.
 * Entry title stays more prominent than the quote.
 */

import { ExternalLink, MoreHorizontal } from 'lucide-react'
import { memo } from 'react'
import { useAppStore } from '../../../../contexts/AppContext'
import { getResourceBadgeLabel } from '../../../../features/tabs/tabShortLabel'
import { parseTWLink } from '../../../../features/helps/quoteTokens'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { MarkdownRenderer } from '../../../ui/MarkdownRenderer'
import { HELPS_CARD_IDLE, HELPS_CARD_SELECTED } from '../../helpsCardStyles'
import type { TokenFilter, TranslationWordsLink } from '../types'

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
  /** First content paragraph of the TW article; omit/null when not loaded or empty */
  twPreview?: string | null
  onTitleClick: (link: TranslationWordsLink) => void  // Opens TW article modal
  onQuoteClick: (link: TranslationWordsLink) => void  // Broadcasts tokens for highlighting
  tokenFilter: TokenFilter | null
  targetResourceId?: string | null  // Source scripture resource (e.g., "unfoldingWord/en/ult")
  /** Quote block direction (e.g. rtl for Persian) so quote marks and text align correctly */
  languageDirection?: 'ltr' | 'rtl'
  /** When true, quote is clickable for OBS frame highlight using origWords (no aligned tokens). */
  obsMode?: boolean
}

const quoteChipClass =
  'w-full text-start mb-stack px-chrome py-chrome-tight bg-chip-quote hover:bg-chip-quote-hover rounded-md transition-colors duration-150'

export const WordLinkCard = memo(function WordLinkCard({
  link,
  isSelected,
  twTitle,
  isLoadingTitle,
  twPreview = null,
  onTitleClick,
  onQuoteClick,
  tokenFilter: _tokenFilter,
  targetResourceId,
  languageDirection = 'ltr',
  obsMode = false,
}: WordLinkCardProps) {
  const twInfo = parseTWLink(link.twLink)
  const isKeyTerm = twInfo.category === 'kt'
  const alignedTokens = (link as TranslationWordsLink & { alignedTokens?: AlignedToken[] }).alignedTokens
  const hasAlignedTokens = alignedTokens && alignedTokens.length > 0

  // DCS abbreviation from AppStore (e.g. glt key → TPL); fall back to key segment
  const targetScripture = useAppStore((s) =>
    targetResourceId ? s.loadedResources[targetResourceId] : undefined
  )
  const resourceAbbreviation = getResourceBadgeLabel(targetResourceId, targetScripture)

  return (
    <div
      className={`
        group rounded-md p-content cursor-pointer transition-colors duration-150 border
        ${isSelected ? HELPS_CARD_SELECTED : HELPS_CARD_IDLE}

      `}
      onClick={(hasAlignedTokens || obsMode) ? () => onQuoteClick(link) : undefined}
      role="article"
      aria-label="Translation words link"
      title={
        hasAlignedTokens || obsMode
          ? obsMode
            ? 'Click to highlight in the story frame'
            : 'Click to highlight these words in scripture'
          : undefined
      }
    >
      {/* Quote - On top, clickable to broadcast/highlight tokens (matches Notes layout) */}
      {hasAlignedTokens && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuoteClick(link)
          }}
          className={quoteChipClass}
          title="Click to highlight these words in scripture"
          dir={languageDirection}
        >
          <div className="text-base leading-relaxed">
            <span className="italic text-fg-secondary">
              &ldquo;
              {alignedTokens.map((token: AlignedToken, index: number) => (
                <span key={token.semanticId || index}>
                  {index > 0 && ' '}
                  {token.content}
                </span>
              ))}
              &rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ml-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}

      {!hasAlignedTokens && obsMode && link.origWords && link.origWords.trim().length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onQuoteClick(link)
          }}
          className={quoteChipClass}
          title="Click to highlight this phrase in the story frame"
          dir={languageDirection}
        >
          <div className="text-base leading-relaxed">
            <span className="italic text-fg-secondary">
              &ldquo;{link.origWords}&rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ml-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </button>
      )}

      {/* First-paragraph preview (mirrors TN note body — clicks bubble to card for quote highlight) */}
      {twPreview ? (
        <div className="relative mt-1.5" dir={languageDirection}>
          <div className="pe-7">
            <MarkdownRenderer
              content={twPreview}
              className="text-base text-fg-secondary leading-relaxed prose prose-base max-w-none prose-headings:text-fg prose-p:text-fg-secondary prose-strong:text-fg prose-a:text-accent"
            />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onTitleClick(link)
            }}
            className="absolute top-0 end-0 p-1 text-fg-muted hover:text-helps-fg hover:bg-helps-soft rounded-md transition-colors"
            title="See more"
            aria-label="See more"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}

      {/* Entry Link - On bottom, with modal icon (matches Notes support reference style) */}
      <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onTitleClick(link)
          }}
          className="flex items-center gap-1.5 w-full text-left transition-colors group/title"
          title={`View Translation Words article: ${twTitle}`}
        >
          <ExternalLink
            className={`w-3.5 h-3.5 flex-shrink-0 ${isKeyTerm ? 'text-helps-fg' : 'text-accent-fg'}`}
          />
          {isLoadingTitle ? (
            <LoadingSpinner size="sm" label="Loading title" className="text-fg-muted" />
          ) : (
            <span
              className={`font-semibold text-base group-hover/title:text-accent transition-colors ${
                isKeyTerm ? 'text-helps-fg' : 'text-accent-fg'
              }`}
            >
              {twTitle}
            </span>
          )}
        </button>
      </div>
    </div>
  )
})
