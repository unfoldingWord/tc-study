/**
 * Render a light prepared scripture chapter (text + verse markers, no tokens).
 */

import { memo } from 'react'
import type {
  LightBlock,
  LightInline,
  ScriptureLightChapter,
} from '../../../../features/scripture/scripturePreparer'
import {
  blockClassForMarker,
  SCRIPTURE_VERSE_NUMBER_CLASS,
} from '../utils/paraStyles'
import { ChapterScrollSection } from './ChapterScrollSection'

interface PreparedLightChapterPaneProps {
  chapterNum: number
  light: ScriptureLightChapter
  registerChapter?: (chapter: number, el: HTMLElement | null) => void
  onChapterClick?: (chapter: number) => void
  onVerseClick?: (chapter: number, verse: number) => void
  /** Slot kind for scroll registration — paragraph phase vs pending rendered. */
  slotKind?: 'paragraph' | 'rendered'
}

function renderInline(
  item: LightInline,
  onVerseClick?: (chapter: number, verse: number) => void
): React.ReactNode {
  switch (item.kind) {
    case 'verse':
      return (
        <span
          className={SCRIPTURE_VERSE_NUMBER_CLASS}
          onClick={(e) => {
            e.stopPropagation()
            onVerseClick?.(item.chapterNumber, item.verseNumber)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onVerseClick?.(item.chapterNumber, item.verseNumber)
            }
          }}
          aria-label={`Verse ${item.verseNumber}`}
        >
          {item.verseNumber}{' '}
        </span>
      )
    case 'text':
      return item.text
    case 'heading':
      return <span className="font-semibold">{item.text}</span>
    case 'note':
    case 'xref':
      return (
        <sup className="text-accent cursor-help" title={item.text}>
          {item.caller}
        </sup>
      )
    default:
      return null
  }
}

function BlockView({
  block,
  onVerseClick,
}: {
  block: LightBlock
  onVerseClick?: (chapter: number, verse: number) => void
}) {
  const className = blockClassForMarker(block.marker, block.role, block.indentLevel)

  if (block.role === 'break' || block.marker === 'b') {
    return <div className={className} data-usj-marker={block.marker} aria-hidden />
  }

  const nodes: React.ReactNode[] = []
  block.inline.forEach((item, idx) => {
    nodes.push(<span key={idx}>{renderInline(item, onVerseClick)}</span>)
  })

  const Tag = block.role === 'heading' || block.role === 'intro' ? 'h3' : 'p'
  return (
    <Tag
      className={className}
      data-usj-marker={block.marker}
      data-usj-role={block.role}
    >
      {nodes}
    </Tag>
  )
}

export const PreparedLightChapterPane = memo(function PreparedLightChapterPane({
  chapterNum,
  light,
  registerChapter,
  onChapterClick,
  onVerseClick,
  slotKind = 'paragraph',
}: PreparedLightChapterPaneProps) {
  return (
    <ChapterScrollSection
      chapter={chapterNum}
      kind={slotKind}
      register={registerChapter}
      layout="paragraph"
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
      <div className="space-y-0.5" data-scripture-layout="prepared-light">
        {light.blocks.map((block, idx) => (
          <BlockView
            key={`${chapterNum}-${block.marker}-${idx}`}
            block={block}
            onVerseClick={onVerseClick}
          />
        ))}
      </div>
    </ChapterScrollSection>
  )
})
