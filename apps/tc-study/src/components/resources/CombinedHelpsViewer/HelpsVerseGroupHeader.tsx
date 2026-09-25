import { BookOpen } from 'lucide-react'
import { forwardRef } from 'react'
import { formatVerseRefParts } from '../../../utils/bookNames'
import {
  HELPS_VERSE_COUNT,
  HELPS_VERSE_HEADER,
  HELPS_VERSE_HEADER_ICON,
  HELPS_VERSE_HEADER_STICKY,
} from '../helpsCardStyles'

export interface HelpsVerseGroupHeaderProps {
  bookTitle: string
  chapterVerse: string
  count?: number
  languageDirection: 'ltr' | 'rtl'
  sticky?: boolean
  /** Inline label for compact chrome — no chip fill, no count. */
  bare?: boolean
  showCount?: boolean
  testId?: string
}

export const HelpsVerseGroupHeader = forwardRef<HTMLDivElement, HelpsVerseGroupHeaderProps>(
  function HelpsVerseGroupHeader(
    {
      bookTitle,
      chapterVerse,
      count,
      languageDirection,
      sticky = false,
      bare = false,
      showCount = !bare,
      testId,
    },
    ref
  ) {
    const isRtl = languageDirection === 'rtl'
    const { bookPart, numberPart } = formatVerseRefParts(bookTitle, chapterVerse, isRtl)
    const label = `${bookPart} ${numberPart}`
    const className = bare
      ? 'flex items-center gap-chrome-tight min-w-0'
      : sticky
        ? HELPS_VERSE_HEADER_STICKY
        : HELPS_VERSE_HEADER

    return (
      <div
        ref={ref}
        className={className}
        dir={languageDirection}
        data-testid={testId}
        title={label}
        aria-label={showCount && count != null ? `${label}, ${count}` : label}
      >
        <BookOpen className={HELPS_VERSE_HEADER_ICON} aria-hidden />
        <h3 className="text-chrome font-semibold text-fg-secondary truncate">
          {isRtl ? (
            <span className="inline-flex flex-row-reverse gap-1" dir="rtl">
              <span>{numberPart}</span>
              <span>{bookPart}</span>
            </span>
          ) : (
            <span className="inline-flex gap-1" dir="ltr">
              <span>{bookPart}</span>
              <span>{numberPart}</span>
            </span>
          )}
        </h3>
        {showCount && count != null ? <span className={HELPS_VERSE_COUNT}>{count}</span> : null}
      </div>
    )
  }
)
