/**
 * Picker languages from this device's catalog, for when Door43 cannot be reached: what a language pack opened can be
 * picked with no internet. Flags come from the rows' subjects, the same way Door43 hits give them.
 */

import type { LanguageListKind } from '@bt-synergy/resource-types'
import { indexAvailabilityByLanguage, type LanguageAvailabilitySubjectSets } from './languageAvailability'
import type { ListedLanguage } from './languagesCache'
import { mergePickerLanguages, type PickerDoor43Language } from './mergePickerLanguages'
import { catalogCodesForLanguageList } from './revalidatePickerLanguages'

export interface LocalCatalogLanguageRow {
  language?: string
  subject?: string
  languageTitle?: string
  languageName?: string
  languageDirection?: 'ltr' | 'rtl'
}

export async function catalogLanguageRows(catalog: {
  getAllResourceKeys(): Promise<string[]>
  getResourceMetadata(key: string): Promise<unknown>
}): Promise<LocalCatalogLanguageRow[]> {
  const keys = await catalog.getAllResourceKeys()
  const rows = await Promise.all(keys.map((key) => catalog.getResourceMetadata(key)))
  return rows.filter((row): row is LocalCatalogLanguageRow => Boolean(row) && typeof row === 'object')
}

export function localPickerLanguages(options: {
  rows: readonly LocalCatalogLanguageRow[]
  sets: LanguageAvailabilitySubjectSets
  kind: LanguageListKind
}): ListedLanguage[] {
  const { rows, sets, kind } = options
  const availabilityByCode = indexAvailabilityByLanguage(
    rows.map((row) => ({ languageCode: String(row.language ?? ''), subject: String(row.subject ?? '') })),
    sets
  )
  const codes = catalogCodesForLanguageList({
    catalogCodes: [...availabilityByCode.keys()],
    door43Codes: new Set(),
    availabilityByCode,
    kind,
  })
  const kept = new Set(codes)
  const named = new Map<string, PickerDoor43Language>()
  for (const row of rows) {
    const code = String(row.language ?? '').trim()
    const name = row.languageTitle?.trim() || row.languageName?.trim()
    if (!kept.has(code) || named.has(code) || !name) continue
    named.set(code, { code, name, direction: row.languageDirection })
  }
  return mergePickerLanguages({
    catalogCodes: codes,
    door43Langs: [...named.values()],
    availabilityByCode,
    includeAvailabilityOnlyCodes: false,
  })
}

/** Door43's list plus every language the device holds that it lacks (all of them when Door43 lists nothing). */
export function appendDeviceLanguages(shown: readonly ListedLanguage[], onDevice: readonly ListedLanguage[]): ListedLanguage[] {
  const listed = new Set(shown.map((lang) => lang.code))
  return [...shown, ...onDevice.filter((lang) => !listed.has(lang.code))]
}
