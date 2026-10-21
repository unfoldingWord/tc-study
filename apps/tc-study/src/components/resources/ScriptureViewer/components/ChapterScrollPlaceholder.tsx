import { MarkdownSkeleton } from '../../../ui/MarkdownRenderer'
import {
  placeholderHeightPx,
} from '../../../../features/nav/chapterInfiniteScroll'
import { getCachedChapterLayoutHeight } from '../utils/chapterLayoutCache'
import { ChapterScrollSection } from './ChapterScrollSection'

interface ChapterScrollPlaceholderProps {
  chapter: number
  book: string
  register?: (chapter: number, el: HTMLElement | null) => void
  viewportHeightPx?: number
}

export function ChapterScrollPlaceholder({
  chapter,
  book,
  register,
  viewportHeightPx,
}: ChapterScrollPlaceholderProps) {
  const minHeightPx = placeholderHeightPx({
    cachedHeightPx: getCachedChapterLayoutHeight(book, chapter),
    viewportHeightPx:
      viewportHeightPx ?? (typeof window !== 'undefined' ? window.innerHeight : 640),
  })

  return (
    <ChapterScrollSection
      chapter={chapter}
      kind="placeholder"
      register={register}
      className="space-y-3"
      layout="placeholder"
    >
      <div
        className="text-2xl font-bold text-scripture-fg/30 mb-4 pb-2 border-b border-border"
        aria-hidden
      >
        {chapter}
      </div>
      <div className="space-y-3 py-1" style={{ minHeight: minHeightPx }} aria-hidden>
        <MarkdownSkeleton className="text-base leading-relaxed" />
      </div>
    </ChapterScrollSection>
  )
}
