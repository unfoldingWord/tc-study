import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { UsjWordToken } from '@bt-synergy/scripture-loader'
import { useCallback, useRef, useState } from 'react'
import { useCurrentReference } from '../../../../contexts'
import type { TokenClickSignal, VerseFilterSignal } from '../../../../signals/studioSignals'
import type { OriginalLanguageToken } from '../types'
import { semanticIdKey } from '../utils/wordIdentity'

export function useHighlighting(
  resourceId: string,
  language?: string,
  underlinedSemanticIds?: Set<string>,
) {
  const currentRef = useCurrentReference()

  const resourceMetadata = {
    type: 'scripture' as const,
    language: language || 'en',
    tags: ['bible'],
  }

  const { sendToAll } = useSignal<TokenClickSignal>('token-click', resourceId, resourceMetadata)
  const { sendToAll: sendVerseFilter } = useSignal<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    resourceMetadata
  )

  const [highlightTarget, setHighlightTarget] = useState<OriginalLanguageToken | null>(null)
  const currentRefRef = useRef(currentRef)
  currentRefRef.current = currentRef
  const underlinedRef = useRef(underlinedSemanticIds)
  underlinedRef.current = underlinedSemanticIds

  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback((signal) => {
      if (signal.sourceResourceId === resourceId) return
      setHighlightTarget({
        semanticId: signal.token.semanticId,
        alignedSemanticIds: signal.token.alignedSemanticIds,
        content: signal.token.content,
        verseRef: signal.token.verseRef,
        strong: signal.token.strong,
        lemma: signal.token.lemma,
        morph: signal.token.morph,
      })
    }, [resourceId]),
    { debug: true, resourceMetadata }
  )

  const handleTokenClick = useCallback(
    (token: UsjWordToken) => {
      try {
        const currentRefSnapshot = currentRefRef.current
        const underlinedSnapshot = underlinedRef.current
        const { semanticId, verseRef, content: tokenContent } = token
        const alignedSemanticIds =
          token.alignedOriginalWordIds.length > 0
            ? [...token.alignedOriginalWordIds]
            : undefined

        const tokenKey = semanticIdKey(semanticId)
        const alignedKeys = alignedSemanticIds?.map(semanticIdKey) ?? []
        const hasCoverage =
          underlinedSnapshot && underlinedSnapshot.size > 0
            ? underlinedSnapshot.has(tokenKey) ||
              alignedKeys.some((k) => underlinedSnapshot.has(k))
            : false

        const effectiveAlignedIds = alignedSemanticIds ?? [semanticId]

        setHighlightTarget({
          semanticId,
          alignedSemanticIds: effectiveAlignedIds,
          content: tokenContent,
          verseRef,
        })

        sendToAll({
          lifecycle: 'event',
          token: {
            id: semanticId,
            content: tokenContent,
            semanticId,
            verseRef,
            position: 0,
            alignedSemanticIds: effectiveAlignedIds,
            hasHelpsCoverage: hasCoverage,
          },
        })

        if (!hasCoverage) {
          const refMatch = verseRef.match(/\w+\s+(\d+):(\d+)/)
          const chapter = refMatch ? parseInt(refMatch[1], 10) : currentRefSnapshot.chapter
          const verse = refMatch ? parseInt(refMatch[2], 10) : undefined
          sendVerseFilter({ lifecycle: 'event', filter: { chapter, verse } })
        }
      } catch (error) {
        console.error('❌ Error in handleTokenClick:', error)
      }
    },
    [sendToAll, sendVerseFilter]
  )

  const handleVerseFilter = useCallback(
    (chapter: number, verse?: number) => {
      setHighlightTarget(null)
      sendVerseFilter({ lifecycle: 'event', filter: { chapter, verse } })
    },
    [sendVerseFilter]
  )

  return {
    highlightTarget,
    selectedTokenId: highlightTarget?.semanticId || null,
    handleTokenClick,
    handleVerseFilter,
  }
}
