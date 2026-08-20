/**
 * App-wide panel-entry predicate — persistId + `:panel-N` via PanelEntryRegistry.
 * OBS-safe: never prefix-match `__combined-helps` without a colon.
 */

import type { PanelEntryDefinition } from '@bt-synergy/resource-types'
import { getActivePanelEntryRegistry } from '../../resourceTypes/activeRegistry'

export function resolvePanelEntryForKey(
  key: string | undefined | null
): PanelEntryDefinition | undefined {
  if (!key) return undefined
  return getActivePanelEntryRegistry()?.resolve(key)
}

export function resolveCompositionForPersistId(
  key: string | undefined | null
): PanelEntryDefinition | undefined {
  const entry = resolvePanelEntryForKey(key)
  return entry?.kind === 'composition' ? entry : undefined
}

export function isRegisteredCompositionPersistId(key: string | undefined | null): boolean {
  return resolveCompositionForPersistId(key) != null
}
