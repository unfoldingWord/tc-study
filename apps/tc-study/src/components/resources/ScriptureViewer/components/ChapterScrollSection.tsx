import type { CSSProperties, ReactNode } from 'react'
import type { ChapterSlotKind } from '../../../../features/nav/chapterInfiniteScroll'
import { getCachedChapterLayoutHeight } from '../utils/chapterLayoutCache'

interface ChapterScrollSectionProps {
  chapter: number
  kind?: ChapterSlotKind
  toChapter?: number
  register?: (chapter: number, el: HTMLElement | null) => void
  children: ReactNode
  className?: string
  layout?: string
  book?: string
}

export function ChapterScrollSection({
  chapter,
  kind = 'rendered',
  toChapter,
  register,
  children,
  className = 'space-y-0.5',
  layout,
  book,
}: ChapterScrollSectionProps) {
  const measured = book ? getCachedChapterLayoutHeight(book, chapter) : null
  const style: CSSProperties | undefined =
    measured != null && measured > 8
      ? {
          contentVisibility: 'auto',
          containIntrinsicSize: `auto ${measured}px`,
        }
      : undefined

  return (
    <section
      ref={(el) => register?.(chapter, el)}
      data-chapter-section={chapter}
      data-chapter-kind={kind}
      data-chapter-spacer-from={kind === 'spacer' ? chapter : undefined}
      data-chapter-spacer-to={kind === 'spacer' ? (toChapter ?? chapter) : undefined}
      data-scripture-layout={layout}
      className={className}
      style={style}
    >
      <div data-chapter-edge="start" data-chapter={chapter} aria-hidden className="h-px" />
      {children}
      <div data-chapter-edge="end" data-chapter={chapter} aria-hidden className="h-px" />
    </section>
  )
}
