/**
 * TokenFilterBanner — iOS-style filter scope bar
 *
 * Compact chrome row (~32px) for active token / verse / OBS filters:
 * funnel icon + value pill + match count + large clear control.
 * Stays visible on 0 matches (shows "0 · all").
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
      className="h-8 min-h-8 max-h-8 px-chrome flex items-center gap-chrome-tight border-b border-border-subtle bg-surface"
      title={statusLabel}
      aria-label={statusLabel}
    >
      <Filter className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden />

      <span
        className="inline-flex items-center min-w-0 max-w-[45%] truncate rounded-full border border-accent/40 bg-accent-soft px-2 py-px text-caption font-medium text-accent-fg"
        title={filterValue}
      >
        <span className="truncate">{filterValue}</span>
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

      <div className="flex-1 min-w-0" />

      {/* Visual circle is tight; hit target ≥40px via size-10 + slight overhang. */}
      <button
        type="button"
        onClick={onClearFilter}
        data-testid="helps-filter-clear"
        className="group shrink-0 relative -my-1 -mr-1 flex size-10 items-center justify-center rounded-full text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
        title="Clear filter"
        aria-label="Clear filter"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-accent shadow-sm transition-colors group-hover:bg-accent-hover group-active:bg-accent-hover">
          <X className="w-4 h-4 stroke-[2.5]" aria-hidden />
        </span>
      </button>
    </div>
  )
}
