import { shouldInsertSpaceBeforeInline, type UsjLayoutInline } from '@bt-synergy/scripture-loader'
import { Fragment, memo } from 'react'
import type { BCVReference } from '../../../../contexts/types-only'
import type { OriginalLanguageToken, VerseDisplayProps } from '../types'
import { resolveTokenVisualState } from '../utils/tokenHighlight'
import { SCRIPTURE_VERSE_NUMBER_CLASS } from '../utils/paraStyles'
import { ScriptureNoteMarker } from './ScriptureNoteMarker'
import { ScriptureRefLinks } from './ScriptureRefLinks'
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
  isOriginalLanguage: boolean,
  currentBook: string,
  onScriptureRefClick?: (ref: BCVReference) => void
) {
  return displayInline.map((item, index) => {
    if (item.kind === 'heading') {
      return (
        <ScriptureRefLinks
          key={`h-${index}`}
          text={item.text}
          currentBook={currentBook}
          onScriptureRefClick={onScriptureRefClick}
        />
      )
    }
    if (item.kind === 'text') {
      return <Fragment key={`t-${index}`}>{item.text}</Fragment>
    }
    if (item.kind === 'note' || item.kind === 'xref') {
      return (
        <ScriptureNoteMarker
          key={`${item.kind}-${index}`}
          kind={item.kind}
          caller={item.caller}
          text={item.text}
          currentBook={currentBook}
          onScriptureRefClick={onScriptureRefClick}
        />
      )
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
  onScriptureRefClick,
  currentBook = '',
  isOriginalLanguage,
}: VerseDisplayProps) {
  const renderVerseContent = () => {
    if (displayInline && displayInline.length > 0) {
      return renderDisplayInline(
        displayInline,
        highlightTarget,
        underlinedSemanticIds,
        onTokenClick,
        isOriginalLanguage,
        currentBook,
        onScriptureRefClick
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
        className={SCRIPTURE_VERSE_NUMBER_CLASS}
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
    prev.onScriptureRefClick !== next.onScriptureRefClick ||
    prev.currentBook !== next.currentBook ||
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
