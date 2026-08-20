/**
 * WordLinkCard Component
 *
 * Individual card for a Translation Words Link.
 * Design matches Notes entries: quote on top, first-paragraph preview, entry link on bottom.
 * Entry title stays more prominent than the quote.
 */

import { BookText } from 'lucide-react'
import { memo } from 'react'
import { useAppStore } from '../../../../contexts/AppContext'
import { shouldShowHelpsExcerptSkeleton } from '../../../../features/helps/helpsExcerptSkeleton'
import {
  resolveHelpsQuoteStatus,
  type HelpsQuoteStatus,
} from '../../../../features/helps/resolveHelpsQuoteStatus'
import { getResourceBadgeLabel } from '../../../../features/tabs/tabShortLabel'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { MarkdownRenderer, MarkdownSkeleton } from '../../../ui/MarkdownRenderer'
import {
  HELPS_CARD_FOOTER,
  HELPS_CARD_FOOTER_BUTTON_TW,
  HELPS_CARD_FOOTER_ICON,
  HELPS_CARD_IDLE,
  HELPS_CARD_SELECTED,
} from '../../helpsCardStyles'
import { QuotedFilterText } from '../../shared/QuotedFilterText'
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
  /** True when the TW article excerpt has no cache entry yet */
  isLoadingPreview?: boolean
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
const quoteChipStaticClass =
  'w-full text-start mb-stack px-chrome py-chrome-tight bg-chip-quote rounded-md border border-border-subtle'

export const WordLinkCard = memo(function WordLinkCard({
  link,
  isSelected,
  twTitle,
  isLoadingTitle,
  twPreview = null,
  isLoadingPreview = false,
  onTitleClick,
  onQuoteClick,
  tokenFilter,
  targetResourceId,
  languageDirection = 'ltr',
  obsMode = false,
}: WordLinkCardProps) {
  const linkWithQuote = link as TranslationWordsLink & {
    alignedTokens?: AlignedToken[]
    quoteStatus?: HelpsQuoteStatus
  }
  const alignedTokens = linkWithQuote.alignedTokens
  const hasAlignedTokens = !!(alignedTokens && alignedTokens.length > 0)
  const quoteStatus =
    linkWithQuote.quoteStatus ??
    resolveHelpsQuoteStatus({
      hasAlignedTokens,
      alignmentPending: false,
      olQuote: link.origWords,
    })
  const excerptLoading = shouldShowHelpsExcerptSkeleton({
    kind: 'twl',
    obsMode,
    twPreview,
    twPreviewPending: isLoadingPreview,
  })
  const filterText = tokenFilter?.content ?? null

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
                  <QuotedFilterText quote={token.content} filterText={filterText} />
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

      {!hasAlignedTokens && !obsMode && quoteStatus === 'pending' && (
        <div
          className={`${quoteChipStaticClass} animate-pulse`}
          role="status"
          title="Building quote"
          aria-label="Building quote"
        >
          <LoadingSpinner size="sm" label="Building quote" className="text-fg-muted" />
        </div>
      )}

      {!hasAlignedTokens && !obsMode && quoteStatus === 'ol-fallback' && link.origWords?.trim() && (
        <div
          className={quoteChipStaticClass}
          title="Original language phrase (target language alignment not available)"
          dir={languageDirection}
        >
          <div className="text-base leading-relaxed">
            <span className="italic text-fg-secondary">
              &ldquo;<QuotedFilterText quote={link.origWords} filterText={filterText} />&rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ml-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium">
                {resourceAbbreviation}
              </span>
            )}
          </div>
        </div>
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
              &ldquo;<QuotedFilterText quote={link.origWords} filterText={filterText} />&rdquo;
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
      {excerptLoading ? (
        <div
          className="mt-1.5"
          dir={languageDirection}
          role="status"
          title="Loading excerpt"
          aria-label="Loading excerpt"
        >
          <MarkdownSkeleton className="text-base leading-relaxed" />
        </div>
      ) : twPreview ? (
        <div className="mt-1.5" dir={languageDirection}>
          <MarkdownRenderer
            content={twPreview}
            className="text-base text-fg-secondary leading-relaxed prose prose-base max-w-none prose-headings:text-fg prose-p:text-fg-secondary prose-strong:text-fg prose-a:text-accent"
          />
        </div>
      ) : null}

      {/* Entry Link - On bottom, with modal icon (matches Notes support reference style) */}
      <div className={HELPS_CARD_FOOTER} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onTitleClick(link)
          }}
          className={HELPS_CARD_FOOTER_BUTTON_TW}
          title={`View Translation Words article: ${twTitle}`}
          aria-label={`View Translation Words article: ${twTitle}`}
        >
          <BookText className={HELPS_CARD_FOOTER_ICON} />
          {isLoadingTitle ? (
            <LoadingSpinner size="sm" label="Loading title" className="text-fg-muted" />
          ) : (
            <span>{twTitle}</span>
          )}
        </button>
      </div>
    </div>
  )
})
