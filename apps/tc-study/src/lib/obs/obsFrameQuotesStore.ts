/**
 * Last CombinedHelps OBS quote snapshot for late subscribers.
 *
 * Linked-panels STATE is delivered only to resources registered at send time.
 * On URL load / refresh, CombinedHelps often publishes before ObsViewer
 * subscribes; navigation later re-sends. This store lets ObsViewer apply the
 * already-built map on first mount without a nav event.
 */

import type { MergedObsFrameQuotes } from '@bt-synergy/resource-panels'
import { obsQuotesSnapshotKey } from './buildObsFrameQuotes'

let current: MergedObsFrameQuotes | null = null
const listeners = new Set<() => void>()

export function getObsFrameQuotes(): MergedObsFrameQuotes | null {
  return current
}

export function subscribeObsFrameQuotes(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function publishObsFrameQuotes(next: MergedObsFrameQuotes | null): void {
  if (current === next) return
  if (obsQuotesSnapshotKey(current) === obsQuotesSnapshotKey(next)) return
  current = next
  for (const listener of listeners) listener()
}

/** Test-only: drop the snapshot between cases. */
export function resetObsFrameQuotesStore(): void {
  current = null
  listeners.clear()
}
