/**
 * Hook for broadcasting scripture tokens to other panels
 * 
 * Broadcasts current scripture tokens as a STATE message that persists
 * until unmounted or navigation changes. Other panels can access this
 * via useCurrentState('current-scripture-tokens').
 * 
 * This replaces the old request/response pattern with a simpler broadcast approach.
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import type { ProcessedScripture, WordToken } from '@bt-synergy/usfm-processor'
import { useResourceAPI } from 'linked-panels'
import { useEffect } from 'react'
import type { ScriptureTokensBroadcastSignal } from '../../../../signals/studioSignals'

interface UseTokenBroadcastOptions {
  resourceId: string
  resourceKey: string
  loadedContent: ProcessedScripture | null
  language: string
  languageDirection?: 'ltr' | 'rtl'
  currentChapter: number
  currentVerse: number
  endChapter?: number
  endVerse?: number
}

/**
 * Convert ProcessedScripture tokens to OptimizedToken format for broadcasting
 * Supports both single verse and verse ranges
 */
function extractOptimizedTokens(
  loadedContent: ProcessedScripture,
  startChapter: number,
  startVerse: number,
  endChapter?: number,
  endVerse?: number
): OptimizedToken[] {
  const tokens: OptimizedToken[] = []
  const bookCode = loadedContent.metadata?.bookCode || ''
  
  // Determine the actual range
  const actualEndChapter = endChapter || startChapter
  const actualEndVerse = endVerse || startVerse
  
  // Iterate through all chapters in the range
  for (let chapterNum = startChapter; chapterNum <= actualEndChapter; chapterNum++) {
    const chapterData = loadedContent.chapters.find(ch => ch.number === chapterNum)
    if (!chapterData) {
      continue
    }
    
    // Determine verse range for this chapter
    const verseStart = chapterNum === startChapter ? startVerse : 1
    // Get the actual last verse number from the chapter data
    const lastVerseInChapter = chapterData.verses.length > 0 
      ? chapterData.verses[chapterData.verses.length - 1].number 
      : verseStart
    const verseEnd = chapterNum === actualEndChapter ? actualEndVerse : lastVerseInChapter
    
    // Iterate through verses array directly (instead of by number range)
    // This prevents issues with non-sequential or corrupted verse numbers
    for (const verseData of chapterData.verses) {
      const verseNum = verseData.number
      
      // Skip verses outside our range
      if (verseNum < verseStart || verseNum > verseEnd) {
        continue
      }
      
      if (!verseData.wordTokens) {
        continue
      }
      
      // Convert WordToken[] to OptimizedToken[]
      // Include ALL tokens (word, punctuation, whitespace) for accurate quote building
      verseData.wordTokens.forEach((token: WordToken) => {
        const verseRef = `${bookCode} ${chapterNum}:${verseNum}`
        const occurrence = token.occurrence || 1
        
        // Create OptimizedToken with extended properties via type assertion
        const optimizedToken: OptimizedToken = {
          id: tokens.length, // Use cumulative index across all verses
          text: token.content,
          type: token.type, // Preserve the actual token type (word, punctuation, or whitespace)
          // Extended properties (not in base OptimizedToken type but used in practice)
          ...({
            verseRef,
            occurrence,
            semanticId: token.type === 'word' 
              ? `${verseRef}:${token.content}:${occurrence}`
              : `${verseRef}:${token.type}:${tokens.length}`, // Use index for non-word tokens
            alignedOriginalWordIds: token.alignedOriginalWordIds || [],
          } as any),
        }
        
        tokens.push(optimizedToken)
      })
    }
  }
  
  return tokens
}

export function useTokenBroadcast({
  resourceId,
  resourceKey,
  loadedContent,
  language,
  languageDirection = 'ltr',
  currentChapter,
  currentVerse,
  endChapter,
  endVerse,
}: UseTokenBroadcastOptions) {
  // Use the linked-panels API for messaging
  const api = useResourceAPI<ScriptureTokensBroadcastSignal>(resourceId)
  
  // Broadcast tokens whenever content or navigation changes
  // Note: We intentionally don't include 'api' in dependencies because:
  // 1. api.messaging.sendToAll is a stable function that doesn't change
  // 2. Including api would cause infinite loops as it's a new object reference on each render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const bookCode = loadedContent?.metadata?.bookCode || ''
    
    if (!loadedContent || !bookCode || !currentChapter || !currentVerse) {
      // Send empty state to clear
      api.messaging.sendToAll({
        type: 'scripture-tokens-broadcast',
        lifecycle: 'state',
        stateKey: 'current-scripture-tokens',
        sourceResourceId: resourceId,
        reference: {
          book: '',
          chapter: 0,
          verse: 0,
        },
        tokens: [],
        resourceMetadata: {
          id: resourceKey,
          language,
          languageDirection,
          type: 'scripture',
        },
        timestamp: Date.now(),
      })
      return
    }
    
    // Extract tokens for current verse or verse range
    const tokens = extractOptimizedTokens(loadedContent, currentChapter, currentVerse, endChapter, endVerse)
    
    // Broadcast tokens
    const broadcast: ScriptureTokensBroadcastSignal = {
      type: 'scripture-tokens-broadcast',
      lifecycle: 'state',
      stateKey: 'current-scripture-tokens',
      sourceResourceId: resourceId,
      reference: {
        book: bookCode,
        chapter: currentChapter,
        verse: currentVerse,
        endChapter: endChapter || undefined,
        endVerse: endVerse || undefined,
      },
      tokens,
      resourceMetadata: {
        id: resourceKey,
        language,
        type: 'scripture',
      },
      timestamp: Date.now(),
    }
    
    api.messaging.sendToAll(broadcast)
  }, [resourceId, resourceKey, loadedContent, language, languageDirection, currentChapter, currentVerse, endChapter, endVerse])
  
  // Cleanup: Send empty state on unmount
  // Note: api.messaging.sendToAll is stable, so we don't include it in dependencies
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return () => {
      api.messaging.sendToAll({
        type: 'scripture-tokens-broadcast',
        lifecycle: 'state',
        stateKey: 'current-scripture-tokens',
        sourceResourceId: resourceId,
        reference: {
          book: '',
          chapter: 0,
          verse: 0,
        },
        tokens: [],
        resourceMetadata: {
          id: '',
          language: '',
          type: 'scripture',
        },
        timestamp: Date.now(),
      })
    }
  }, [resourceId])
}
