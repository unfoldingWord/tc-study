/**
 * Last owner-scripture SCRIPTURE_TOKENS snapshot for late subscribers.
 *
 * Linked-panels STATE is delivered only to resources registered at send time.
 * CombinedHelps unmounts in scripture mode and remounts on switch-back, so it
 * misses the last broadcast unless we keep it here (same pattern as OBS quotes).
 */

import type { OptimizedToken } from '@bt-synergy/resource-parsers'

export interface ScriptureTokensSnapshot {
  tokens: readonly OptimizedToken[]
  reference: {
    book: string
    chapter: number
    verse: number
    endChapter?: number
    endVerse?: number
  }
  resourceMetadata: {
    id: string
    language: string
    languageDirection?: 'ltr' | 'rtl'
    type: string
  }
  sourceResourceId: string | null
}

let current: ScriptureTokensSnapshot | null = null
const listeners = new Set<() => void>()

export function scriptureTokensSnapshotKey(
  payload: ScriptureTokensSnapshot | null | undefined
): string {
  if (!payload) return ''
  const ref = payload.reference
  return [
    payload.sourceResourceId ?? '',
    ref.book,
    ref.chapter,
    ref.verse,
    ref.endChapter ?? '',
    ref.endVerse ?? '',
    payload.tokens.length,
    payload.resourceMetadata.id,
    payload.resourceMetadata.language,
  ].join(':')
}

export function scriptureTokensHaveEntries(
  payload: ScriptureTokensSnapshot | null | undefined
): boolean {
  return !!payload && payload.tokens.length > 0 && !!payload.reference.book
}

/**
 * Prefer live STATE when it has tokens; otherwise the hydrate snapshot
 * (CombinedHelps remounted after scripture already broadcast).
 */
export function preferHydratedScriptureTokens(
  messaging: ScriptureTokensSnapshot | null | undefined,
  published: ScriptureTokensSnapshot | null | undefined
): ScriptureTokensSnapshot | null {
  if (scriptureTokensHaveEntries(messaging)) return messaging ?? null
  if (scriptureTokensHaveEntries(published)) return published ?? null
  return messaging ?? published ?? null
}

export function getScriptureTokensSnapshot(): ScriptureTokensSnapshot | null {
  return current
}

export function subscribeScriptureTokensSnapshot(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

export function publishScriptureTokens(next: ScriptureTokensSnapshot | null): void {
  if (current === next) return
  if (scriptureTokensSnapshotKey(current) === scriptureTokensSnapshotKey(next)) return
  current = next
  for (const listener of listeners) listener()
}

/** Test-only: drop the snapshot between cases. */
export function resetScriptureTokensStore(): void {
  current = null
  listeners.clear()
}
