import { spacerHeightPx } from '../../../../features/nav/chapterInfiniteScroll'
import { getCachedChapterLayoutHeight } from '../utils/chapterLayoutCache'
import { ChapterScrollSection } from './ChapterScrollSection'

interface ChapterScrollSpacerProps {
  fromChapter: number
  toChapter: number
  book: string
  register?: (chapter: number, el: HTMLElement | null) => void
  viewportHeightPx?: number
}

export function ChapterScrollSpacer({
  fromChapter,
  toChapter,
  book,
  register,
  viewportHeightPx,
}: ChapterScrollSpacerProps) {
  const heightPx = spacerHeightPx({
    fromChapter,
    toChapter,
    heightForChapter: (chapter) => getCachedChapterLayoutHeight(book, chapter),
    viewportHeightPx:
      viewportHeightPx ?? (typeof window !== 'undefined' ? window.innerHeight : 640),
  })

  return (
    <ChapterScrollSection
      chapter={fromChapter}
      kind="spacer"
      toChapter={toChapter}
      register={register}
      layout="spacer"
    >
      <div style={{ height: heightPx }} aria-hidden />
    </ChapterScrollSection>
  )
}
