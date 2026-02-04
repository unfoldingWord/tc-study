/**
 * Hook for handling scripture content requests from other panels
 * 
 * @deprecated This request/response pattern is being phased out in favor of
 * the broadcast approach (useTokenBroadcast). This hook is kept temporarily
 * for backward compatibility but will be removed in a future version.
 * 
 * Allows other panels (like TWL viewer) to request scripture content
 * from this panel via signals, similar to bt-studio behavior.
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { ProcessedScripture } from '@bt-synergy/usfm-processor'
import { useCallback, useEffect, useRef } from 'react'
import type { ScriptureContentRequestSignal, ScriptureContentResponseSignal } from '../../../../signals/studioSignals'

interface UseContentRequestsOptions {
  resourceId: string
  resourceKey: string
  loadedContent: ProcessedScripture | null
  language?: string
}

export function useContentRequests({
  resourceId,
  resourceKey,
  loadedContent,
  language,
}: UseContentRequestsOptions) {
  // Use ref to avoid stale closures - always reference latest loadedContent
  const loadedContentRef = useRef<ProcessedScripture | null>(loadedContent)
  const previousContentRef = useRef<ProcessedScripture | null>(null)
  
  // Set up signal sender for responses - MUST be declared before useEffect
  const { sendToAll: sendContentResponse } = useSignal<ScriptureContentResponseSignal>(
    'scripture-content-response',
    resourceId,
    {
      type: 'scripture',
      language: language || 'en',
      tags: ['bible'],
    }
  )
  
  useEffect(() => {
    loadedContentRef.current = loadedContent
    
    // If content just became available (transition from null to loaded),
    // proactively send it to any panels that might be waiting
    if (loadedContent && !previousContentRef.current) {
      const book = loadedContent.metadata?.bookCode || ''
      const chaptersCount = loadedContent.chapters.length
      
      // Proactively broadcast content availability to panels that might have requested it earlier
      if (chaptersCount > 0) {
        const firstChapter = loadedContent.chapters[0]
        
        sendContentResponse({
          lifecycle: 'event',
          response: {
            requestId: `proactive-${resourceId}-${Date.now()}`,
            resourceId,
            resourceKey,
            book,
            chapter: firstChapter.number,
            hasContent: true,
            content: loadedContent, // Send full ProcessedScripture (not OptimizedChapter[])
          },
        })
      }
    }
    
    previousContentRef.current = loadedContent
  }, [loadedContent, resourceId, resourceKey, sendContentResponse])

  // Listen for content requests from other panels
  useSignalHandler<ScriptureContentRequestSignal>(
    'scripture-content-request',
    resourceId,
    useCallback((signal) => {
      // Don't respond to our own requests
      if (signal.sourceResourceId === resourceId) {
        return
      }

      const { request } = signal
      const { book, chapter, verse, endVerse, language: requestedLanguage } = request

      // Check if we have the requested content (use ref to get latest value)
      const content = loadedContentRef.current
      if (!content) {
        sendContentResponse({
          lifecycle: 'event',
          response: {
            requestId: String(signal.timestamp),
            resourceId,
            resourceKey,
            book,
            chapter,
            hasContent: false,
            error: 'No content loaded',
          },
        })
        return
      }

      // Check if language matches (if specified)
      if (requestedLanguage && language !== requestedLanguage) {
        sendContentResponse({
          lifecycle: 'event',
          response: {
            requestId: String(signal.timestamp),
            resourceId,
            resourceKey,
            book,
            chapter,
            hasContent: false,
            error: `Language mismatch: requested ${requestedLanguage}, have ${language}`,
          },
        })
        return
      }

      // Check if book matches
      const currentBook = content.metadata?.bookCode?.toUpperCase()
      if (currentBook !== book.toUpperCase()) {
        sendContentResponse({
          lifecycle: 'event',
          response: {
            requestId: String(signal.timestamp),
            resourceId,
            resourceKey,
            book,
            chapter,
            hasContent: false,
            error: `Book mismatch: requested ${book}, have ${currentBook}`,
          },
        })
        return
      }

      // Find the requested chapter
      const requestedChapter = content.chapters.find(ch => ch.number === chapter)
      if (!requestedChapter) {
        sendContentResponse({
          lifecycle: 'event',
          response: {
            requestId: String(signal.timestamp),
            resourceId,
            resourceKey,
            book,
            chapter,
            hasContent: false,
            error: `Chapter ${chapter} not found`,
          },
        })
        return
      }

      // Send ProcessedScripture format directly (useAlignedTokens needs it to access alignedOriginalWordIds)
      // The alignment semantic IDs are already attached by useContent hook
      sendContentResponse({
        lifecycle: 'event',
        response: {
          requestId: String(signal.timestamp),
          resourceId,
          resourceKey,
          book,
          chapter,
          hasContent: true,
          content, // Send full ProcessedScripture (not OptimizedChapter[])
        },
      })
    }, [resourceId, resourceKey, language]), // Using ref for loadedContent to avoid stale closures
    {
      debug: true,
      resourceMetadata: {
        type: 'scripture',
        language: language || 'en',
        tags: ['bible'],
      },
    }
  )
}
