/**
 * ScriptureViewer - Displays scripture with clickable tokens
 * Sends token-click events, receives highlighted-tokens state
 * Exposes TOC to AppContext for navigation
 */

import { useState, useEffect } from 'react'
import { useResourceAPI, useCurrentState, useEvents } from 'linked-panels'
import { useCurrentReference, useApp, type BookInfo, type ResourceTOC } from '../../contexts'
import type { TokenClickEvent, HighlightedTokensState, VerseReferenceFilterEvent } from '../../plugins/types'

interface ScriptureViewerProps {
  resourceId: string
  resourceKey: string
  usfmContent?: string
  isAnchor?: boolean // Is this the primary scripture resource?
}

// Temporary tokenizer (will be replaced with real USFM parser)
function tokenizeText(text: string, verseRef: string) {
  return text.split(/\s+/).map((word, idx) => ({
    id: `token-${idx}`,
    content: word,
    semanticId: `sem-${idx}`,
    verseRef,
    position: idx,
  }))
}

export function ScriptureViewer({ resourceId, resourceKey, usfmContent, isAnchor }: ScriptureViewerProps) {
  const api = useResourceAPI<TokenClickEvent>(resourceId)
  const app = useApp()
  const currentRef = useCurrentReference() // From NavigationContext!
  
  // Local state for immediate highlighting
  const [localHighlightedTokens, setLocalHighlightedTokens] = useState<string[]>([])
  const [localSelectedToken, setLocalSelectedToken] = useState<string | null>(null)
  
  // Listen for highlighted-tokens state from other resources
  const highlightState = useCurrentState<HighlightedTokensState>(
    resourceId,
    'current-highlighted-tokens'
  )
  
  // Listen for verse-filter events
  useEvents<VerseReferenceFilterEvent>(
    resourceId,
    ['verse-filter'],
    (event) => {
      console.log('📨 ScriptureViewer received verse-filter:', event.verseRef)
      // TODO: Scroll to verse
    }
  )

  // Expose TOC to AppContext if this is the anchor resource
  useEffect(() => {
    if (isAnchor) {
      // Sample TOC (will be replaced with real data from USFM)
      const toc: ResourceTOC = {
        resourceId,
        resourceType: 'scripture',
        books: [
          { code: 'gen', name: 'Genesis', testament: 'OT', chapters: 50, verses: Array(50).fill(31) },
          { code: 'exo', name: 'Exodus', testament: 'OT', chapters: 40, verses: Array(40).fill(28) },
          { code: 'mat', name: 'Matthew', testament: 'NT', chapters: 28, verses: Array(28).fill(25) },
          { code: 'jhn', name: 'John', testament: 'NT', chapters: 21, verses: Array(21).fill(25) },
          { code: 'tit', name: 'Titus', testament: 'NT', chapters: 3, verses: [16, 15, 15] },
        ],
      }

      app.setAnchorResource(resourceId, toc)
      console.log('⚓ ScriptureViewer exposed TOC with', toc.books.length, 'books')
    }
  }, [isAnchor, resourceId])
  
  // Sample text (will be replaced with real USFM content)
  const sampleText = usfmContent || `In the beginning God created the heavens and the earth. The earth was formless and empty, and darkness covered the deep waters.`
  const refString = `${currentRef.book.toUpperCase()} ${currentRef.chapter}:${currentRef.verse}`
  const tokens = tokenizeText(sampleText, refString)
  
  // Combine local + broadcast highlighting
  const highlightedTokens = localHighlightedTokens.length > 0
    ? localHighlightedTokens
    : (highlightState?.tokenIds || [])
  const selectedTokenId = localSelectedToken || highlightState?.selectedTokenId
  
  // Handle token click
  const handleTokenClick = (token: typeof tokens[0]) => {
    console.log('🖱️ Token clicked:', token.content)
    
    // Update local state immediately
    setLocalHighlightedTokens([token.id])
    setLocalSelectedToken(token.id)
    
    // Broadcast token-click event
    const message: TokenClickEvent = {
      type: 'token-click',
      lifecycle: 'event',
      token: {
        id: token.id,
        content: token.content,
        semanticId: token.semanticId,
        verseRef: token.verseRef,
        position: token.position,
      },
      sourceResourceId: resourceId,
      timestamp: Date.now(),
    }
    
    api.messaging.sendToAll(message)
  }
  
  return (
    <div className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{resourceKey}</h3>
        <p className="text-sm text-gray-500">{refString}</p>
        {isAnchor && (
          <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
            Anchor Resource
          </span>
        )}
      </div>
      
      <div className="text-lg leading-relaxed">
        {tokens.map((token, idx) => {
          const isHighlighted = highlightedTokens.includes(token.id)
          const isSelected = selectedTokenId === token.id
          
          return (
            <span key={token.id}>
              <span
                onClick={() => handleTokenClick(token)}
                className={`
                  cursor-pointer px-1 py-0.5 rounded transition-all
                  ${isSelected ? 'bg-yellow-400 font-bold' : ''}
                  ${isHighlighted && !isSelected ? 'bg-yellow-100' : ''}
                  ${!isHighlighted && !isSelected ? 'hover:bg-gray-100' : ''}
                `}
              >
                {token.content}
              </span>
              {idx < tokens.length - 1 && ' '}
            </span>
          )
        })}
      </div>
      
      <div className="mt-6 p-3 bg-blue-50 rounded-lg text-sm">
        <strong>Interactive Features:</strong>
        <ul className="mt-2 space-y-1 text-gray-700">
          <li>• Click tokens to filter notes/words</li>
          <li>• {highlightedTokens.length} tokens highlighted</li>
          <li>• Selected: {selectedTokenId || 'none'}</li>
        </ul>
      </div>
    </div>
  )
}

