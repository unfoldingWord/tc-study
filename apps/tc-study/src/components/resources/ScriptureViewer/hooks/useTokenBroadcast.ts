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
      let firstWordLogged = false
      verseData.wordTokens.forEach((token: WordToken) => {
        const verseRef = `${bookCode} ${chapterNum}:${verseNum}`
        const occurrence = token.occurrence || 1
        const wordToken = token as WordToken & { alignedOriginalWordIds?: string[] }
        if (token.type === 'word' && !firstWordLogged && typeof console !== 'undefined' && console.log) {
          console.log('[TN Quote] extractOptimizedTokens first word in range', {
            verseRef,
            content: token.content,
            alignedOriginalWordIds: wordToken.alignedOriginalWordIds ?? 'none',
          })
          firstWordLogged = true
        }

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
            alignedOriginalWordIds: wordToken.alignedOriginalWordIds || [],
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
      if (typeof console !== 'undefined' && console.log) {
        console.log('[TN Quote] useTokenBroadcast early return', {
          hasLoadedContent: !!loadedContent,
          bookCode,
          currentChapter,
          currentVerse,
        })
      }
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
    
    // [TN Quote] inspect loadedContent before extract
    const firstChapter = loadedContent.chapters?.[0]
    const firstVerse = firstChapter?.verses?.[0]
    const firstWordInContent = firstVerse?.wordTokens?.find((t: WordToken) => t.type === 'word') as WordToken & { alignedOriginalWordIds?: string[] } | undefined
    if (typeof console !== 'undefined' && console.log) {
      console.log('[TN Quote] useTokenBroadcast before extract', {
        resourceKey,
        alignmentsCount: loadedContent.alignments?.length ?? 0,
        firstVerseRef: firstVerse?.reference,
        firstWordAlign: firstWordInContent?.alignedOriginalWordIds ?? 'no word token',
      })
    }

    // Extract tokens for current verse or verse range
    const tokens = extractOptimizedTokens(loadedContent, currentChapter, currentVerse, endChapter, endVerse)
    const tokensWithAlign = tokens.filter((t: any) => (t.alignedOriginalWordIds?.length ?? 0) > 0)
    if (typeof console !== 'undefined' && console.log) {
      console.log('[TN Quote] useTokenBroadcast after extract', {
        tokensCount: tokens.length,
        tokensWithAlignedIds: tokensWithAlign.length,
        sample: tokensWithAlign[0]?.alignedOriginalWordIds ?? 'none',
      })
    }

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
