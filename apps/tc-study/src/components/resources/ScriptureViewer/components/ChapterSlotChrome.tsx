import type { ChapterSlot } from '../../../../features/nav/chapterInfiniteScroll'
import { ChapterParagraphPane } from './ChapterParagraphPane'
import { ChapterScrollPlaceholder } from './ChapterScrollPlaceholder'
import { ChapterScrollSpacer } from './ChapterScrollSpacer'

interface ChapterSlotChromeProps {
  slot: ChapterSlot
  book: string
  paragraphs?: string[]
  register?: (chapter: number, el: HTMLElement | null) => void
  onChapterClick?: (chapter: number) => void
  viewportHeightPx?: number
}

/** Placeholder, spacer, or paragraph-phase pane — never token trees. */
export function ChapterSlotChrome({
  slot,
  book,
  paragraphs,
  register,
  onChapterClick,
  viewportHeightPx,
}: ChapterSlotChromeProps) {
  if (slot.kind === 'spacer') {
    return (
      <ChapterScrollSpacer
        fromChapter={slot.chapter}
        toChapter={slot.toChapter ?? slot.chapter}
        book={book}
        register={register}
        viewportHeightPx={viewportHeightPx}
      />
    )
  }
  if (slot.kind === 'placeholder') {
    return (
      <ChapterScrollPlaceholder
        chapter={slot.chapter}
        book={book}
        register={register}
        viewportHeightPx={viewportHeightPx}
      />
    )
  }
  if (slot.kind === 'paragraph') {
    return (
      <ChapterParagraphPane
        chapter={slot.chapter}
        paragraphs={paragraphs ?? []}
        register={register}
        onChapterClick={onChapterClick}
      />
    )
  }
  return null
}
