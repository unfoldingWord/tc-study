import { shouldInsertSpaceBeforeInline, type UsjLayoutInline } from '@bt-synergy/scripture-loader'
import { Fragment, memo } from 'react'
import type { OriginalLanguageToken, VerseDisplayProps } from '../types'
import { resolveTokenVisualState } from '../utils/tokenHighlight'
import { TokenRenderer } from './TokenRenderer'

function verseNumFromRef(ref: string | undefined): number | null {
  if (!ref) return null
  const m = ref.match(/:(\d+)$/)
  return m ? parseInt(m[1], 10) : null
}

function highlightAffectsVerse(
  prev: OriginalLanguageToken | null,
  next: OriginalLanguageToken | null,
  verseNumber: number
): boolean {
  const oldNum = verseNumFromRef(prev?.verseRef)
  const newNum = verseNumFromRef(next?.verseRef)
  return verseNumber === oldNum || verseNumber === newNum
}

function renderDisplayInline(
  displayInline: UsjLayoutInline[],
  highlightTarget: VerseDisplayProps['highlightTarget'],
  underlinedSemanticIds: VerseDisplayProps['underlinedSemanticIds'],
  onTokenClick: VerseDisplayProps['onTokenClick'],
  isOriginalLanguage: boolean
) {
  return displayInline.map((item, index) => {
    if (item.kind === 'text' || item.kind === 'heading') {
      return <Fragment key={`t-${index}`}>{item.text}</Fragment>
    }
    if (item.kind !== 'token') return null

    const { isHighlighted, isSelected, isUnderlined } = resolveTokenVisualState(item.token, {
      highlightTarget,
      underlinedSemanticIds,
      isOriginalLanguage,
    })

    return (
      <Fragment key={`token-${item.token.semanticId}-${index}`}>
        {shouldInsertSpaceBeforeInline(displayInline[index - 1], item) ? ' ' : null}
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
  })
}

export const VerseRenderer = memo(function VerseRenderer({
  verse,
  chapterNumber,
  displayInline,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
  isOriginalLanguage,
}: VerseDisplayProps) {
  const renderVerseContent = () => {
    if (displayInline && displayInline.length > 0) {
      return renderDisplayInline(
        displayInline,
        highlightTarget,
        underlinedSemanticIds,
        onTokenClick,
        isOriginalLanguage
      )
    }

    if (!verse.tokens || verse.tokens.length === 0) {
      if (verse.text) {
        return <span className="text-scripture-muted italic">{verse.text}</span>
      }
      return (
        <span className="text-danger italic">
          [No content available for verse {verse.number}]
        </span>
      )
    }

    return verse.tokens.map((token, index) => {
      const { isHighlighted, isSelected, isUnderlined } = resolveTokenVisualState(token, {
        highlightTarget,
        underlinedSemanticIds,
        isOriginalLanguage,
      })

      return (
        <Fragment key={`token-${token.semanticId}-${index}`}>
          <TokenRenderer
            token={token}
            index={index}
            isHighlighted={isHighlighted}
            isSelected={isSelected}
            isUnderlined={isUnderlined}
            onTokenClick={onTokenClick}
            isOriginalLanguage={isOriginalLanguage}
          />
          {index < verse.tokens.length - 1 ? ' ' : null}
        </Fragment>
      )
    })
  }

  return (
    <div className="mb-2 leading-relaxed">
      <span
        className="text-sm font-bold text-accent mr-2 select-none cursor-pointer hover:text-accent-hover"
        onClick={(e) => {
          e.stopPropagation()
          onVerseClick?.(chapterNumber, verse.number)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onVerseClick?.(chapterNumber, verse.number)
          }
        }}
        aria-label={`Verse ${verse.number}`}
      >
        {verse.number}{' '}
      </span>
      <span className="text-lg text-scripture-fg">{renderVerseContent()}</span>
    </div>
  )
}, (prev, next) => {
  if (
    prev.verse !== next.verse ||
    prev.displayInline !== next.displayInline ||
    prev.underlinedSemanticIds !== next.underlinedSemanticIds ||
    prev.onTokenClick !== next.onTokenClick ||
    prev.onVerseClick !== next.onVerseClick ||
    prev.isOriginalLanguage !== next.isOriginalLanguage ||
    prev.chapterNumber !== next.chapterNumber
  ) {
    return false
  }
  if (prev.highlightTarget === next.highlightTarget) {
    return true
  }
  return !highlightAffectsVerse(prev.highlightTarget, next.highlightTarget, next.verse.number)
})
