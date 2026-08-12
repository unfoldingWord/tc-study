/**
 * TokenRenderer — word spans with highlight / underline / click.
 *
 * DOM contract for Helps / linked panels (USJ identity):
 * - data-token-semantic-id = verseRef:content:occurrence (via semanticIdFor)
 * - data-underlined / data-highlighted for e2e + CSS
 *
 * Visual styling ownership stays with Viewer; attrs are the Helps integration surface.
 */

import { semanticIdFor } from '@bt-synergy/scripture-loader'
import { memo } from 'react'
import type { TokenDisplayProps } from '../types'

export const TokenRenderer = memo(function TokenRenderer({
  token,
  index: _index,
  isHighlighted,
  isSelected,
  isUnderlined = false,
  onTokenClick,
  isOriginalLanguage: _isOriginalLanguage,
}: TokenDisplayProps) {
  const rawText = token.content || ''
  const tokenType = token.type as string
  const tokenText =
    tokenType === 'text' || tokenType === 'punctuation' ? rawText.trim() : rawText

  const isClickable = token.type === 'word'
  const occurrence = token.occurrence || 1
  const verseRef = token.verseRef || ''
  const semanticId =
    token.type === 'word' && verseRef
      ? semanticIdFor(verseRef, token.content || '', occurrence)
      : token.uniqueId || ''

  const handleClick = () => {
    if (isClickable) {
      onTokenClick(token)
    }
  }

  const paddingClass =
    tokenType === 'punctuation' || tokenType === 'text' ? '' : 'px-0.5'

  return (
    <span
      onClick={handleClick}
      data-token-semantic-id={semanticId}
      data-highlighted={isHighlighted || isSelected ? 'true' : undefined}
      data-underlined={isUnderlined ? 'true' : undefined}
      className={`
        rounded ${paddingClass} transition-all inline-block
        ${isClickable ? 'cursor-pointer hover:bg-gray-100' : ''}
        ${isHighlighted || isSelected ? 'bg-yellow-100 highlighted-token' : ''}
        ${isUnderlined ? 'underline decoration-dotted decoration-gray-400 decoration-1 underline-offset-3' : ''}
        ${token.type === 'punctuation' ? 'text-gray-600' : 'text-gray-900'}
      `}
      style={{ minHeight: '1.5rem' }}
    >
      {tokenText}
    </span>
  )
})
