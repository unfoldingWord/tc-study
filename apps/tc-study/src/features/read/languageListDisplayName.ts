/**
 * Door43 / picker language labels.
 * Catalog `ln` (`name`) is the autonym; `ang` (anglicized_name) is English copy.
 */

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

/** Card `title` / `aria-label`: native primary, anglicized in parentheses when it differs. */
export function languagePickerA11yLabel(
  listed?: LanguageListNameFields | null,
  fallbackCode = ''
): string {
  const native = languageListDisplayName(listed, fallbackCode)
  const anglicized = languageAnglicizedDisplayName(listed, '')
  if (anglicized && anglicized !== native) return `${native} (${anglicized})`
  return native
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
