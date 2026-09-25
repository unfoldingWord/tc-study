/**
 * WordLinkCard Component
 *
 * Individual card for a Translation Words Link.
 * Design matches Notes entries: quote on top, first-paragraph preview, entry link on bottom.
 * Entry title stays more prominent than the quote.
 */

import { BookText, Filter } from 'lucide-react'
import { memo } from 'react'
import { useAppStore } from '../../../../contexts/AppContext'
import { shouldShowHelpsExcerptSkeleton } from '../../../../features/helps/helpsExcerptSkeleton'
import {
  resolveHelpsQuoteStatus,
  type HelpsQuoteStatus,
} from '../../../../features/helps/resolveHelpsQuoteStatus'
import { supportRefQuoteChipKind } from '../../../../features/helps/supportRefQuotePaint'
import { getResourceBadgeLabel } from '../../../../features/tabs/tabShortLabel'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { MarkdownRenderer, MarkdownSkeleton } from '../../../ui/MarkdownRenderer'
import {
  HELPS_CARD_FOOTER,
  HELPS_CARD_FOOTER_BUTTON_TW,
  HELPS_CARD_FOOTER_ICON,
  HELPS_CARD_FOOTER_ICON_BUTTON_TW,
  HELPS_CARD_FOOTER_ICON_BUTTON_TW_ACTIVE,
  helpsCardStateClass,
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
  /** This link's TW article is the active book-wide filter (applied from this card). */
  isFilterSource?: boolean
  twTitle: string
  isLoadingTitle: boolean
  /** First content paragraph of the TW article; omit/null when not loaded or empty */
  twPreview?: string | null
  /** True when the TW article excerpt has no cache entry yet */
  isLoadingPreview?: boolean
  onTitleClick: (link: TranslationWordsLink) => void  // Opens TW article modal
  onQuoteClick: (link: TranslationWordsLink) => void  // Broadcasts tokens for highlighting
  onFilterByTwlArticle?: (link: TranslationWordsLink, title?: string) => void
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
  isFilterSource = false,
  twTitle,
  isLoadingTitle,
  twPreview = null,
  isLoadingPreview = false,
  onTitleClick,
  onQuoteClick,
  onFilterByTwlArticle,
  tokenFilter,
  targetResourceId,
  languageDirection = 'ltr',
  obsMode = false,
}: WordLinkCardProps) {
  const linkWithQuote = link as TranslationWordsLink & {
    alignedTokens?: AlignedToken[]
    quoteStatus?: HelpsQuoteStatus
    quoteWarmPending?: boolean
  }
  const alignedTokens = linkWithQuote.alignedTokens
  const hasAlignedTokens = !!(alignedTokens && alignedTokens.length > 0)
  // Missing quoteStatus = pipeline has not attached a result yet — keep pending,
  // never paint a finished OL-fallback (Greek/Hebrew + target badge with no chips).
  const quoteStatus =
    linkWithQuote.quoteStatus ??
    resolveHelpsQuoteStatus({
      hasAlignedTokens,
      alignmentPending: !hasAlignedTokens,
      olQuote: link.origWords,
    })
  const quoteChipKind = supportRefQuoteChipKind({
    hasAlignedTokens,
    quoteStatus,
    olQuote: link.origWords,
    quoteWarmPending: linkWithQuote.quoteWarmPending,
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
        ${helpsCardStateClass(isSelected, isFilterSource)}

      `}
      data-helps-filter-source={isFilterSource || undefined}
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

      {(quoteChipKind === 'ol' || quoteChipKind === 'ol-pending') &&
        !obsMode &&
        link.origWords?.trim() && (
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
              &ldquo;<QuotedFilterText quote={link.origWords} filterText={filterText} />&rdquo;
            </span>
            {resourceAbbreviation && (
              <span className="ml-2 px-1.5 py-0.5 bg-surface/80 backdrop-blur rounded text-[10px] text-chip-quote-fg font-medium shrink-0">
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
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onTitleClick(link)
            }}
            className={`${HELPS_CARD_FOOTER_BUTTON_TW} flex-1 min-w-0`}
            title={`View Translation Words article: ${twTitle}`}
            aria-label={`View Translation Words article: ${twTitle}`}
          >
            <BookText className={HELPS_CARD_FOOTER_ICON} />
            {isLoadingTitle ? (
              <LoadingSpinner size="sm" label="Loading title" className="text-fg-muted" />
            ) : (
              <span className="truncate">{twTitle}</span>
            )}
          </button>
          {onFilterByTwlArticle ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onFilterByTwlArticle(link, twTitle)
              }}
              className={
                isFilterSource ? HELPS_CARD_FOOTER_ICON_BUTTON_TW_ACTIVE : HELPS_CARD_FOOTER_ICON_BUTTON_TW
              }
              aria-pressed={isFilterSource}
              title={`Filter book links: ${twTitle}`}
              aria-label={`Filter book links: ${twTitle}`}
            >
              <Filter className={HELPS_CARD_FOOTER_ICON} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
})
