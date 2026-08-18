/**
 * LanguagePicker list filtering. Fetch is scoped by listMode (text vs helps),
 * not app nav. Chrome still shares Any / Bible / OBS. On a helps-scoped list,
 * Any shows the full fetched set (helps-only langs would otherwise vanish).
 */

import type { ListedLanguage } from './languagesCache'

export type LanguagePickerListMode = 'text' | 'helps'

/** Any (`both`) / Bible / OBS. Same chrome for text and helps pickers. */
export type TextKindFilter = 'bible' | 'obs' | 'both'

export const DEFAULT_TEXT_KIND_FILTER: TextKindFilter = 'both'

function matchesTextKind(
  lang: ListedLanguage,
  textKind: TextKindFilter,
  listMode: LanguagePickerListMode
): boolean {
  const a = lang.availability
  if (textKind === 'bible') return a?.bible === true
  if (textKind === 'obs') return a?.obs === true
  // Helps fetch is already scoped — do not hide helps-only langs.
  if (listMode === 'helps') return true
  // Any: missing flags fail open. Known empty (helps-only) stays hidden (#25).
  if (!a) return true
  return a.bible || a.obs
}

export function filterPickerLanguages(
  languages: readonly ListedLanguage[],
  options: {
    searchQuery: string
    textKind?: TextKindFilter
    listMode?: LanguagePickerListMode
  }
): ListedLanguage[] {
  const list = languages.filter((lang) =>
    matchesTextKind(
      lang,
      options.textKind ?? DEFAULT_TEXT_KIND_FILTER,
      options.listMode ?? 'text'
    )
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
