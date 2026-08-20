/**
 * Build the picker display list + global cache payload for one open.
 *
 * Display is fetch-scoped by panel type (`global` primary content vs
 * `all-helps` companions). Global keeps langs with bible/obs flags (or
 * unknown); helps-only extras stay out. The persisted cache stays the
 * content-union universe so mismatch / helps policy still see Bible vs
 * OBS flags. Availability-only extras apply to that cache, not a scoped
 * helps list.
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

function languageMatchesListKind(
  flags: LanguageAvailabilityFlags | undefined,
  kind: LanguageListKind
): boolean {
  if (kind === 'global') {
    if (!flags) return true
    return flags.bible || flags.obs
  }
  if (!flags) return false
  if (kind === 'scripture') return flags.bible
  if (kind === 'obs') return flags.obs
  if (kind === 'helps') return flags.bibleHelps
  if (kind === 'all-helps') return flags.bibleHelps || flags.obsHelps
  return flags.obsHelps
}

export function catalogCodesForLanguageList(options: {
  catalogCodes: readonly string[]
  door43Codes: ReadonlySet<string>
  availabilityByCode: ReadonlyMap<string, LanguageAvailabilityFlags>
  kind: LanguageListKind
}): string[] {
  const { catalogCodes, door43Codes, availabilityByCode, kind } = options
  return catalogCodes.filter((raw) => {
    const code = String(raw ?? '').trim()
    if (!code) return false
    if (door43Codes.has(code)) return true
    return languageMatchesListKind(availabilityByCode.get(code), kind)
  })
}

export function filterCachedLanguagesForKind(
  languages: readonly ListedLanguage[],
  kind: LanguageListKind
): ListedLanguage[] {
  return languages.filter((lang) => languageMatchesListKind(lang.availability, kind))
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
  const merged = mergePickerLanguages({
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
  // Door43 primary-subject hits stay even without flags. Catalog /
  // availability-only extras must have bible or obs — not helps-only.
  const display =
    kind === 'global'
      ? merged.filter(
          (lang) =>
            door43Codes.has(lang.code) ||
            languageMatchesListKind(lang.availability, kind)
        )
      : merged

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
