import type { UsjVerseBlockItem, UsjWordToken } from '@bt-synergy/scripture-loader'
import { memo } from 'react'
import type { BCVReference } from '../../../../contexts/types-only'
import type { DisplayUsjVerse, OriginalLanguageToken } from '../types'
import { ChapterHeading } from './ChapterHeading'
import { ChapterScrollSection } from './ChapterScrollSection'
import { FormattedBlockRenderer } from './FormattedBlockRenderer'
import { VerseRenderer } from './VerseRenderer'

interface VerseBlockItemsProps {
  chapterNum: number
  items: UsjVerseBlockItem[]
  /** Verses of this chapter; items are matched by verse number. */
  verses: DisplayUsjVerse[]
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  onScriptureRefClick?: (ref: BCVReference) => void
  currentBook: string
  isOriginalLanguage: boolean
}

interface VerseBlockChapterPaneProps extends VerseBlockItemsProps {
  registerChapter?: (chapter: number, el: HTMLElement | null) => void
  onChapterClick?: (chapter: number) => void
}

/** One verse per block, with headings / breaks as chrome between them. */
export function VerseBlockItems({
  chapterNum,
  items,
  verses,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
  onScriptureRefClick,
  currentBook,
  isOriginalLanguage,
}: VerseBlockItemsProps) {
  const verseByNumber = new Map<number, DisplayUsjVerse>()
  for (const verse of verses) verseByNumber.set(verse.number, verse)

  return (
    <>
      {items.map((item, idx) => {
        if (item.kind === 'chrome') {
          return (
            <FormattedBlockRenderer
              key={`chrome-${chapterNum}-${item.block.marker}-${idx}`}
              block={item.block}
              blockIndex={idx}
              highlightTarget={highlightTarget}
              underlinedSemanticIds={underlinedSemanticIds}
              onTokenClick={onTokenClick}
              onVerseClick={onVerseClick}
              onScriptureRefClick={onScriptureRefClick}
              currentBook={currentBook}
              isOriginalLanguage={isOriginalLanguage}
            />
          )
        }
        const verse = verseByNumber.get(item.verse)
        if (!verse) return null
        return (
          <VerseRenderer
            key={`${item.chapter}:${item.verse}`}
            verse={verse}
            chapterNumber={item.chapter}
            displayInline={item.displayInline}
            highlightTarget={highlightTarget}
            underlinedSemanticIds={underlinedSemanticIds}
            onTokenClick={onTokenClick}
            onVerseClick={onVerseClick}
            onScriptureRefClick={onScriptureRefClick}
            currentBook={currentBook}
            isOriginalLanguage={isOriginalLanguage}
          />
        )
      })}
    </>
  )
}

export const VerseBlockChapterPane = memo(function VerseBlockChapterPane({
  registerChapter,
  onChapterClick,
  ...itemsProps
}: VerseBlockChapterPaneProps) {
  return (
    <ChapterScrollSection
      chapter={itemsProps.chapterNum}
      kind="rendered"
      register={registerChapter}
      className="space-y-1"
      layout="verse-block"
      book={itemsProps.currentBook}
    >
      <ChapterHeading chapter={itemsProps.chapterNum} onChapterClick={onChapterClick} />
      <VerseBlockItems {...itemsProps} />
    </ChapterScrollSection>
  )
})
