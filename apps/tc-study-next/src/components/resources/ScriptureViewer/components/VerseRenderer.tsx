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

export const VerseRenderer = memo(function VerseRenderer({
  verse,
  chapterNumber,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
  isOriginalLanguage,
}: VerseDisplayProps) {
  const renderVerseContent = () => {
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
        {verse.number}
      </span>
      <span className="text-lg text-scripture-fg">{renderVerseContent()}</span>
    </div>
  )
}, (prev, next) => {
  if (
    prev.verse !== next.verse ||
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
