/**
 * TextResource - Displays text with clickable words
 * Sends word-click messages when user clicks a word
 * Receives highlighted-words-broadcast to apply highlighting
 */

import { useState, useEffect } from 'react'
import { useResourceAPI, useCurrentState, useEvents } from 'linked-panels'
import type { WordClickMessage, HighlightedWordsBroadcast } from '../types'

interface TextResourceProps {
  text: string
  resourceId: string
}

export function TextResource({ text, resourceId }: TextResourceProps) {
  const api = useResourceAPI<WordClickMessage>(resourceId)
  // Local state for highlighting (fallback when useCurrentState doesn't update)
  const [localHighlightedWords, setLocalHighlightedWords] = useState<string[]>([])
  const [localSelectedWord, setLocalSelectedWord] = useState<string | null>(null)
  
  // Parse text into words with IDs
  const words = text.split(/\s+/).map((word, idx) => ({
    id: `word-${idx}`,
    text: word,
    position: idx,
  }))

  // Listen for highlighted-words-broadcast state messages (from dictionary)
  const highlightState = useCurrentState<HighlightedWordsBroadcast>(
    resourceId,
    'current-highlighted-words'
  )

  // Listen for word-click events from dictionary (for reverse highlighting)
  useEvents<WordClickMessage>(
    resourceId,
    ['word-click'],
    (message) => {
      // If this message came from dictionary (position: -1), highlight matching words
      if (message.position === -1 && message.sourceResourceId !== resourceId) {
        console.log('📨 TextResource received dictionary click:', message.word)
        
        // Find all matching word IDs
        const matchingWordIds = words
          .filter(w => w.text.toLowerCase().replace(/[.,!?;:]/g, '') === message.word)
          .map(w => w.id)
        
        console.log('🔍 Found matching words:', matchingWordIds)
        
        if (matchingWordIds.length > 0) {
          // UPDATE LOCAL STATE IMMEDIATELY (don't wait for broadcast to come back)
          setLocalHighlightedWords(matchingWordIds)
          setLocalSelectedWord(matchingWordIds[0])
          console.log('✨ Applied local highlights:', matchingWordIds)
          
          // Also send highlight broadcast for other resources
          const highlightMsg: HighlightedWordsBroadcast = {
            type: 'highlighted-words-broadcast',
            lifecycle: 'state',
            stateKey: 'current-highlighted-words',
            wordIds: matchingWordIds,
            selectedWordId: matchingWordIds[0],
            sourceResourceId: resourceId,
            timestamp: Date.now(),
          }
          
          console.log('📤 TextResource broadcasting highlights for dictionary word:', highlightMsg)
          api.messaging.sendToAll(highlightMsg)
        } else {
          console.log('⚠️ No matching words found for:', message.word)
          setLocalHighlightedWords([])
          setLocalSelectedWord(null)
        }
      }
    }
  )

  // Combine local state with broadcast state
  const highlightedWords = localHighlightedWords.length > 0
    ? localHighlightedWords
    : (highlightState?.wordIds || [])
  const selectedWordId = localSelectedWord || highlightState?.selectedWordId

  // Handle word click
  const handleWordClick = (word: typeof words[0]) => {
    console.log('🖱️ Word clicked:', word.text)

    // Send word-click event message
    const message: WordClickMessage = {
      type: 'word-click',
      lifecycle: 'event',
      word: word.text.toLowerCase().replace(/[.,!?;:]/g, ''),
      wordId: word.id,
      position: word.position,
      sourceResourceId: resourceId,
      timestamp: Date.now(),
    }

    // Broadcast to all resources
    api.messaging.sendToAll(message)
  }

  return (
    <div style={{ padding: '24px', lineHeight: '2' }}>
      <h2 style={{ marginBottom: '16px', color: '#333' }}>Text Resource</h2>
      <div style={{ fontSize: '18px' }}>
        {words.map((word, idx) => {
          const isHighlighted = highlightedWords.includes(word.id)
          const isSelected = selectedWordId === word.id

          return (
            <span key={word.id}>
              <span
                onClick={() => handleWordClick(word)}
                style={{
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  backgroundColor: isSelected
                    ? '#fbbf24'
                    : isHighlighted
                    ? '#fef3c7'
                    : 'transparent',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = '#f3f4f6'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = isHighlighted
                      ? '#fef3c7'
                      : 'transparent'
                  }
                }}
              >
                {word.text}
              </span>
              {idx < words.length - 1 && ' '}
            </span>
          )
        })}
      </div>
      
      <div style={{ marginTop: '24px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px', fontSize: '14px' }}>
        <strong>Instructions:</strong> Click any word to look it up in the dictionary panel.
        <br />
        <strong>Status:</strong> {highlightedWords.length} words highlighted
        <br />
        <small style={{ color: '#6b7280' }}>
          Highlighted words: {highlightedWords.length > 0 ? highlightedWords.join(', ') : 'none'}
        </small>
      </div>
    </div>
  )
}
