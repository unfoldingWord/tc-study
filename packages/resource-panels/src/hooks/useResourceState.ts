import { useCurrentState } from 'linked-panels'
import type { BaseStateSignal } from '../core/types'

/**
 * Subscribe to the current STATE message for a `stateKey`.
 *
 * Thin, typed wrapper around linked-panels `useCurrentState`. Prefer this
 * over importing `useCurrentState` directly so viewers can migrate off the
 * dual-stack linked-panels messaging API.
 *
 * @example
 * ```tsx
 * import {
 *   useResourceState,
 *   RESOURCE_STATE_KEYS,
 *   type ScriptureTokensStateSignal,
 * } from '@bt-synergy/resource-panels'
 *
 * function WordsLinksViewer({ resourceId }: { resourceId: string }) {
 *   const tokens = useResourceState<ScriptureTokensStateSignal>(
 *     resourceId,
 *     RESOURCE_STATE_KEYS.SCRIPTURE_TOKENS
 *   )
 *   // ...
 * }
 * ```
 */
export function useResourceState<T extends BaseStateSignal>(
  resourceId: string,
  stateKey: T['stateKey'] | string
): T | null {
  return useCurrentState<T>(resourceId, stateKey)
}
