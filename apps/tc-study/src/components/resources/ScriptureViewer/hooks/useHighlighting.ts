import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { UsjWordToken } from '@bt-synergy/scripture-loader'
import { useCallback, useRef, useState } from 'react'
import { useCurrentReference } from '../../../../contexts'
import type { TokenClickSignal, VerseFilterSignal } from '../../../../signals/studioSignals'
import type { OriginalLanguageToken } from '../types'
import { foldHighlightTarget, tokenMatchesHighlightTarget } from '../utils/tokenHighlight'
import { semanticIdKey } from '../utils/wordIdentity'

function targetFromSignalToken(
  token: NonNullable<TokenClickSignal['token']>
): OriginalLanguageToken {
  return foldHighlightTarget({
    semanticId: token.semanticId,
    alignedSemanticIds: token.alignedSemanticIds,
    content: token.content,
    verseRef: token.verseRef,
    strong: token.strong,
    lemma: token.lemma,
    morph: token.morph,
  })!
}

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
  const highlightTargetRef = useRef(highlightTarget)
  highlightTargetRef.current = highlightTarget
  /** True when the active selection also owns a scripture-driven verse filter (uncovered click). */
  const ownsVerseFilterRef = useRef(false)

  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback((signal) => {
      if (signal.sourceResourceId === resourceId) return
      if (signal.token === null) {
        ownsVerseFilterRef.current = false
        setHighlightTarget(null)
        return
      }
      setHighlightTarget(targetFromSignalToken(signal.token))
    }, [resourceId]),
    { debug: false, resourceMetadata }
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

        // Toggle-off: clicking the active highlight clears selection + owned filters.
        if (tokenMatchesHighlightTarget(token, highlightTargetRef.current)) {
          setHighlightTarget(null)
          sendToAll({ lifecycle: 'event', token: null })
          if (ownsVerseFilterRef.current) {
            sendVerseFilter({ lifecycle: 'event', filter: null })
            ownsVerseFilterRef.current = false
          }
          return
        }

        const tokenKey = semanticIdKey(semanticId)
        const alignedKeys = alignedSemanticIds?.map(semanticIdKey) ?? []
        const hasCoverage =
          underlinedSnapshot && underlinedSnapshot.size > 0
            ? underlinedSnapshot.has(tokenKey) ||
              alignedKeys.some((k) => underlinedSnapshot.has(k))
            : false

        const effectiveAlignedIds = alignedSemanticIds ?? [semanticId]

        setHighlightTarget(
          foldHighlightTarget({
            semanticId,
            content: tokenContent,
            verseRef,
            alignedSemanticIds: effectiveAlignedIds,
          })
        )

        ownsVerseFilterRef.current = !hasCoverage

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
      ownsVerseFilterRef.current = false
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
