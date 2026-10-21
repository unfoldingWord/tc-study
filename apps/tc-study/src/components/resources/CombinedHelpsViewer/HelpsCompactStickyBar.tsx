import type { ReactNode } from 'react'
import { HELPS_COMPACT_STICKY_BAR } from '../helpsCardStyles'
import { HelpsVerseGroupHeader } from './HelpsVerseGroupHeader'

export interface HelpsCompactStickyBarProps {
  bookTitle: string
  chapterVerse: string | null
  fallbackLabel: string
  languageDirection: 'ltr' | 'rtl'
  /** Active token / verse / support-ref / OBS chip — omit when none. */
  filterSlot?: ReactNode
  actions: ReactNode
}

/** One slim CombinedHelps chrome row: current ref + optional filter + icon actions. */
export function HelpsCompactStickyBar({
  bookTitle,
  chapterVerse,
  fallbackLabel,
  languageDirection,
  filterSlot,
  actions,
}: HelpsCompactStickyBarProps) {
  const hasRef = !!chapterVerse

  return (
    <div
      className={HELPS_COMPACT_STICKY_BAR}
      data-testid="helps-sticky-current-ref"
      aria-live="polite"
      dir={languageDirection}
    >
      <div className="flex items-center justify-between gap-1 min-w-0 max-w-2xl mx-auto w-full">
        {hasRef ? (
          <HelpsVerseGroupHeader
            bookTitle={bookTitle}
            chapterVerse={chapterVerse}
            languageDirection={languageDirection}
            bare
          />
        ) : fallbackLabel ? (
          <span
            className="text-chrome font-semibold text-fg-secondary truncate"
            title={fallbackLabel}
          >
            {fallbackLabel}
          </span>
        ) : (
          <span className="min-w-0" />
        )}
        <div className="flex items-center justify-end gap-1 min-w-0 shrink">
          {filterSlot ?? null}
          {actions}
        </div>
      </div>
    </div>
  )
}
