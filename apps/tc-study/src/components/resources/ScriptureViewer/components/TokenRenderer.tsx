/**
 * TokenRenderer - Renders individual word tokens with highlighting and click handling
 * Matches the pattern from mobile app's USFMRenderer/WordTokenRenderer
 */

import type { TokenDisplayProps } from '../types'

export function TokenRenderer({
  token,
  index,
  isHighlighted,
  isSelected,
  isUnderlined = false,
  onTokenClick,
  isOriginalLanguage,
}: TokenDisplayProps) {
  // Get token text (WordToken uses 'content' property)
  // Trim text/punctuation tokens to remove extra spaces
  const rawText = token.content || token.text || ''
  const tokenType = token.type as string
  const tokenText = (tokenType === 'text' || tokenType === 'punctuation') 
    ? rawText.trim() 
    : rawText

  // All word tokens are clickable:
  // - Aligned tokens → token-click (alignment-based filtering)
  // - Non-aligned / non-covered tokens → verse-filter (handled in useHighlighting)
  const isClickable = token.type === 'word'

  const handleClick = () => {
    if (isClickable) {
      onTokenClick(token)
    }
  }

  // No padding for punctuation and text tokens (they should be adjacent to words)
  const paddingClass = (tokenType === 'punctuation' || tokenType === 'text') ? '' : 'px-0.5'
  
  return (
    <span
      onClick={handleClick}
      data-token-semantic-id={token.uniqueId}
      data-highlighted={isHighlighted || isSelected ? 'true' : undefined}
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
}


