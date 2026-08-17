/**
 * Which pane a LanguagePicker card belongs to.
 * Exact BCP-47 (+ en/eng); never collapses es-419 → es.
 */

import { canonicalReadLanguageCode } from '../../utils/languageCodeMatch'

export type LanguagePickerCardRole = 'current' | 'other'

export function pickerLanguageCodesEqual(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = left?.trim().toLowerCase() ?? ''
  const b = right?.trim().toLowerCase() ?? ''
  if (!a || !b) return false
  if (a === b) return true
  return (
    canonicalReadLanguageCode(a).toLowerCase() ===
    canonicalReadLanguageCode(b).toLowerCase()
  )
}

/** This pane wins when both panes share a language — one strong card only. */
export function languagePickerCardRole(
  langCode: string,
  currentLanguageCode?: string | null,
  otherLanguageCode?: string | null
): LanguagePickerCardRole | undefined {
  if (pickerLanguageCodesEqual(langCode, currentLanguageCode)) return 'current'
  if (pickerLanguageCodesEqual(currentLanguageCode, otherLanguageCode)) return undefined
  if (pickerLanguageCodesEqual(langCode, otherLanguageCode)) return 'other'
  return undefined
}
