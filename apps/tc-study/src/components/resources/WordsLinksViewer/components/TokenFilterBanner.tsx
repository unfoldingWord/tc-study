/**
 * TokenFilterBanner — inline filter scope chrome
 *
 * Compact trailing cluster for ResourceViewerHeader actions (not a dedicated row).
 * Funnel + dismissible value pill (label + in-pill ×) + match count.
 * Visible on 0 matches ("0 · all").
 */

import { Filter, X } from 'lucide-react'
import type { TokenFilter } from '../types'

interface TokenFilterBannerProps {
  tokenFilter: TokenFilter
  displayLinksCount: number
  hasMatches: boolean
  onClearFilter: () => void
}

export function TokenFilterBanner({
  tokenFilter,
  displayLinksCount,
  hasMatches,
  onClearFilter,
}: TokenFilterBannerProps) {
  const filterValue = tokenFilter.content
  // On 0-match fallback, displayLinksCount is the unfiltered length — show 0 instead.
  const matchCount = hasMatches ? displayLinksCount : 0
  const statusLabel = hasMatches
    ? `Filtering by ${filterValue}, ${matchCount} matches`
    : `Filtering by ${filterValue}, 0 matches, showing all`

  return (
    <div
      role="status"
      data-testid="helps-filter-scope-bar"
      className="inline-flex items-center gap-1 min-w-0 max-w-full"
      title={statusLabel}
      aria-label={statusLabel}
    >
      <Filter className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden />

      {/* iOS dismissible chip: value + trailing × inside the pill; funnel/count stay outside. */}
      <span
        className="inline-flex items-center gap-0.5 min-w-0 max-w-[8.5rem] rounded-full border border-accent/40 bg-accent-soft pl-2 pr-0.5 py-px text-caption font-medium text-accent-fg"
        title={filterValue}
      >
        <span className="min-w-0 truncate">{filterValue}</span>
        <button
          type="button"
          onClick={onClearFilter}
          data-testid="helps-filter-clear"
          className="group relative shrink-0 flex items-center justify-center rounded-full p-1 text-fg-muted transition-colors hover:text-fg active:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas before:absolute before:inset-1/2 before:size-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
          title="Clear filter"
          aria-label="Clear filter"
        >
          <X className="w-3 h-3 stroke-[2.25]" aria-hidden />
        </button>
      </span>

      <span
        className={`shrink-0 text-caption tabular-nums ${
          hasMatches ? 'text-fg-secondary' : 'text-fg-muted'
        }`}
        title={hasMatches ? `${matchCount} matches` : 'No matches — showing all'}
        aria-hidden
      >
        {hasMatches ? (
          matchCount
        ) : (
          <>
            <span>0</span>
            <span className="mx-0.5 opacity-50">·</span>
            <span>all</span>
          </>
        )}
      </span>
    </div>
  )
}
