/**
 * Helps-pane language vs text-pane language (issue #24).
 *
 * Persistence stays in {@link resolveAndPersistHelpsLanguage}; this module
 * decides what to *load* for the current Bible/OBS mode without resetting
 * the stored choice on text-language changes.
 */

import type { LanguageAvailabilityFlags } from './languageAvailability'
import { resolveHelpsLanguage } from './defaultHelpsLanguage'
import { listedLanguageByCode } from './languageListDisplayName'
import { loadLanguagesCache, type ListedLanguage } from './languagesCache'
import type { CatalogLoadTarget } from './readCatalogPanelPolicy'

export type HelpsModeFlag = 'bibleHelps' | 'obsHelps'

export function helpsFlagForNavigationScope(scope: string): HelpsModeFlag {
  return scope === 'obs' ? 'obsHelps' : 'bibleHelps'
}

export function languageHasHelpsFlag(
  availability: LanguageAvailabilityFlags | undefined,
  flag: HelpsModeFlag
): boolean {
  return availability?.[flag] === true
}

/**
 * Known-empty helps catalog for this Bible/OBS mode — not unknown, not in-flight.
 * Missing availability stays pending so the first hydrate can still run.
 *
 * Companion flags default to `false` when a language is indexed from primary
 * subjects (Bible/OBS picker). A content-true language may still have TN/TWL
 * under the same BCP-47 tag (`es-419`); do not skip hydrate in that case.
 */
export function isHelpsCatalogKnownEmpty(options: {
  mode?: string
  navigationScope: string
  availability: LanguageAvailabilityFlags | undefined | null
}): boolean {
  if (options.mode != null && options.mode !== 'helps') return false
  if (!options.availability) return false
  const flag = helpsFlagForNavigationScope(options.navigationScope)
  if (options.availability[flag] !== false) return false
  const primary = options.navigationScope === 'obs' ? 'obs' : 'bible'
  if (options.availability[primary] === true) return false
  return true
}

/** Helps-only catalog job when the language has no TN/TWL for this mode. */
export function shouldSkipHelpsCatalogLoad(options: {
  loadTarget: CatalogLoadTarget
  navigationScope: string
  availability: LanguageAvailabilityFlags | undefined | null
}): boolean {
  if (options.loadTarget !== 'helps') return false
  return isHelpsCatalogKnownEmpty({
    mode: 'helps',
    navigationScope: options.navigationScope,
    availability: options.availability,
  })
}

export function helpsCatalogKnownEmptyFromCache(options: {
  mode: string
  languageCode: string | null | undefined
  navigationScope: string
  supportedSubjects: string[]
}): boolean {
  if (options.mode !== 'helps') return false
  const code = options.languageCode?.trim()
  if (!code) return false
  const listed = loadLanguagesCache(options.supportedSubjects)
  const lang = listedLanguageByCode(listed, code)
  return isHelpsCatalogKnownEmpty({
    mode: 'helps',
    navigationScope: options.navigationScope,
    availability: lang?.availability,
  })
}

/**
 * Helps language to display for the current mode.
 * Persisted value wins when it has helps for the mode, or when availability is
 * unknown (do not blank the pane). Otherwise fall back to the default.
 * Does not write storage — text-language changes must not reset the choice.
 */
export function resolveHelpsLanguageForMode(options: {
  persistedHelpsLanguage: string | null
  textLanguageCode: string
  flag: HelpsModeFlag
  availabilityFor: (code: string) => LanguageAvailabilityFlags | undefined
}): string {
  const fallback = resolveHelpsLanguage(options.textLanguageCode)
  const persisted = options.persistedHelpsLanguage?.trim() || null
  if (persisted) {
    const flags = options.availabilityFor(persisted)
    if (!flags || languageHasHelpsFlag(flags, options.flag)) return persisted
  }
  return fallback
}

export function shouldReloadHelpsOnTextSwitch(
  currentHelpsLanguage: string | null,
  nextHelpsLanguage: string
): boolean {
  if (!currentHelpsLanguage) return true
  return currentHelpsLanguage !== nextHelpsLanguage
}

export function filterLanguagesWithHelps(
  languages: readonly ListedLanguage[],
  flag: HelpsModeFlag
): ListedLanguage[] {
  return languages.filter((lang) => languageHasHelpsFlag(lang.availability, flag))
}
