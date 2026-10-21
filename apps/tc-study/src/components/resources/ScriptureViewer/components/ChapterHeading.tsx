interface ChapterHeadingProps {
  chapter: number
  onChapterClick?: (chapter: number) => void
}

/** Chapter number heading shared by every chapter pane; click selects the chapter. */
export function ChapterHeading({ chapter, onChapterClick }: ChapterHeadingProps) {
  return (
    <h2
      className="text-2xl font-bold text-scripture-fg mb-4 pb-2 border-b border-border cursor-pointer hover:text-accent transition-colors"
      onClick={(e) => {
        e.stopPropagation()
        onChapterClick?.(chapter)
      }}
    >
      {chapter}
    </h2>
  )
}
