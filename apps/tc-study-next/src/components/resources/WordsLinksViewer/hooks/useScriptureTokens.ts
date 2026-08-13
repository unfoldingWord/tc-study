/**
 * useScriptureTokens Hook
 *
 * Simple hook to receive scripture tokens from active panels via broadcast.
 * Replaces the complex request/response pattern with a simple state listener.
 *
 * Uses resource-panels STATE subscribe (`useResourceState`).
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { RESOURCE_STATE_KEYS, useResourceState } from '@bt-synergy/resource-panels'
import type { ScriptureTokensBroadcastSignal } from '../../../../signals/studioSignals'

interface UseScriptureTokensOptions {
  resourceId: string
}

interface ScriptureTokensResult {
  tokens: OptimizedToken[]
  reference: {
    book: string
    chapter: number
    verse: number
    endChapter?: number
    endVerse?: number
  } | null
  resourceMetadata: {
    id: string
    language: string
    languageDirection?: 'ltr' | 'rtl'
    type: string
  } | null
  hasTokens: boolean
  sourceResourceId: string | null
}

export function useScriptureTokens({ resourceId }: UseScriptureTokensOptions): ScriptureTokensResult {
  const scriptureTokensBroadcast = useResourceState<ScriptureTokensBroadcastSignal>(
    resourceId,
    RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS
  )

  const isClearMessage =
    scriptureTokensBroadcast &&
    scriptureTokensBroadcast.tokens.length === 0 &&
    !scriptureTokensBroadcast.reference.book

  if (!scriptureTokensBroadcast || isClearMessage) {
    return {
      tokens: [],
      reference: null,
      resourceMetadata: null,
      hasTokens: false,
      sourceResourceId: null,
    }
  }

  return {
    tokens: scriptureTokensBroadcast.tokens,
    reference: scriptureTokensBroadcast.reference,
    resourceMetadata: scriptureTokensBroadcast.resourceMetadata,
    hasTokens: scriptureTokensBroadcast.tokens.length > 0,
    sourceResourceId: scriptureTokensBroadcast.sourceResourceId,
  }
}
