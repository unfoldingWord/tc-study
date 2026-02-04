/**
 * Hook for managing token highlighting state
 * Uses @bt-synergy/resource-panels signal-based API
 * 
 * Matches mobile app's pattern: uses numeric semantic IDs for cross-panel matching
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { WordToken } from '@bt-synergy/usfm-processor'
import { useCallback, useState } from 'react'
import { useCurrentReference } from '../../../../contexts'
import type { TokenClickSignal } from '../../../../signals/studioSignals'
import type { OriginalLanguageToken } from '../types'

export function useHighlighting(resourceId: string, language?: string) {
  const currentRef = useCurrentReference()
  
  // Determine resource metadata for signal system
  const resourceMetadata = {
    type: 'scripture' as const,
    language: language || 'en',
    tags: ['bible'],
  }
  
  // Set up signal sender
  const { sendToAll } = useSignal<TokenClickSignal>(
    'token-click',
    resourceId,
    resourceMetadata
  )
  
  // Store the highlight target (matches mobile app pattern)
  const [highlightTarget, setHighlightTarget] = useState<OriginalLanguageToken | null>(null)

  // Listen for token-click signals from OTHER resources
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback((signal) => {
      // Only process signals from OTHER resources (avoid processing our own broadcasts)
      if (signal.sourceResourceId === resourceId) {
        return
      }
      
      // Create highlight target from the clicked token
      const target: OriginalLanguageToken = {
        semanticId: signal.token.semanticId,
        alignedSemanticIds: signal.token.alignedSemanticIds,
        content: signal.token.content,
        verseRef: signal.token.verseRef,
        strong: signal.token.strong,
        lemma: signal.token.lemma,
        morph: signal.token.morph,
      }
      
      setHighlightTarget(target)
    }, [resourceId]),
    {
      debug: true, // Enable debug logging
      resourceMetadata, // Pass resource metadata for filtering
    }
  )

  const handleTokenClick = useCallback((token: WordToken) => {
    try {
      // WordToken uses 'uniqueId' property (not 'id')
      const tokenId = token.uniqueId || (token as any).id || ''
      const tokenContent = token.content || (token as any).text || ''
      
      // Get verse reference - WordToken has verseRef property
      const verseRef = token.verseRef || `${currentRef.book.toUpperCase()} ${currentRef.chapter}:1`
      
      // Generate semantic ID in format: verseRef:content:occurrence
      // This preserves Unicode characters and matches across languages
      const tokenOccurrence = token.occurrence || 1
      const semanticId = `${verseRef}:${tokenContent}:${tokenOccurrence}`
      
      // For target language tokens, get aligned semantic IDs (uniqueId strings of original language tokens)
      let alignedSemanticIds: string[] | undefined = undefined
      const rawAlign = token.alignedOriginalWordIds || (token as any).align
      if (Array.isArray(rawAlign) && rawAlign.length > 0) {
        // Ensure they're strings
        alignedSemanticIds = rawAlign.map(id => String(id)).filter(Boolean)
      }
      
      // Get position - WordToken position is always an object with start/end
      const position = token.position?.start ?? 0

      // Update local state IMMEDIATELY for instant feedback (matches mobile app pattern)
      setHighlightTarget({
        semanticId: semanticId,
        alignedSemanticIds: alignedSemanticIds,
        content: tokenContent,
        verseRef: verseRef,
        strong: token.alignment?.strong,
        lemma: token.alignment?.lemma,
        morph: token.alignment?.morph,
      })

      // Then send token-click signal to OTHER resources using resource-panels API
      // The signal system automatically adds sourceResourceId, sourceMetadata, and timestamp
      sendToAll({
        lifecycle: 'event',
        token: {
          id: String(tokenId),
          content: String(tokenContent),
          semanticId: semanticId, // Format: verseRef:content:occurrence (preserves Unicode)
          verseRef: String(verseRef),
          position: position,
          strong: token.alignment?.strong,
          lemma: token.alignment?.lemma,
          morph: token.alignment?.morph,
          alignedSemanticIds: alignedSemanticIds, // Semantic IDs this token aligns to
        },
      })
    } catch (error) {
      console.error('❌ Error in handleTokenClick:', error)
    }
  }, [sendToAll, currentRef, resourceId])

  return {
    highlightTarget,
    selectedTokenId: highlightTarget?.semanticId || null,
    handleTokenClick,
  }
}

// Export a helper to get token ID (handles both uniqueId and id properties)
export function getTokenId(token: WordToken): string {
  return token.uniqueId || (token as any).id || ''
}

