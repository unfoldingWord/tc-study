/**
 * Helps-pane language vs text-pane language (issue #24).
 *
 * Persistence stays in {@link resolveAndPersistHelpsLanguage}; this module
 * decides what to *load* for the current Bible/OBS mode without resetting
 * the stored choice on text-language changes.
 */

import type { LanguageAvailabilityFlags } from './languageAvailability'
import { resolveHelpsLanguage } from './defaultHelpsLanguage'
import type { ListedLanguage } from './languagesCache'

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
