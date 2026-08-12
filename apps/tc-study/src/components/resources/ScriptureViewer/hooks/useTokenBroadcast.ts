import { RESOURCE_STATE_KEYS, useResourceStateSender } from '@bt-synergy/resource-panels'
import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import { useEffect } from 'react'
import { useAppStore } from '../../../../contexts/AppContext'
import { isScriptureTokensOwner } from '../../../../features/messaging/scriptureTokensOwnership'
import type { ScriptureTokensBroadcastSignal } from '../../../../signals/studioSignals'
import { extractUsjBroadcastTokens } from '../utils/extractUsjBroadcastTokens'

interface UseTokenBroadcastOptions {
  resourceId: string
  resourceKey: string
  viewModel: UsjScriptureViewModel | null
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
  viewModel,
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
    { clearOnUnmount: isOwner }
  )

  useEffect(() => {
    if (!isOwner) return

    const bookCode = viewModel?.bookCode || ''

    if (!viewModel || !bookCode || !currentChapter || !currentVerse) {
      sendState({
        reference: { book: '', chapter: 0, verse: 0 },
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

    sendState({
      reference: {
        book: bookCode,
        chapter: currentChapter,
        verse: currentVerse,
        endChapter: endChapter || undefined,
        endVerse: endVerse || undefined,
      },
      tokens: extractUsjBroadcastTokens(
        viewModel,
        currentChapter,
        currentVerse,
        endChapter,
        endVerse
      ),
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
    viewModel,
    language,
    languageDirection,
    currentChapter,
    currentVerse,
    endChapter,
    endVerse,
    sendState,
  ])

  useEffect(() => {
    if (!isOwner) clearState()
  }, [isOwner, clearState])
}
