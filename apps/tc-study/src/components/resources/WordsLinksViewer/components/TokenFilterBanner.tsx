/**
 * TokenFilterBanner — inline filter scope chrome
 *
 * Compact trailing cluster for ResourceViewerHeader actions (not a dedicated row).
 * Funnel + value pill + match count + medium clear. Visible on 0 matches ("0 · all").
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

      <span
        className="inline-flex items-center min-w-0 max-w-[7.5rem] truncate rounded-full border border-accent/40 bg-accent-soft px-2 py-px text-caption font-medium text-accent-fg"
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

      {/* ~30px soft accent control; ≥40px hit via invisible before — no solid orb. */}
      <button
        type="button"
        onClick={onClearFilter}
        data-testid="helps-filter-clear"
        className="group relative shrink-0 flex size-[30px] items-center justify-center rounded-full border border-accent/50 bg-accent-soft text-accent-fg transition-colors hover:border-accent hover:bg-accent hover:text-surface active:border-accent active:bg-accent active:text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas before:absolute before:inset-1/2 before:size-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
        title="Clear filter"
        aria-label="Clear filter"
      >
        <X className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden />
      </button>
    </div>
  )
}
