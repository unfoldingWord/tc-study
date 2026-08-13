import {
  buildUsjLayoutBlocks,
  filterUsjLayoutBlocks,
  type UsjScriptureViewModel,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import { useMemo } from 'react'
import type { ReferenceState } from '../../../../contexts/types-only'
import type { OriginalLanguageToken } from '../types'
import { FormattedBlockRenderer } from './FormattedBlockRenderer'

interface FormattedScriptureContentProps {
  viewModel: UsjScriptureViewModel
  currentRef: ReferenceState
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  onChapterClick?: (chapter: number) => void
  isOriginalLanguage: boolean
}

export function FormattedScriptureContent({
  viewModel,
  currentRef,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
  onChapterClick,
  isOriginalLanguage,
}: FormattedScriptureContentProps) {
  const startChapter = currentRef.chapter
  const endChapter = currentRef.endChapter || startChapter
  const startVerse = currentRef.verse
  const endVerse =
    currentRef.endVerse || (startChapter === endChapter ? startVerse : undefined)

  const chapters = useMemo(() => {
    const list: number[] = []
    for (let c = startChapter; c <= endChapter; c++) list.push(c)
    return list
  }, [startChapter, endChapter])

  const blocksByChapter = useMemo(() => {
    const all = buildUsjLayoutBlocks(viewModel.usj, viewModel)
    const filtered = filterUsjLayoutBlocks(all, {
      chapters,
      includeVerse: (chapter, verse) => {
        let chapterStart = 1
        let chapterEnd = 999
        if (chapter === startChapter) chapterStart = startVerse
        if (chapter === endChapter && endVerse !== undefined) chapterEnd = endVerse
        return verse >= chapterStart && verse <= chapterEnd
      },
    })

    const grouped = new Map<number, typeof filtered>()
    for (const block of filtered) {
      const ch = block.chapterNumber || startChapter
      if (!grouped.has(ch)) grouped.set(ch, [])
      grouped.get(ch)!.push(block)
    }
    return grouped
  }, [viewModel, chapters, startChapter, endChapter, startVerse, endVerse])

  return (
    <div className="space-y-6" data-scripture-layout="formatted">
      {chapters.map((chapterNum) => {
        const blocks = blocksByChapter.get(chapterNum) ?? []
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
                isOriginalLanguage={isOriginalLanguage}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
