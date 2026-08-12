/**
 * Hook for broadcasting scripture tokens to other panels
 *
 * Broadcasts current scripture tokens as a STATE message that persists
 * until unmounted or navigation changes. Other panels can access this
 * via useResourceState(resourceId, RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS).
 *
 * Single-owner policy: only lastActive (else anchor) scripture may publish
 * to the shared SCRIPTURE_TOKENS key — avoids multi-panel last-writer-wins.
 * When neither is set, nobody publishes (bootstrap deny).
 */

import { RESOURCE_STATE_KEYS, useResourceStateSender } from '@bt-synergy/resource-panels'
import type { ProcessedScripture } from '@bt-synergy/usfm-processor'
import { useEffect } from 'react'
import { useAppStore } from '../../../../contexts/AppContext'
import { isScriptureTokensOwner } from '../../../../features/messaging/scriptureTokensOwnership'
import { extractOptimizedTokens } from '../../../../features/helps/scriptureTokensBroadcast'
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
  const lastActiveScriptureResourceId = useAppStore((s) => s.lastActiveScriptureResourceId)
  const anchorResourceId = useAppStore((s) => s.anchorResourceId)
  const isOwner = isScriptureTokensOwner({
    resourceId,
    lastActiveScriptureResourceId,
    anchorResourceId,
  })

  const { sendState, clearState } = useResourceStateSender<ScriptureTokensBroadcastSignal>(
    'scripture-tokens-broadcast',
    resourceId,
    RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS,
    'scripture',
    // Owner clears via clearState on leave; non-owners must not tombstone the owner's key
    { clearOnUnmount: isOwner }
  )

  // Broadcast tokens whenever content or navigation changes (owner only).
  useEffect(() => {
    if (!isOwner) return

    const bookCode = loadedContent?.metadata?.bookCode || ''

    if (!loadedContent || !bookCode || !currentChapter || !currentVerse) {
      sendState({
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
      })
      return
    }

    const tokens = extractOptimizedTokens(
      loadedContent,
      currentChapter,
      currentVerse,
      endChapter,
      endVerse
    )

    sendState({
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
        languageDirection,
        type: 'scripture',
      },
    })
  }, [
    isOwner,
    resourceId,
    resourceKey,
    loadedContent,
    language,
    languageDirection,
    currentChapter,
    currentVerse,
    endChapter,
    endVerse,
  ])

  // When ownership is lost (another scripture became lastActive), tombstone only if we own the key.
  useEffect(() => {
    if (!isOwner) {
      clearState()
    }
  }, [isOwner, clearState])
}
