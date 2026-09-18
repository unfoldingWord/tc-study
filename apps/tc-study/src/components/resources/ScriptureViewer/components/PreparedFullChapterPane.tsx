/**
 * Render a full prepared scripture chapter with interned token identity.
 * Paint uses integer matchKeys indices — no NFD on the hot path.
 */

import { Fragment, memo, useMemo } from 'react'
import type { UsjWordToken } from '@bt-synergy/scripture-loader'
import {
  highlightIndicesFromTarget,
  resolveTokenVisualStateInterned,
} from '../utils/tokenHighlight'
import { mapUnderlinesToIndices } from '../hooks/useUnderlinedTokens'
import type { OriginalLanguageToken } from '../types'
import type {
  FullBlock,
  FullInline,
  InternedToken,
  ScriptureFullChapter,
} from '../../../../features/scripture/scripturePreparer'
import { ChapterScrollSection } from './ChapterScrollSection'
import {
  blockClassForMarker,
  SCRIPTURE_VERSE_NUMBER_CLASS,
} from '../utils/paraStyles'

interface PreparedFullChapterPaneProps {
  chapterNum: number
  full: ScriptureFullChapter
  book: string
  registerChapter?: (chapter: number, el: HTMLElement | null) => void
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onInternedTokenClick: (
    verseRef: string,
    token: InternedToken,
    matchKeys: readonly string[]
  ) => void
  onChapterClick?: (chapter: number) => void
  onVerseClick?: (chapter: number, verse: number) => void
  isOriginalLanguage: boolean
}

function verseRefFor(book: string, chapter: number, verse: number): string {
  return `${book} ${chapter}:${verse}`
}

/** Same spacing rules as shouldInsertSpaceBeforeInline, for FullInline tokens. */
function needsSpaceBeforeFullInline(
  prev: FullInline | undefined,
  next: FullInline
): boolean {
  if (!prev || next.kind !== 'token') return false
  if (prev.kind === 'text' || prev.kind === 'heading') return !/\s$/.test(prev.text)
  return (
    prev.kind === 'verse' ||
    prev.kind === 'token' ||
    prev.kind === 'note' ||
    prev.kind === 'xref'
  )
}

const InternedTokenSpan = memo(function InternedTokenSpan({
  token,
  verseRef,
  matchKeys,
  visual,
  onClick,
}: {
  token: InternedToken
  verseRef: string
  matchKeys: readonly string[]
  visual: { isHighlighted: boolean; isSelected: boolean; isUnderlined: boolean }
  onClick: (verseRef: string, token: InternedToken, matchKeys: readonly string[]) => void
}) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        onClick(verseRef, token, matchKeys)
      }}
      data-token-semantic-id={matchKeys[token.k]}
      data-highlighted={visual.isHighlighted || visual.isSelected ? 'true' : undefined}
      data-underlined={visual.isUnderlined ? 'true' : undefined}
      className={`rounded cursor-pointer hover:bg-muted text-scripture-fg${
        visual.isHighlighted || visual.isSelected ? ' bg-highlight highlighted-token scroll-mt-12' : ''
      }${
        visual.isUnderlined
          ? ' underline decoration-dotted decoration-underline decoration-1 underline-offset-3'
          : ''
      }`}
    >
      {token.c}
    </span>
  )
})

function renderInline(
  item: FullInline,
  ctx: {
    book: string
    chapter: number
    currentVerse: number
    matchKeys: readonly string[]
    underlineIndices: Set<number>
    highlightOwnIndex: number | null
    highlightAlignedIndices: Set<number>
    isOriginalLanguage: boolean
    onInternedTokenClick: PreparedFullChapterPaneProps['onInternedTokenClick']
    onVerseClick?: (chapter: number, verse: number) => void
  }
): React.ReactNode {
  switch (item.kind) {
    case 'verse':
      return (
        <span
          key={`v-${item.chapterNumber}-${item.verseNumber}`}
          className={SCRIPTURE_VERSE_NUMBER_CLASS}
          onClick={(e) => {
            e.stopPropagation()
            ctx.onVerseClick?.(item.chapterNumber, item.verseNumber)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              ctx.onVerseClick?.(item.chapterNumber, item.verseNumber)
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
    case 'token': {
      const visual = resolveTokenVisualStateInterned(item.token, {
        underlineIndices: ctx.underlineIndices,
        highlightOwnIndex: ctx.highlightOwnIndex,
        highlightAlignedIndices: ctx.highlightAlignedIndices,
        isOriginalLanguage: ctx.isOriginalLanguage,
      })
      const ref = verseRefFor(ctx.book, ctx.chapter, ctx.currentVerse)
      return (
        <InternedTokenSpan
          key={`t-${item.token.k}-${item.token.o}-${ctx.currentVerse}`}
          token={item.token}
          verseRef={ref}
          matchKeys={ctx.matchKeys}
          visual={visual}
          onClick={ctx.onInternedTokenClick}
        />
      )
    }
    default:
      return null
  }
}

function BlockView({
  block,
  book,
  matchKeys,
  underlineIndices,
  highlightOwnIndex,
  highlightAlignedIndices,
  isOriginalLanguage,
  onInternedTokenClick,
  onVerseClick,
}: {
  block: FullBlock
  book: string
  matchKeys: readonly string[]
  underlineIndices: Set<number>
  highlightOwnIndex: number | null
  highlightAlignedIndices: Set<number>
  isOriginalLanguage: boolean
  onInternedTokenClick: PreparedFullChapterPaneProps['onInternedTokenClick']
  onVerseClick?: (chapter: number, verse: number) => void
}) {
  let currentVerse = block.verseNumbers[0] ?? 1
  const className = blockClassForMarker(block.marker, block.role, block.indentLevel)

  if (block.role === 'break' || block.marker === 'b') {
    return <div className={className} data-usj-marker={block.marker} aria-hidden />
  }

  const nodes: React.ReactNode[] = []
  block.inline.forEach((item, idx) => {
    if (item.kind === 'verse') currentVerse = item.verseNumber
    const space = needsSpaceBeforeFullInline(block.inline[idx - 1], item) ? ' ' : null
    nodes.push(
      <Fragment key={idx}>
        {space}
        {renderInline(item, {
          book,
          chapter: block.chapterNumber,
          currentVerse,
          matchKeys,
          underlineIndices,
          highlightOwnIndex,
          highlightAlignedIndices,
          isOriginalLanguage,
          onInternedTokenClick,
          onVerseClick,
        })}
      </Fragment>
    )
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

export const PreparedFullChapterPane = memo(function PreparedFullChapterPane({
  chapterNum,
  full,
  book,
  registerChapter,
  highlightTarget,
  underlinedSemanticIds,
  onInternedTokenClick,
  onChapterClick,
  onVerseClick,
  isOriginalLanguage,
}: PreparedFullChapterPaneProps) {
  const underlineIndices = useMemo(
    () => mapUnderlinesToIndices(full.matchKeys, underlinedSemanticIds ?? new Set()),
    [full.matchKeys, underlinedSemanticIds]
  )
  const highlight = useMemo(
    () => highlightIndicesFromTarget(full.matchKeys, highlightTarget),
    [full.matchKeys, highlightTarget]
  )

  return (
    <ChapterScrollSection
      chapter={chapterNum}
      kind="rendered"
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
      <div className="space-y-0.5" data-scripture-layout="prepared-full">
        {full.blocks.map((block, idx) => (
          <BlockView
            key={`${chapterNum}-${block.marker}-${idx}`}
            block={block}
            book={book}
            matchKeys={full.matchKeys}
            underlineIndices={underlineIndices}
            highlightOwnIndex={highlight.ownIndex}
            highlightAlignedIndices={highlight.alignedIndices}
            isOriginalLanguage={isOriginalLanguage}
            onInternedTokenClick={onInternedTokenClick}
            onVerseClick={onVerseClick}
          />
        ))}
      </div>
    </ChapterScrollSection>
  )
})

/** Type-only re-export for callers that still need UsjWordToken in signatures. */
export type { UsjWordToken }
