import { ChapterHeading } from './ChapterHeading'
import { ChapterScrollSection } from './ChapterScrollSection'

interface ChapterParagraphPaneProps {
  chapter: number
  paragraphs: string[]
  register?: (chapter: number, el: HTMLElement | null) => void
  onChapterClick?: (chapter: number) => void
}

export function ChapterParagraphPane({
  chapter,
  paragraphs,
  register,
  onChapterClick,
}: ChapterParagraphPaneProps) {
  return (
    <ChapterScrollSection
      chapter={chapter}
      kind="paragraph"
      register={register}
      className="space-y-0.5"
      layout="paragraph"
    >
      <ChapterHeading chapter={chapter} onChapterClick={onChapterClick} />
      {paragraphs.map((text, index) => (
        <p key={`${chapter}-p-${index}`} className="leading-relaxed text-lg text-scripture-fg mb-3">
          {text}
        </p>
      ))}
    </ChapterScrollSection>
  )
}
