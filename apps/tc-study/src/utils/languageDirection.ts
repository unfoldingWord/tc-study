/**
 * Language direction (RTL/LTR) resolution with fallbacks.
 * Ensures RTL works for Arabic and other RTL languages even when catalog or
 * list-languages haven't loaded yet or don't return direction.
 */

const KNOWN_RTL_CODES = new Set([
  'ar', // Arabic
  'he', // Hebrew
  'fa', // Persian
  'ur', // Urdu
  'yi', // Yiddish
  'ku', // Kurdish
])

/**
 * Resolve text direction from catalog metadata, language list, or known RTL codes.
 * Use when catalog/list may not have loaded yet (e.g. first paint on /read/ar).
 */
export function getLanguageDirection(
  catalogDirection?: 'ltr' | 'rtl' | null,
  listDirection?: 'ltr' | 'rtl' | null,
  languageCode?: string
): 'ltr' | 'rtl' {
  if (catalogDirection === 'rtl' || catalogDirection === 'ltr') return catalogDirection
  if (listDirection === 'rtl' || listDirection === 'ltr') return listDirection
  if (languageCode && KNOWN_RTL_CODES.has(languageCode.toLowerCase())) return 'rtl'
  return 'ltr'
}

/**
 * Whether a language code is known to be RTL (used when only code is available).
 */
export function isRtlLanguageCode(languageCode: string | undefined): boolean {
  return !!languageCode && KNOWN_RTL_CODES.has(languageCode.toLowerCase())
}
