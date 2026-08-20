/**
 * Default helps-pane language (Epic #21 / issue #22).
 *
 * Single source of truth: change {@link DEFAULT_HELPS_LANGUAGE_CODE} to change
 * the first-launch default. Regional gateway inference is intentionally not
 * implemented; {@link resolveHelpsLanguage} accepts the text language so that
 * later slices can use it without a signature change.
 */

export const DEFAULT_HELPS_LANGUAGE_CODE = 'en'

export const HELPS_LANGUAGE_STORAGE_KEY = 'tc-study:helps-language'

/**
 * Resolve the helps language for a text-pane language.
 * Today always returns {@link DEFAULT_HELPS_LANGUAGE_CODE} (even if `en` lacks
 * helps for a hypothetical mode — mode-aware fallback is later).
 */
export function resolveHelpsLanguage(_textLanguageCode: string): string {
  return DEFAULT_HELPS_LANGUAGE_CODE
}

export function readPersistedHelpsLanguage(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(HELPS_LANGUAGE_STORAGE_KEY)
    const code = typeof raw === 'string' ? raw.trim() : ''
    return code || null
  } catch {
    return null
  }
}

export function writePersistedHelpsLanguage(code: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(HELPS_LANGUAGE_STORAGE_KEY, code)
  } catch {
    /* quota / private mode */
  }
}

/**
 * First resolve persists the default so restart is stable.
 * Later text-language changes do not overwrite the stored helps language.
 */
export function resolveAndPersistHelpsLanguage(textLanguageCode: string): string {
  const existing = readPersistedHelpsLanguage()
  if (existing) return existing
  const resolved = resolveHelpsLanguage(textLanguageCode)
  writePersistedHelpsLanguage(resolved)
  return resolved
}
