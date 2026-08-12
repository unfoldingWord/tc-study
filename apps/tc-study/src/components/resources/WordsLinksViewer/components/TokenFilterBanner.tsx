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
      className="inline-flex items-center gap-chrome-tight min-w-0 max-w-full"
      title={statusLabel}
      aria-label={statusLabel}
    >
      <Filter className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden />

      {/* Borderless filter capsule: filter-chip fill pops on surface headers (accent-soft does not). */}
      <span
        className="inline-flex items-center gap-0.5 min-w-0 max-w-[10rem] h-7 rounded-full bg-filter-chip pl-2.5 pr-1 text-chrome font-medium text-filter-chip-fg"
        title={filterValue}
      >
        <span className="min-w-0 truncate leading-none">{filterValue}</span>
        <button
          type="button"
          onClick={onClearFilter}
          data-testid="helps-filter-clear"
          className="relative shrink-0 flex items-center justify-center rounded-full p-chrome-tight text-filter-chip-fg/70 transition-colors hover:bg-accent/15 hover:text-filter-chip-fg active:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas before:absolute before:inset-1/2 before:size-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
          title="Clear filter"
          aria-label="Clear filter"
        >
          <X className="w-3.5 h-3.5 stroke-[2.25]" aria-hidden />
        </button>
      </span>

      <span
        className={`shrink-0 text-chrome tabular-nums ${
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
