/**
 * Hook for managing token highlighting state
 * Uses @bt-synergy/resource-panels signal-based API
 * 
 * Matches mobile app's pattern: uses numeric semantic IDs for cross-panel matching
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { WordToken } from '@bt-synergy/usfm-processor'
import { useCallback, useRef, useState } from 'react'
import { useCurrentReference } from '../../../../contexts'
import type { TokenClickSignal, VerseFilterSignal } from '../../../../signals/studioSignals'
import type { OriginalLanguageToken } from '../types'

export function useHighlighting(
  resourceId: string,
  language?: string,
  underlinedSemanticIds?: Set<string>,
) {
  const currentRef = useCurrentReference()
  
  // Determine resource metadata for signal system
  const resourceMetadata = {
    type: 'scripture' as const,
    language: language || 'en',
    tags: ['bible'],
  }
  
  // Set up signal senders
  const { sendToAll } = useSignal<TokenClickSignal>(
    'token-click',
    resourceId,
    resourceMetadata
  )
  
  const { sendToAll: sendVerseFilter } = useSignal<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    resourceMetadata
  )
  
  // Store the highlight target (matches mobile app pattern)
  const [highlightTarget, setHighlightTarget] = useState<OriginalLanguageToken | null>(null)

  // Refs so handleTokenClick can read the latest values without them being deps,
  // keeping the callback identity stable across verse changes and underline updates.
  const currentRefRef = useRef(currentRef)
  currentRefRef.current = currentRef
  const underlinedRef = useRef(underlinedSemanticIds)
  underlinedRef.current = underlinedSemanticIds

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
      const tokenId = token.uniqueId || ''
      const tokenContent = token.content || ''

      // Read latest values from refs (avoids stale-closure without adding them as deps)
      const currentRefSnapshot = currentRefRef.current
      const underlinedSnapshot = underlinedRef.current
      
      // Get verse reference - WordToken has verseRef property
      const verseRef = token.verseRef || `${currentRefSnapshot.book.toUpperCase()} ${currentRefSnapshot.chapter}:1`
      
      // Generate semantic ID in format: verseRef:content:occurrence
      // This preserves Unicode characters and matches across languages
      const tokenOccurrence = token.occurrence || 1
      const semanticId = `${verseRef}:${tokenContent}:${tokenOccurrence}`
      
      // For target language tokens, get aligned semantic IDs (original language token IDs)
      const rawAlign = token.alignedOriginalWordIds
      const alignedSemanticIds: string[] | undefined =
        Array.isArray(rawAlign) && rawAlign.length > 0
          ? rawAlign.map((id: unknown) => String(id)).filter(Boolean)
          : undefined

      // Get position - WordToken position is always an object with start/end
      const position = token.position?.start ?? 0

      // Determine if this token is covered by at least one TN/TWL entry (underlined).
      // - OL tokens: match by their own semantic ID
      // - Target language tokens: match by any of their aligned OL IDs
      // Coverage is a hint for helps viewers (token filter vs verse filter) — it must NOT
      // block scripture↔scripture highlighting (OL click → aligned Bible highlight).
      const tokenKey = semanticId.toLowerCase()
      const alignedKeys = alignedSemanticIds?.map((id) => id.toLowerCase()) ?? []
      const hasCoverage =
        underlinedSnapshot && underlinedSnapshot.size > 0
          ? underlinedSnapshot.has(tokenKey) ||
            alignedKeys.some((k) => underlinedSnapshot.has(k))
          : false

      // For OL tokens (no alignedSemanticIds), broadcast their own ID so aligned Bibles /
      // TN/TWL can match via alignedOriginalWordIds / quote semantic IDs.
      const effectiveAlignedIds = alignedSemanticIds ?? [semanticId]

      // Always update local highlight + broadcast token-click so other scripture panels
      // can highlight aligned words regardless of TN/TWL coverage.
      setHighlightTarget({
        semanticId: semanticId,
        alignedSemanticIds: effectiveAlignedIds,
        content: tokenContent,
        verseRef: verseRef,
        strong: token.alignment?.strong,
        lemma: token.alignment?.lemma,
        morph: token.alignment?.morph,
      })

      sendToAll({
        lifecycle: 'event',
        token: {
          id: String(tokenId),
          content: String(tokenContent),
          semanticId: semanticId,
          verseRef: String(verseRef),
          position: position,
          strong: token.alignment?.strong,
          lemma: token.alignment?.lemma,
          morph: token.alignment?.morph,
          alignedSemanticIds: effectiveAlignedIds,
          hasHelpsCoverage: hasCoverage,
        },
      })

      // Uncovered clicks: also send verse-filter so helps viewers can narrow to the verse
      // instead of applying an empty token filter.
      if (!hasCoverage) {
        const refMatch = verseRef.match(/\w+\s+(\d+):(\d+)/)
        const chapter = refMatch ? parseInt(refMatch[1], 10) : currentRefSnapshot.chapter
        const verse = refMatch ? parseInt(refMatch[2], 10) : undefined
        sendVerseFilter({ lifecycle: 'event', filter: { chapter, verse } })
      }
    } catch (error) {
      console.error('❌ Error in handleTokenClick:', error)
    }
   
  }, [sendToAll, sendVerseFilter])

  const handleVerseFilter = useCallback((chapter: number, verse?: number) => {
    setHighlightTarget(null)
    sendVerseFilter({
      lifecycle: 'event',
      filter: { chapter, verse },
    })
  }, [sendVerseFilter])

  return {
    highlightTarget,
    selectedTokenId: highlightTarget?.semanticId || null,
    handleTokenClick,
    handleVerseFilter,
  }
}

// Export a helper to get token ID
export function getTokenId(token: WordToken): string {
  return token.uniqueId || ''
}

