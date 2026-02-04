/**
 * VerseRenderer - Renders individual verses with their word tokens
 * Matches the pattern from mobile app's USFMRenderer
 */

import type { WordToken } from '@bt-synergy/usfm-processor'
import { Fragment } from 'react'
import type { VerseDisplayProps } from '../types'
import { TokenRenderer } from './TokenRenderer'

// Helper to get token ID (WordToken uses 'uniqueId' property)
function getTokenId(token: WordToken): string {
  return token.uniqueId || (token as any).id || ''
}

/**
 * Check if token content starts with punctuation
 */
function startsWithPunctuation(content: string): boolean {
  if (!content) return false
  const firstChar = content.trim()[0]
  return /[.,;:!?()[\]{}'"—–-]/.test(firstChar)
}

/**
 * Determine if a space should be added after a token
 * Handles text tokens that may include punctuation with spaces
 */
function shouldAddSpaceAfterToken(
  currentToken: WordToken,
  nextToken: WordToken | undefined
): boolean {
  if (!nextToken) return false
  
  // Never add space after or before paragraph markers or whitespace
  const currentType = currentToken.type as string
  const nextType = nextToken.type as string
  if (currentType === 'paragraph-marker' || nextType === 'paragraph-marker') {
    return false
  }
  if (currentType === 'whitespace' || nextType === 'whitespace') {
    return false
  }
  
  // Don't add space before punctuation tokens
  if (nextType === 'punctuation') {
    return false
  }
  
  // Don't add space before text tokens (they include their own spacing/punctuation)
  if (nextType === 'text') {
    return false
  }
  
  // Don't add space if next token starts with punctuation (handles edge cases)
  if (startsWithPunctuation(nextToken.content)) {
    return false
  }
  
  // Add space after words (when followed by other words)
  if (currentToken.type === 'word' && nextType === 'word') {
    return true
  }
  
  // Add space after punctuation when followed by words
  if (currentToken.type === 'punctuation' && nextToken.type === 'word') {
    return true
  }
  
  // Handle text tokens (which may contain punctuation like commas, hyphens, etc.)
  if (currentType === 'text' && nextType === 'word') {
    const content = currentToken.content || ''
    const trimmedContent = content.trim()
    
    // If text token originally had trailing whitespace, add space
    // (e.g., ", " becomes "," but we need the space after it)
    if (content !== trimmedContent && /\s$/.test(content)) {
      return true
    }
    
    // If text token is just punctuation (like "," or "."), add space after it
    if (/^[.,;:!?()[\]{}'"—–-]+$/.test(trimmedContent)) {
      return true
    }
    
    // Otherwise don't add space (e.g., hyphen within compound words like "-")
    return false
  }
  
  return false
}

export function VerseRenderer({
  verse,
  highlightTarget,
  onTokenClick,
  isOriginalLanguage,
}: VerseDisplayProps) {
  const renderVerseContent = () => {
    if (!verse.wordTokens || verse.wordTokens.length === 0) {
      if (verse.text) {
        return <span className="text-gray-500 italic">{verse.text}</span>
      }
      return (
        <span className="text-red-500 italic">
          [No content available for verse {verse.number}]
        </span>
      )
    }

    // Filter out whitespace and paragraph-marker tokens (like mobile app)
    // Also filter out text tokens that only contain whitespace
    const filteredTokens = verse.wordTokens.filter(token => {
      const tokenType = token.type as string
      if (tokenType === 'whitespace' || tokenType === 'paragraph-marker') {
        return false
      }
      // Filter out text tokens that are just whitespace
      if (tokenType === 'text' && (!token.content || token.content.trim() === '')) {
        return false
      }
      return true
    })

    return filteredTokens.map((token, index) => {
      const nextToken = filteredTokens[index + 1]
      const tokenId = getTokenId(token)
      const tokenVerseRef = token.verseRef || verse.reference
      const tokenOccurrence = token.occurrence || (token as any).occ || 1
      
      // Generate semantic ID in format: verseRef:content:occurrence
      // This preserves Unicode characters and matches across languages
      const tokenSemanticId = `${tokenVerseRef}:${token.content}:${tokenOccurrence}`
      
      // Determine if this token should be highlighted
      let isHighlighted = false
      let isSelected = false
      
      if (highlightTarget) {
        if (isOriginalLanguage) {
          // For original language:
          // First check for EXACT match (when same token is clicked in this resource)
          if (tokenSemanticId === highlightTarget.semanticId) {
            isHighlighted = true
            isSelected = true
          }
          // Then check cross-panel alignment (when target language word is clicked in another resource)
          // When a target language word is clicked, it sends the IDs of original language words it aligns to
          else if (highlightTarget.alignedSemanticIds && highlightTarget.alignedSemanticIds.length > 0) {
            // This token is highlighted if its ID is in the array of aligned original language IDs
            isHighlighted = highlightTarget.alignedSemanticIds.includes(tokenSemanticId)
          }
        } else {
          // For target language:
          // First check for EXACT match (when same token is clicked in this resource)
          if (tokenSemanticId === highlightTarget.semanticId) {
            isHighlighted = true
            isSelected = true
          }
          // Then check cross-panel alignment (when original language token is clicked in another resource)
          else if (token.alignedOriginalWordIds && token.alignedOriginalWordIds.length > 0) {
            const alignedIds = token.alignedOriginalWordIds.map(id => String(id))
            
            // Check if the highlight target's semantic ID is in this token's alignment
            // (This handles: user clicks Greek word → English word highlights)
            if (alignedIds.includes(highlightTarget.semanticId)) {
              isHighlighted = true
              isSelected = true
            }
            // Also check if any of the target's aligned IDs match
            // (This handles: user clicks Greek word that aligns to multiple words)
            else if (highlightTarget.alignedSemanticIds) {
              isHighlighted = highlightTarget.alignedSemanticIds.some(id => alignedIds.includes(id))
            }
          }
        }
        
      }

        return (
        <Fragment key={`token-${tokenId}-${index}`}>
          <TokenRenderer
            token={token}
            index={index}
            isHighlighted={isHighlighted}
            isSelected={isSelected}
            onTokenClick={onTokenClick}
            isOriginalLanguage={isOriginalLanguage}
          />
          {shouldAddSpaceAfterToken(token, nextToken) && ' '}
        </Fragment>
      )
    })
  }

  return (
    <div className="mb-2 leading-relaxed">
      <span className="text-sm font-bold text-blue-600 mr-2 select-none cursor-pointer hover:text-blue-700">
        {verse.number}
      </span>
      <span className="text-lg text-gray-900">
        {renderVerseContent()}
      </span>
    </div>
  )
}


