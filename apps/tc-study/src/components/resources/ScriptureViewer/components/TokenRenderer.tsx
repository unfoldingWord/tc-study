/**
 * TokenRenderer — UsjWordToken spans.
 *
 * DOM contract for Helps / Journey 4+8 (stable):
 * - data-token-semantic-id = token.semanticId (= semanticIdFor(...))
 * - data-underlined / data-highlighted
 */

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
  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    onTokenClick(token)
  }

  return (
    <span
      onClick={handleClick}
      data-token-semantic-id={token.semanticId}
      data-highlighted={isHighlighted || isSelected ? 'true' : undefined}
      data-underlined={isUnderlined ? 'true' : undefined}
      className={`
        rounded px-0.5 transition-all inline-block cursor-pointer hover:bg-muted text-scripture-fg
        ${isHighlighted || isSelected ? 'bg-highlight highlighted-token' : ''}
        ${isUnderlined ? 'underline decoration-dotted decoration-underline decoration-1 underline-offset-3' : ''}
      `}
      style={{ minHeight: '1.5rem' }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      aria-pressed={isHighlighted || isSelected}
    >
      {token.content}
    </span>
  )
})
