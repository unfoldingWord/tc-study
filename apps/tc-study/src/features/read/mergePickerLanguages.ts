/**
 * Merge local catalog codes + Door43 list + subject-availability flags.
 * Availability never shrinks the language universe: codes only in the
 * availability map are added; codes missing from it keep unknown flags.
 */

import { door43ToListNameFields } from './languageListDisplayName'
import {
  ORIGINAL_LANGUAGE_CODES,
  availabilityIfPresent,
  type LanguageAvailabilityFlags,
} from './languageAvailability'
import { withAvailability, type ListedLanguage } from './languagesCache'

export interface PickerDoor43Language {
  code: string
  name?: string
  anglicized_name?: string
  direction?: 'ltr' | 'rtl'
}

function isOriginalLanguageCode(code: string): boolean {
  return ORIGINAL_LANGUAGE_CODES.has(code)
}

function listedFromDoor43(
  lang: PickerDoor43Language,
  source: ListedLanguage['source'],
  availability: LanguageAvailabilityFlags | undefined
): ListedLanguage {
  const listed: Omit<ListedLanguage, 'availability'> & {
    availability?: LanguageAvailabilityFlags
  } = {
    code: lang.code,
    ...door43ToListNameFields(lang),
    source,
    direction: lang.direction,
  }
  return availability ? withAvailability(listed, availability) : listed
}

/**
 * Catalog first (cached), then Door43 names, then availability-only codes.
 * Original-language UGNT/UHB codes are omitted (not gateway Bibles).
 */
export function mergePickerLanguages(options: {
  catalogCodes: readonly string[]
  door43Langs: readonly PickerDoor43Language[]
  availabilityByCode: ReadonlyMap<string, LanguageAvailabilityFlags>
  /**
   * When false, do not add availability-only codes (scoped panel lists).
   * Global / cache merges keep the default so OBS langs still fill the universe.
   */
  includeAvailabilityOnlyCodes?: boolean
}): ListedLanguage[] {
  const {
    catalogCodes,
    door43Langs,
    availabilityByCode,
    includeAvailabilityOnlyCodes = true,
  } = options
  const door43ByCode = new Map<string, PickerDoor43Language>()
  for (const lang of door43Langs) {
    const code = String(lang.code ?? '').trim()
    if (!code || isOriginalLanguageCode(code)) continue
    door43ByCode.set(code, lang)
  }

  const languageMap = new Map<string, ListedLanguage>()

  for (const raw of catalogCodes) {
    const code = String(raw ?? '').trim()
    if (!code || isOriginalLanguageCode(code)) continue
    const door43 = door43ByCode.get(code)
    languageMap.set(
      code,
      listedFromDoor43(
        door43 ?? { code, name: code.toUpperCase() },
        'catalog',
        availabilityIfPresent(availabilityByCode, code)
      )
    )
  }

  for (const [code, lang] of door43ByCode) {
    if (languageMap.has(code)) continue
    languageMap.set(
      code,
      listedFromDoor43(lang, 'door43', availabilityIfPresent(availabilityByCode, code))
    )
  }

  if (includeAvailabilityOnlyCodes) {
    for (const [code, flags] of availabilityByCode) {
      if (!code || isOriginalLanguageCode(code) || languageMap.has(code)) continue
      const door43 = door43ByCode.get(code)
      languageMap.set(
        code,
        listedFromDoor43(door43 ?? { code, name: code.toUpperCase() }, 'door43', flags)
      )
    }
  }

  return Array.from(languageMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}
