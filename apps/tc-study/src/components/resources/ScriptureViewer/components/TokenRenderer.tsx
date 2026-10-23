/**
 * TokenRenderer — UsjWordToken spans.
 *
 * DOM contract for Helps / Journey 4+8 (stable):
 * - data-token-semantic-id = token.semanticId (= semanticIdFor(...))
 * - data-underlined / data-highlighted; aria-current="true" while highlighted
 *
 * No role/tabIndex/key handler per word (thousands per chapter): the scrollport
 * gives keyboard access with a roving tabindex (useScriptureKeyboardNav).
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
      aria-current={isHighlighted || isSelected ? 'true' : undefined}
      data-underlined={isUnderlined ? 'true' : undefined}
      className={`rounded cursor-pointer hover:bg-muted text-scripture-fg${
        isHighlighted || isSelected ? ' bg-highlight highlighted-token scroll-mt-12' : ''
      }${
        isUnderlined
          ? ' underline decoration-dotted decoration-underline decoration-1 underline-offset-3'
          : ''
      }`}
    >
      {token.content}
    </span>
  )
})
