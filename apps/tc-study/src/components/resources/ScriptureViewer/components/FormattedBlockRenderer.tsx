import { Fragment, memo } from 'react'
import {
  shouldInsertSpaceBeforeInline,
  type UsjLayoutBlock,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import type { BCVReference } from '../../../../contexts/types-only'
import type { OriginalLanguageToken } from '../types'
import { resolveTokenVisualState } from '../utils/tokenHighlight'
import { blockClassForMarker, SCRIPTURE_VERSE_NUMBER_CLASS } from '../utils/paraStyles'
import { ScriptureNoteMarker } from './ScriptureNoteMarker'
import { ScriptureRefLinks } from './ScriptureRefLinks'
import { TokenRenderer } from './TokenRenderer'

interface FormattedBlockRendererProps {
  block: UsjLayoutBlock
  blockIndex: number
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  onScriptureRefClick?: (ref: BCVReference) => void
  currentBook?: string
  isOriginalLanguage: boolean
}

export const FormattedBlockRenderer = memo(function FormattedBlockRenderer({
  block,
  blockIndex,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
  onScriptureRefClick,
  currentBook = '',
  isOriginalLanguage,
}: FormattedBlockRendererProps) {
  const className = blockClassForMarker(block.marker, block.role, block.indentLevel)

  if (block.role === 'break' || block.marker === 'b') {
    return (
      <div
        className={className}
        data-usj-marker={block.marker}
        aria-hidden
      />
    )
  }

  const needsSpaceBeforeToken = (index: number): boolean =>
    shouldInsertSpaceBeforeInline(block.inline[index - 1], block.inline[index]!)

  return (
    <div
      className={className}
      data-usj-marker={block.marker}
      data-usj-role={block.role}
    >
      {block.inline.map((item, index) => {
        if (item.kind === 'verse') {
          return (
            <span
              key={`v-${blockIndex}-${item.chapterNumber}:${item.verseNumber}-${index}`}
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
              {item.verseNumber}
            </span>
          )
        }

        if (item.kind === 'heading') {
          return (
            <ScriptureRefLinks
              key={`h-${blockIndex}-${index}`}
              text={item.text}
              currentBook={currentBook}
              onScriptureRefClick={onScriptureRefClick}
            />
          )
        }

        if (item.kind === 'note' || item.kind === 'xref') {
          return (
            <ScriptureNoteMarker
              key={`${item.kind}-${blockIndex}-${index}`}
              kind={item.kind}
              caller={item.caller}
              text={item.text}
              currentBook={currentBook}
              onScriptureRefClick={onScriptureRefClick}
            />
          )
        }

        if (item.kind === 'text') {
          return (
            <Fragment key={`t-${blockIndex}-${index}`}>{item.text}</Fragment>
          )
        }

        // token
        const { isHighlighted, isSelected, isUnderlined } = resolveTokenVisualState(
          item.token,
          {
            highlightTarget,
            underlinedSemanticIds,
            isOriginalLanguage,
          }
        )

        return (
          <Fragment key={`tok-${item.token.semanticId}-${index}`}>
            {needsSpaceBeforeToken(index) ? ' ' : null}
            <TokenRenderer
              token={item.token}
              index={index}
              isHighlighted={isHighlighted}
              isSelected={isSelected}
              isUnderlined={isUnderlined}
              onTokenClick={onTokenClick}
              isOriginalLanguage={isOriginalLanguage}
            />
          </Fragment>
        )
      })}
    </div>
  )
})
