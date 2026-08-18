/**
 * Build the picker display list + global cache payload for one open.
 *
 * Display is fetch-scoped (panel subjects only). The persisted cache stays
 * the global content-union universe so mismatch / helps policy still see
 * Bible vs OBS flags. Availability-only extras are applied to the cache,
 * not to a scoped panel list (so OBS-only langs stay off a scripture picker).
 * Switching to an OBS-only lang from scripture still uses the existing
 * switch-to-OBS empty — the scripture picker simply does not offer that lang.
 */

import type { LanguageListKind } from '@bt-synergy/resource-types'
import { fetchLanguagesForSubjects, type LanguageListClient } from './fetchLanguagesForSubjects'
import type { LanguageAvailabilityFlags } from './languageAvailability'
import { languageListDoor43Filter } from './languageListKind'
import { loadLanguagesCache, type ListedLanguage } from './languagesCache'
import {
  mergePickerLanguages,
  type PickerDoor43Language,
} from './mergePickerLanguages'

export function catalogCodesForLanguageList(options: {
  catalogCodes: readonly string[]
  door43Codes: ReadonlySet<string>
  availabilityByCode: ReadonlyMap<string, LanguageAvailabilityFlags>
  kind: LanguageListKind
}): string[] {
  const { catalogCodes, door43Codes, availabilityByCode, kind } = options
  if (kind === 'global') return [...catalogCodes]
  return catalogCodes.filter((raw) => {
    const code = String(raw ?? '').trim()
    if (!code) return false
    if (door43Codes.has(code)) return true
    const flags = availabilityByCode.get(code)
    if (!flags) return false
    if (kind === 'scripture') return flags.bible
    if (kind === 'obs') return flags.obs
    if (kind === 'helps') return flags.bibleHelps
    return flags.obsHelps
  })
}

export function filterCachedLanguagesForKind(
  languages: readonly ListedLanguage[],
  kind: LanguageListKind
): ListedLanguage[] {
  if (kind === 'global') return [...languages]
  return languages.filter((lang) => {
    const flags = lang.availability
    if (!flags) return false
    if (kind === 'scripture') return flags.bible
    if (kind === 'obs') return flags.obs
    if (kind === 'helps') return flags.bibleHelps
    return flags.obsHelps
  })
}

function asDoor43Lang(lang: ListedLanguage): PickerDoor43Language {
  return {
    code: lang.code,
    name: lang.name,
    anglicized_name: lang.anglicizedName,
    direction: lang.direction,
  }
}

export async function revalidatePickerLanguages(options: {
  client: LanguageListClient
  kind: LanguageListKind
  listSubjects: readonly string[]
  globalSubjects: readonly string[]
  catalogCodes: readonly string[]
  availabilityByCode: ReadonlyMap<string, LanguageAvailabilityFlags>
}): Promise<{ display: ListedLanguage[]; global: ListedLanguage[] }> {
  const {
    client,
    kind,
    listSubjects,
    globalSubjects,
    catalogCodes,
    availabilityByCode,
  } = options

  const door43Langs = await fetchLanguagesForSubjects(
    client,
    listSubjects,
    languageListDoor43Filter(kind)
  )
  const door43Codes = new Set(
    door43Langs.map((lang) => String(lang.code ?? '').trim()).filter(Boolean)
  )
  const display = mergePickerLanguages({
    catalogCodes: catalogCodesForLanguageList({
      catalogCodes,
      door43Codes,
      availabilityByCode,
      kind,
    }),
    door43Langs,
    availabilityByCode,
    includeAvailabilityOnlyCodes: kind === 'global',
  })

  if (kind === 'global') {
    return { display, global: display }
  }

  const previous = loadLanguagesCache([...globalSubjects]) ?? []
  const global = mergePickerLanguages({
    catalogCodes,
    door43Langs: [...door43Langs, ...previous.map(asDoor43Lang)],
    availabilityByCode,
    includeAvailabilityOnlyCodes: true,
  })
  return { display, global }
}
