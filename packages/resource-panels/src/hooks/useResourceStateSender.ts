import { useCallback, useEffect, useRef } from 'react'
import { useResourceAPI } from 'linked-panels'
import type { BaseStateSignal, SignalType, ResourceType, PanelResourceMetadata } from '../core/types'
import { clearResourceState } from '../state/clearResourceState'

type StatePayload<T extends BaseStateSignal> = Omit<
  T,
  | 'type'
  | 'lifecycle'
  | 'stateKey'
  | 'sourceResourceId'
  | 'sourceMetadata'
  | 'sourceResourceType'
  | 'timestamp'
>

export interface UseResourceStateSenderOptions {
  /**
   * When true (default), clear this key on unmount via messagingSystem.clearState
   * if this resource was the last publisher — no sendToAll, so no
   * "Sender resource does not exist" noise.
   */
  clearOnUnmount?: boolean
}

/**
 * Send STATE lifecycle messages for a fixed `stateKey`.
 *
 * Wraps linked-panels `useResourceAPI().messaging.sendToAll` and injects
 * `lifecycle: 'state'`, `stateKey`, `sourceResourceId`, and `timestamp`.
 *
 * @example
 * ```tsx
 * const { sendState } = useResourceStateSender<ScriptureTokensStateSignal>(
 *   'scripture-tokens-broadcast',
 *   resourceId,
 *   RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS,
 *   { type: 'scripture' }
 * )
 *
 * sendState({
 *   reference: { book: 'JHN', chapter: 1, verse: 1 },
 *   tokens: [...],
 *   resourceMetadata: { id: resourceKey, language: 'en', type: 'scripture' },
 * })
 * ```
 */
export function useResourceStateSender<T extends BaseStateSignal>(
  signalType: SignalType<T>,
  resourceId: string,
  stateKey: T['stateKey'] | string,
  resourceMetadata?: ResourceType | PanelResourceMetadata,
  options?: UseResourceStateSenderOptions
) {
  const clearOnUnmount = options?.clearOnUnmount !== false

  const metadata: PanelResourceMetadata =
    typeof resourceMetadata === 'string'
      ? { type: resourceMetadata }
      : resourceMetadata || {}

  const api = useResourceAPI<T>(resourceId)
  const apiRef = useRef(api)
  apiRef.current = api

  /**
   * Broadcast a STATE message. Latest message for `stateKey` supersedes prior.
   * Pass empty payload fields (e.g. `tokens: []`) to clear consumers.
   */
  const sendState = useCallback(
    (signalData: StatePayload<T>) => {
      if (!apiRef.current?.messaging) {
        console.warn(`⚠️ [${resourceId}] STATE messaging API not available`)
        return 0
      }

      const fullSignal = {
        type: signalType,
        lifecycle: 'state' as const,
        stateKey,
        sourceResourceId: resourceId,
        timestamp: Date.now(),
        sourceMetadata: metadata,
        sourceResourceType: metadata.type,
        ...signalData,
      } as unknown as T

      return apiRef.current.messaging.sendToAll(fullSignal)
    },
    [signalType, stateKey, resourceId, metadata]
  )

  /**
   * Send STATE to a specific panel (same payload injection as `sendState`).
   */
  const sendStateToPanel = useCallback(
    (panelId: string, signalData: StatePayload<T>) => {
      if (!apiRef.current?.messaging) {
        console.warn(`⚠️ [${resourceId}] STATE messaging API not available`)
        return 0
      }

      const fullSignal = {
        type: signalType,
        lifecycle: 'state' as const,
        stateKey,
        sourceResourceId: resourceId,
        timestamp: Date.now(),
        sourceMetadata: metadata,
        sourceResourceType: metadata.type,
        ...signalData,
      } as unknown as T

      return apiRef.current.messaging.sendToPanel(panelId, fullSignal)
    },
    [signalType, stateKey, resourceId, metadata]
  )

  /** Clear this key if we were the last publisher (no sendToAll). */
  const clearState = useCallback(() => {
    clearResourceState(resourceId, String(stateKey))
  }, [resourceId, stateKey])

  useEffect(() => {
    if (!clearOnUnmount) return
    return () => {
      clearResourceState(resourceId, String(stateKey))
    }
  }, [clearOnUnmount, resourceId, stateKey])

  return {
    /** Broadcast STATE to all resources */
    sendState,
    /** Send STATE to one panel */
    sendStateToPanel,
    /** Tombstone/clear without sendToAll */
    clearState,
    /** Fixed state key for this sender instance */
    stateKey,
    /** Resource id that owns this sender */
    resourceId,
  }
}
