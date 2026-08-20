/**
 * Door43 / picker language labels.
 * Catalog `ln` (`name`) is the autonym; `ang` (anglicized_name) is English copy.
 */

import { canonicalReadLanguageCode } from '../../utils/languageCodeMatch'

export interface LanguageListNameFields {
  code?: string
  name?: string
  anglicizedName?: string
}

/** Sentence case for English copy (`español` → `Español`; `Spanish` stays `Spanish`). */
export function sentenceCaseLanguageName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function pickLanguageLabel(
  listed: LanguageListNameFields | null | undefined,
  fallbackCode: string,
  preferAnglicized: boolean
): string {
  const native = listed?.name?.trim() || ''
  const anglicized = listed?.anglicizedName?.trim() || ''
  const raw = preferAnglicized
    ? anglicized || native || fallbackCode.trim()
    : native || anglicized || fallbackCode.trim()
  return sentenceCaseLanguageName(raw)
}

/** Append `(parenthetical)` only when it differs from `primary` (case-insensitive). */
function withParentheticalIfDifferent(primary: string, parenthetical: string): string {
  const extra = parenthetical.trim()
  if (!extra || extra.toLowerCase() === primary.toLowerCase()) return primary
  return `${primary} (${extra})`
}

/** Picker/list card title: native `name` (autonym), then anglicizedName, then code. */
export function languageListDisplayName(
  listed?: LanguageListNameFields | null,
  fallbackCode = ''
): string {
  return pickLanguageLabel(listed, fallbackCode, false)
}

/** English UI copy: anglicizedName, then native `name`, then code. */
export function languageAnglicizedDisplayName(
  listed?: LanguageListNameFields | null,
  fallbackCode = ''
): string {
  return pickLanguageLabel(listed, fallbackCode, true)
}

/**
 * English sentence subject: anglicizedName, with sentence-cased native `name`
 * in parentheses only when both exist and they differ (case-insensitive).
 * Picker cards stay native-primary via `languageListDisplayName`.
 */
export function languageEnglishCopyDisplayName(
  listed?: LanguageListNameFields | null,
  fallbackCode = ''
): string {
  const subject = languageAnglicizedDisplayName(listed, fallbackCode)
  const nativeRaw = listed?.name?.trim() || ''
  const anglicizedRaw = listed?.anglicizedName?.trim() || ''
  if (!nativeRaw || !anglicizedRaw) return subject
  return withParentheticalIfDifferent(subject, languageListDisplayName(listed, ''))
}

/**
 * Exact BCP-47 match against picker/list metadata. Never collapses `es-419` → `es`.
 * English aliases `en` / `eng` resolve to the Door43 `en` row.
 */
export function listedLanguageByCode<T extends LanguageListNameFields>(
  languages: readonly T[] | undefined | null,
  code: string
): T | undefined {
  const want = code.trim().toLowerCase()
  if (!want || !languages) return undefined
  const exact = languages.find((lang) => (lang.code || '').trim().toLowerCase() === want)
  if (exact) return exact
  const canonical = canonicalReadLanguageCode(want)
  if (canonical === want) return undefined
  return languages.find((lang) => canonicalReadLanguageCode(lang.code || '') === canonical)
}

/** Card `title` / `aria-label`: native primary, anglicized in parentheses when it differs. */
export function languagePickerA11yLabel(
  listed?: LanguageListNameFields | null,
  fallbackCode = ''
): string {
  const native = languageListDisplayName(listed, fallbackCode)
  const anglicized = languageAnglicizedDisplayName(listed, '')
  return withParentheticalIfDifferent(native, anglicized)
}

/** Map a Door43 API language into list `name` (autonym) + `anglicizedName`. */
export function door43ToListNameFields(lang: {
  code: string
  name?: string
  anglicized_name?: string
}): { name: string; anglicizedName?: string } {
  const anglicizedName = lang.anglicized_name?.trim() || undefined
  const name = lang.name?.trim() || lang.code
  return { name, anglicizedName }
}
