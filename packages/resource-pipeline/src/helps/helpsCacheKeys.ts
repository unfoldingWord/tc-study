/**
 * Persistent helps-text cache key convention.
 *
 * helps-text:{kind}:{resourceKey}@{stamp}:{entryId}
 *
 * Deliberately NOT book-chunked — one row per title/preview string.
 */

export const HELPS_TEXT_PREFIX = 'helps-text:'
export const HELPS_TEXT_VERSION = 1

export type HelpsTextKind = 'ta-title' | 'tw-title' | 'tw-preview'

export function helpsTextKey(
  kind: HelpsTextKind,
  resourceKey: string,
  stamp: string,
  entryId: string
): string {
  return `${HELPS_TEXT_PREFIX}${kind}:${resourceKey}@${stamp}:${entryId}`
}

/** Prefix for every stamp of this kind+resource, for sweeping stale rows. */
export function helpsTextResourcePrefix(kind: HelpsTextKind, resourceKey: string): string {
  return `${HELPS_TEXT_PREFIX}${kind}:${resourceKey}@`
}

/**
 * True when `key` belongs to this kind+resource but carries a different stamp.
 * Keys that do not match the resource prefix return false (not ours to delete).
 */
export function isStaleHelpsTextKey(key: string, currentStamp: string): boolean {
  if (!key.startsWith(HELPS_TEXT_PREFIX)) return false
  // helps-text:{kind}:{resourceKey}@{stamp}:{entryId}
  const afterPrefix = key.slice(HELPS_TEXT_PREFIX.length)
  const atIdx = afterPrefix.lastIndexOf('@')
  if (atIdx < 0) return false
  const afterAt = afterPrefix.slice(atIdx + 1)
  const colonIdx = afterAt.indexOf(':')
  if (colonIdx < 0) return false
  const stamp = afterAt.slice(0, colonIdx)
  return stamp !== currentStamp
}

export function parseHelpsTextStamp(key: string): string | null {
  if (!key.startsWith(HELPS_TEXT_PREFIX)) return null
  const afterPrefix = key.slice(HELPS_TEXT_PREFIX.length)
  const atIdx = afterPrefix.lastIndexOf('@')
  if (atIdx < 0) return null
  const afterAt = afterPrefix.slice(atIdx + 1)
  const colonIdx = afterAt.indexOf(':')
  if (colonIdx < 0) return null
  return afterAt.slice(0, colonIdx)
}
