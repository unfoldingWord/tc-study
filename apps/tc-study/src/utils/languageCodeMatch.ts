/**
 * Language-code equality for catalog keys and URL/cache lookups.
 * Door43 English is `en`; some sessions persist ISO 639-3 `eng`.
 */

const ENGLISH_ALIASES = new Set(['en', 'eng'])

export function primaryLanguageSegment(code: string | null | undefined): string {
  return String(code || '')
    .trim()
    .split(/[-_/]/)[0]!
    .toLowerCase()
}

export function languageCodesMatch(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = primaryLanguageSegment(left)
  const b = primaryLanguageSegment(right)
  if (!a || !b) return false
  if (a === b) return true
  return ENGLISH_ALIASES.has(a) && ENGLISH_ALIASES.has(b)
}

/** Door43 catalog query uses `en`, not `eng`. */
export function door43LanguageQueryCode(code: string): string {
  const trimmed = code.trim()
  return primaryLanguageSegment(trimmed) === 'eng' ? 'en' : trimmed
}
