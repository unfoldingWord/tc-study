import { Fragment, memo } from 'react'
import type { UsjLayoutBlock, UsjWordToken } from '@bt-synergy/scripture-loader'
import type { OriginalLanguageToken } from '../types'
import { resolveTokenVisualState } from '../utils/tokenHighlight'
import { blockClassForMarker } from '../utils/paraStyles'
import { TokenRenderer } from './TokenRenderer'

interface FormattedBlockRendererProps {
  block: UsjLayoutBlock
  blockIndex: number
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  isOriginalLanguage: boolean
}

export const FormattedBlockRenderer = memo(function FormattedBlockRenderer({
  block,
  blockIndex,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
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

  const needsSpaceBeforeToken = (index: number): boolean => {
    if (index <= 0) return false
    const prev = block.inline[index - 1]
    if (!prev) return false
    if (prev.kind === 'text') {
      // Text already includes spacing/punctuation
      return !/\s$/.test(prev.text)
    }
    if (prev.kind === 'verse' || prev.kind === 'token' || prev.kind === 'heading') {
      return true
    }
    return false
  }

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
              className="text-sm font-bold text-blue-600 mr-1.5 select-none cursor-pointer hover:text-blue-700 align-super"
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
            <span key={`h-${blockIndex}-${index}`} className="text-gray-800">
              {item.text}
            </span>
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
