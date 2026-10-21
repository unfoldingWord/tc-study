/**
 * Shared SoT for the gateway scripture catalog key used by helps quote/align.
 *
 * Helps must not depend on SCRIPTURE_TOKENS (or ScriptureViewer mount) for
 * identity. The scripture panel writes this key when it selects a resource;
 * quote/align then load prepared: / helps-quote: / helps-align: via that key.
 * SCRIPTURE_TOKENS remain optional for live underlines when a panel is mounted.
 */

import { useSyncExternalStore } from 'react'
import { getScriptureResources } from '../nav/bcvNavHelpers'
import type { ResourceInfo } from '../../contexts/types'

let sharedTargetKey: string | null = null
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

export function getHelpsTargetScriptureKey(): string | null {
  return sharedTargetKey
}

/**
 * Persist the catalog key (not panel instance id) when scripture selects a
 * resource. Survives collapsed / unmounted ScriptureViewer and passage
 * SCRIPTURE_TOKENS invalidates.
 */
export function setHelpsTargetScriptureKey(key: string | null | undefined): void {
  const next = key?.trim() || null
  if (next === sharedTargetKey) return
  sharedTargetKey = next
  notify()
}

export function subscribeHelpsTargetScriptureKey(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

/** Test-only: clear between cases. */
export function resetHelpsTargetScriptureKey(): void {
  sharedTargetKey = null
  listeners.clear()
}

export function useHelpsTargetScriptureKey(): string | null {
  return useSyncExternalStore(
    subscribeHelpsTargetScriptureKey,
    getHelpsTargetScriptureKey,
    getHelpsTargetScriptureKey
  )
}

export function catalogKeyFromResource(
  resource: { resourceKey?: string; key?: string; id?: string } | null | undefined
): string | null {
  if (!resource) return null
  const key = resource.resourceKey ?? resource.key ?? resource.id
  return key && String(key).trim() ? String(key).trim() : null
}

/**
 * Prefer shared SoT (panel selection) → live broadcast → durable last-known →
 * first non-OL scripture in the preferred gateway language.
 */
export function resolveHelpsTargetScriptureKey(args: {
  /** Explicit override; defaults to getHelpsTargetScriptureKey(). */
  sharedKey?: string | null
  broadcastKey?: string | null
  lastKnownKey?: string | null
  loadedResources?: Record<string, ResourceInfo | undefined> | null
  preferLanguage?: string | null
}): string | null {
  const shared = (args.sharedKey !== undefined
    ? args.sharedKey
    : getHelpsTargetScriptureKey()
  )?.trim()
  if (shared) return shared

  const broadcast = args.broadcastKey?.trim()
  if (broadcast) return broadcast

  const lastKnown = args.lastKnownKey?.trim()
  if (lastKnown) return lastKnown

  const loaded = args.loadedResources
  if (!loaded) return null
  const scripture = getScriptureResources(loaded, args.preferLanguage ?? undefined)
  for (const row of scripture) {
    const key = catalogKeyFromResource(row)
    if (key) return key
  }
  return null
}
