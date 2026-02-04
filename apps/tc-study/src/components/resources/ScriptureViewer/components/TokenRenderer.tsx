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

  // Determine if token is clickable (matches mobile app logic)
  // Original language tokens are always clickable (if they're words)
  // Target language tokens are clickable if they have alignment data
  const tokenAlign = token.alignedOriginalWordIds || (token as any).align || []
  const isClickable = token.type === 'word' && (isOriginalLanguage || tokenAlign.length > 0)

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
        ${isSelected ? 'bg-yellow-200 highlighted-token' : ''}
        ${isHighlighted && !isSelected ? 'bg-yellow-100 highlighted-token' : ''}
        ${token.type === 'punctuation' ? 'text-gray-600' : 'text-gray-900'}
      `}
      style={{ minHeight: '1.5rem' }}
    >
      {tokenText}
    </span>
  )
}


