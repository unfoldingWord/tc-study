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
      <h2
        className="text-2xl font-bold text-scripture-fg mb-4 pb-2 border-b border-border cursor-pointer hover:text-accent transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onChapterClick?.(chapter)
        }}
      >
        {chapter}
      </h2>
      {paragraphs.map((text, index) => (
        <p key={`${chapter}-p-${index}`} className="leading-relaxed text-lg text-scripture-fg mb-3">
          {text}
        </p>
      ))}
    </ChapterScrollSection>
  )
}
