import {
  buildUsjLayoutBlocks,
  filterUsjLayoutBlocks,
  type UsjLayoutBlock,
  type UsjScriptureViewModel,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import { memo, useMemo } from 'react'
import type { BCVReference, ReferenceState } from '../../../../contexts/types-only'
import type { ChapterSlot } from '../../../../features/nav/chapterInfiniteScroll'
import {
  paragraphsFromLightChapter,
  peekPreparedChapter,
} from '../../../../features/scripture/preparedChapterCache'
import { buildLightChapter } from '../../../../features/scripture/scripturePreparer'
import type { OriginalLanguageToken } from '../types'
import { getChapterLayoutBlocks, getChapterParagraphs } from '../utils/chapterLayoutCache'
import { chaptersForRef, includeVerseForRef } from '../utils/scriptureNavRange'
import { ChapterHeading } from './ChapterHeading'
import { ChapterParagraphPane } from './ChapterParagraphPane'
import { ChapterScrollSection } from './ChapterScrollSection'
import { FormattedBlockRenderer } from './FormattedBlockRenderer'
import { PreparedLightChapterPane } from './PreparedLightChapterPane'

interface FormattedScriptureContentProps {
  viewModel: UsjScriptureViewModel
  resourceKey?: string
  currentRef: ReferenceState
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  onChapterClick?: (chapter: number) => void
  onScriptureRefClick?: (ref: BCVReference) => void
  isOriginalLanguage: boolean
  displayChapters?: number[] | null
  chapterSlots?: ChapterSlot[] | null
  registerChapter?: (chapter: number, el: HTMLElement | null) => void
}

interface FormattedChapterPaneProps {
  chapterNum: number
  blocks: UsjLayoutBlock[]
  registerChapter?: (chapter: number, el: HTMLElement | null) => void
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  onChapterClick?: (chapter: number) => void
  onScriptureRefClick?: (ref: BCVReference) => void
  currentBook: string
  isOriginalLanguage: boolean
}

const FormattedChapterPane = memo(function FormattedChapterPane({
  chapterNum,
  blocks,
  registerChapter,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
  onChapterClick,
  onScriptureRefClick,
  currentBook,
  isOriginalLanguage,
}: FormattedChapterPaneProps) {
  if (blocks.length === 0) return null
  return (
    <ChapterScrollSection
      chapter={chapterNum}
      kind="rendered"
      register={registerChapter}
      layout="formatted"
      book={currentBook}
    >
      <ChapterHeading chapter={chapterNum} onChapterClick={onChapterClick} />
      {blocks.map((block, idx) => (
        <FormattedBlockRenderer
          key={`${chapterNum}-${block.marker}-${idx}`}
          block={block}
          blockIndex={idx}
          highlightTarget={highlightTarget}
          underlinedSemanticIds={underlinedSemanticIds}
          onTokenClick={onTokenClick}
          onVerseClick={onVerseClick}
          onScriptureRefClick={onScriptureRefClick}
          currentBook={currentBook}
          isOriginalLanguage={isOriginalLanguage}
        />
      ))}
    </ChapterScrollSection>
  )
})

export function FormattedScriptureContent({
  viewModel,
  resourceKey = '',
  currentRef,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
  onChapterClick,
  onScriptureRefClick,
  isOriginalLanguage,
  displayChapters: _displayChapters,
  chapterSlots,
  registerChapter,
}: FormattedScriptureContentProps) {
  const slots = chapterSlots && chapterSlots.length > 0 ? chapterSlots : null
  const slotsActive = slots != null
  const chapters = useMemo(() => chaptersForRef(currentRef), [currentRef])
  const includeVerse = useMemo(() => includeVerseForRef(currentRef), [currentRef])

  const paragraphsForChapter = (chapter: number): string[] => {
    if (resourceKey) {
      const peeked = peekPreparedChapter(resourceKey, currentRef.book, chapter)
      const fromLight = paragraphsFromLightChapter(peeked?.light)
      if (fromLight.length > 0) return fromLight
    }
    return getChapterParagraphs(viewModel, chapter)
  }
  /** Light text (or plain paragraphs) while a chapter has no formatted blocks to paint. */
  const lightOrParagraphPane = (
    chapter: number,
    slotKind: 'paragraph' | 'rendered',
    lightKey: string,
    paragraphKey: string
  ) => {
    const peeked = resourceKey ? peekPreparedChapter(resourceKey, currentRef.book, chapter) : null
    const light = peeked?.light?.blocks?.length ? peeked.light : buildLightChapter(viewModel, chapter)
    if (light.blocks.length > 0) {
      return (
        <PreparedLightChapterPane
          key={lightKey}
          chapterNum={chapter}
          light={light}
          registerChapter={registerChapter}
          onChapterClick={onChapterClick}
          onVerseClick={onVerseClick}
          slotKind={slotKind}
        />
      )
    }
    return (
      <ChapterParagraphPane
        key={paragraphKey}
        chapter={chapter}
        paragraphs={paragraphsForChapter(chapter)}
        register={registerChapter}
        onChapterClick={onChapterClick}
      />
    )
  }
  const blocksByChapter = useMemo(() => {
    if (slotsActive) return null
    const all = buildUsjLayoutBlocks(viewModel.usj, viewModel)
    const filtered = filterUsjLayoutBlocks(all, {
      chapters,
      includeVerse,
    })

    const grouped = new Map<number, typeof filtered>()
    for (const block of filtered) {
      const ch = block.chapterNumber || currentRef.chapter
      if (!grouped.has(ch)) grouped.set(ch, [])
      grouped.get(ch)!.push(block)
    }
    return grouped
  }, [slotsActive, viewModel, chapters, includeVerse, currentRef.chapter])

  return (
    <div className="space-y-6" data-scripture-layout="formatted">
      {slotsActive && slots
        ? slots.map((slot) => {
            if (slot.kind !== 'rendered') {
              return lightOrParagraphPane(
                slot.chapter,
                'paragraph',
                `prepared-light-${slot.chapter}`,
                `paragraph-${slot.chapter}-${slot.chapter}`
              )
            }
            const blocks = getChapterLayoutBlocks(viewModel, slot.chapter)
            if (blocks.length === 0) {
              // Stack chapter not yet in the paint viewModel — keep light text.
              return lightOrParagraphPane(
                slot.chapter,
                'rendered',
                `prepared-light-pending-${slot.chapter}`,
                `pending-formatted-${slot.chapter}`
              )
            }
            return (
              <FormattedChapterPane
                key={slot.chapter}
                chapterNum={slot.chapter}
                blocks={blocks}
                registerChapter={registerChapter}
                highlightTarget={highlightTarget}
                underlinedSemanticIds={underlinedSemanticIds}
                onTokenClick={onTokenClick}
                onVerseClick={onVerseClick}
                onChapterClick={onChapterClick}
                onScriptureRefClick={onScriptureRefClick}
                currentBook={currentRef.book}
                isOriginalLanguage={isOriginalLanguage}
              />
            )
          })
        : chapters.map((chapterNum) => {
            const blocks = blocksByChapter?.get(chapterNum) ?? []
            if (blocks.length === 0) return null
            return (
              <div key={chapterNum} className="space-y-0.5">
                <ChapterHeading chapter={chapterNum} onChapterClick={onChapterClick} />
                {blocks.map((block, idx) => (
                  <FormattedBlockRenderer
                    key={`${chapterNum}-${block.marker}-${idx}`}
                    block={block}
                    blockIndex={idx}
                    highlightTarget={highlightTarget}
                    underlinedSemanticIds={underlinedSemanticIds}
                    onTokenClick={onTokenClick}
                    onVerseClick={onVerseClick}
                    onScriptureRefClick={onScriptureRefClick}
                    currentBook={currentRef.book}
                    isOriginalLanguage={isOriginalLanguage}
                  />
                ))}
              </div>
            )
          })}
    </div>
  )
}
