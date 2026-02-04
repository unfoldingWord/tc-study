/**
 * useScriptureTokens Hook
 * 
 * Simple hook to receive scripture tokens from active panels via broadcast.
 * Replaces the complex request/response pattern with a simple state listener.
 * 
 * Note: Uses useCurrentState from linked-panels to receive STATE lifecycle signals.
 * useSignalHandler from @bt-synergy/resource-panels only works with EVENT lifecycle signals.
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { useCurrentState } from 'linked-panels'
import { useEffect } from 'react'
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
  // Use useCurrentState from linked-panels to receive state lifecycle signals
  const scriptureTokensBroadcast = useCurrentState<ScriptureTokensBroadcastSignal>(
    resourceId,
    'current-scripture-tokens'
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
