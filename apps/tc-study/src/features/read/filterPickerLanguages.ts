/**
 * LanguagePicker list filtering. Text and helps pickers share the same
 * Scripture/OBS union + Bible/OBS filter (listMode is label-only).
 */

import type { ListedLanguage } from './languagesCache'

export type LanguagePickerListMode = 'text' | 'helps'

/** Any (`both`) / Bible / OBS. Same chrome for text and helps pickers. */
export type TextKindFilter = 'bible' | 'obs' | 'both'

export const DEFAULT_TEXT_KIND_FILTER: TextKindFilter = 'both'

function matchesTextKind(lang: ListedLanguage, textKind: TextKindFilter): boolean {
  const a = lang.availability
  if (textKind === 'bible') return a?.bible === true
  if (textKind === 'obs') return a?.obs === true
  // Any: missing flags fail open. Known empty (helps-only) stays hidden (#25).
  if (!a) return true
  return a.bible || a.obs
}

export function filterPickerLanguages(
  languages: readonly ListedLanguage[],
  options: {
    searchQuery: string
    textKind?: TextKindFilter
  }
): ListedLanguage[] {
  const list = languages.filter((lang) =>
    matchesTextKind(lang, options.textKind ?? DEFAULT_TEXT_KIND_FILTER)
  )

  const q = options.searchQuery.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (lang) =>
      lang.name.toLowerCase().includes(q) ||
      lang.code.toLowerCase().includes(q) ||
      (lang.anglicizedName?.toLowerCase().includes(q) ?? false)
  )
}
