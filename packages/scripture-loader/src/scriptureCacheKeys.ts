/** Legacy ProcessedScripture cache namespace (flag-off / pre-P2). */
export const LEGACY_SCRIPTURE_PREFIX = 'scripture:'

/** P2 USJ source-of-truth cache namespace. */
export const USJ_SCRIPTURE_PREFIX = 'scripture-usj:'

export function legacyScriptureKey(resourceKey: string, bookId: string): string {
  return `${LEGACY_SCRIPTURE_PREFIX}${resourceKey}:${bookId}`
}

export function usjScriptureKey(resourceKey: string, bookId: string): string {
  return `${USJ_SCRIPTURE_PREFIX}${resourceKey}:${bookId}`
}

export function isUsjScriptureKey(key: string): boolean {
  return key.startsWith(USJ_SCRIPTURE_PREFIX)
}

export function isLegacyScriptureKey(key: string): boolean {
  return key.startsWith(LEGACY_SCRIPTURE_PREFIX) && !key.startsWith(USJ_SCRIPTURE_PREFIX)
}
