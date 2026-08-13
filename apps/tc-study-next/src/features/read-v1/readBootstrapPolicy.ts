/**
 * Pure policies for Read language bootstrap vs deep-link URL sync.
 * Kept free of React so unit tests can cover restore/deep-link decisions.
 */

/**
 * Bare `/read` (no `:lang` in the URL) must only navigate after a language pick.
 * Catalog load runs on the remounted `/read/:lang` instance via auto-load.
 * When the URL already has a language, load in place.
 */
export function shouldDeferLanguageCatalogLoad(urlLanguage: string | null | undefined): boolean {
  return !urlLanguage
}

/**
 * Whether the Read URL write-back effect should replace the pathname with the
 * canonical `/read/{lang}/…` template.
 *
 * - `requireLanguageInUrl`: bare `/read` — wait for language before writing
 * - `suppressUrlSync`: deep-link apply in progress — do not clobber the incoming URL
 */
export function shouldWriteBackReadUrl(options: {
  requireLanguageInUrl: boolean
  currentLanguageCode: string | null | undefined
  suppressUrlSync: boolean
}): boolean {
  if (options.requireLanguageInUrl) return false
  if (!options.currentLanguageCode) return false
  if (options.suppressUrlSync) return false
  return true
}

/**
 * Deep-link full tail (navRef present) should apply once resources for the URL
 * language are ready — not while bootstrap is still loading.
 */
export function shouldApplyDeepLinkTail(options: {
  hasReadRouteTail: boolean
  currentLanguageCode: string | null | undefined
  isLoadingResources: boolean
  alreadyApplied: boolean
}): boolean {
  if (!options.hasReadRouteTail) return false
  if (options.alreadyApplied) return false
  if (!options.currentLanguageCode || options.isLoadingResources) return false
  return true
}
