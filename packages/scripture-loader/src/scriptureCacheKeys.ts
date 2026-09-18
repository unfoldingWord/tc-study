/**
 * @deprecated Hard-deprecated. Loader never reads/writes this namespace.
 * Leftover IndexedDB keys may remain until users clear cache once.
 */
export const LEGACY_SCRIPTURE_PREFIX = 'scripture:'

/** Sole scripture cache SoT namespace. */
export const USJ_SCRIPTURE_PREFIX = 'scripture-usj:'

/** One-shot cutover hint for users/devs when stale/legacy cache blocks load. */
export const STALE_SCRIPTURE_CACHE_HINT =
  'Clear IndexedDB keys starting with "scripture:" and "scripture-usj:" (or wipe tc-study-cache), reload, and re-download. Only scripture-usj: is supported.'

/**
 * @deprecated Do not read or write. Use usjScriptureKey().
 */
export function legacyScriptureKey(resourceKey: string, bookId: string): string {
  return `${LEGACY_SCRIPTURE_PREFIX}${resourceKey}:${bookId}`
}

export function usjScriptureKey(resourceKey: string, bookId: string): string {
  return `${USJ_SCRIPTURE_PREFIX}${resourceKey}:${bookId.toLowerCase()}`
}

/** One-chapter SoT: `scripture-usj:{resourceKey}:{book}:{chapter}`. */
export function usjScriptureChapterKey(
  resourceKey: string,
  bookId: string,
  chapter: number
): string {
  return `${usjScriptureKey(resourceKey, bookId)}:${chapter}`
}

export function isUsjScriptureKey(key: string): boolean {
  return key.startsWith(USJ_SCRIPTURE_PREFIX)
}

/** True for `scripture-usj:{resourceKey}:{book}:{chapter}` (not `:alignments`). */
export function isUsjScriptureChapterKey(key: string): boolean {
  if (!key.startsWith(USJ_SCRIPTURE_PREFIX)) return false
  const rest = key.slice(USJ_SCRIPTURE_PREFIX.length)
  const parts = rest.split(':')
  const last = parts[parts.length - 1]
  return parts.length >= 2 && last !== undefined && /^\d+$/.test(last)
}

/**
 * @deprecated Detection only (cleanup / warnings). Never serve these keys.
 */
export function isLegacyScriptureKey(key: string): boolean {
  return key.startsWith(LEGACY_SCRIPTURE_PREFIX) && !key.startsWith(USJ_SCRIPTURE_PREFIX)
}
