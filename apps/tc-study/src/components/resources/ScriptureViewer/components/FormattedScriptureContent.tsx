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
import { ChapterScrollSection } from './ChapterScrollSection'
import { ChapterSlotChrome } from './ChapterSlotChrome'
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
      book={currentBook}
    >
      <h2
        className="text-2xl font-bold text-scripture-fg mb-4 pb-2 border-b border-border cursor-pointer hover:text-accent transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onChapterClick?.(chapterNum)
        }}
      >
        {chapterNum}
      </h2>
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
              if (slot.kind === 'paragraph' || slot.kind === 'placeholder') {
                const peeked = resourceKey
                  ? peekPreparedChapter(resourceKey, currentRef.book, slot.chapter)
                  : null
                const light =
                  peeked?.light?.blocks?.length
                    ? peeked.light
                    : buildLightChapter(viewModel, slot.chapter)
                if (light.blocks.length > 0) {
                  return (
                    <PreparedLightChapterPane
                      key={`prepared-light-${slot.chapter}`}
                      chapterNum={slot.chapter}
                      light={light}
                      registerChapter={registerChapter}
                      onChapterClick={onChapterClick}
                      onVerseClick={onVerseClick}
                      slotKind="paragraph"
                    />
                  )
                }
              }
              return (
                <ChapterSlotChrome
                  key={`${slot.kind}-${slot.chapter}-${slot.toChapter ?? slot.chapter}`}
                  slot={slot}
                  book={currentRef.book}
                  paragraphs={
                    slot.kind === 'paragraph'
                      ? paragraphsForChapter(slot.chapter)
                      : undefined
                  }
                  register={registerChapter}
                  onChapterClick={onChapterClick}
                />
              )
            }
            return (
              <FormattedChapterPane
                key={slot.chapter}
                chapterNum={slot.chapter}
                blocks={getChapterLayoutBlocks(viewModel, slot.chapter)}
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
                <h2
                  className="text-2xl font-bold text-scripture-fg mb-4 pb-2 border-b border-border cursor-pointer hover:text-accent transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChapterClick?.(chapterNum)
                  }}
                >
                  {chapterNum}
                </h2>
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
