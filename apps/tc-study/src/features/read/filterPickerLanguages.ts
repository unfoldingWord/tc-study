/**
 * LanguagePicker list filtering. Fetch is scoped by listMode (text vs helps),
 * not app nav. Chrome still shares Any / Bible / OBS. Helps chips use
 * companion flags (bibleHelps / obsHelps); text chips use primary content
 * flags (bible / obs). Helps Any is companion union, not the raw fetch.
 */

import type { ListedLanguage } from './languagesCache'

export type LanguagePickerListMode = 'text' | 'helps'

/** Any (`both`) / Bible / OBS. Same chrome for text and helps pickers. */
export type TextKindFilter = 'bible' | 'obs' | 'both'

export const DEFAULT_TEXT_KIND_FILTER: TextKindFilter = 'both'

/** Bible vs OBS chip from app nav. listMode only changes which flags the chips filter. */
export function defaultTextKindForPicker(
  _listMode: LanguagePickerListMode,
  navigationScope?: string | null
): TextKindFilter {
  return navigationScope === 'obs' ? 'obs' : 'bible'
}

function matchesTextKind(
  lang: ListedLanguage,
  textKind: TextKindFilter,
  listMode: LanguagePickerListMode
): boolean {
  const a = lang.availability
  if (listMode === 'helps') {
    if (textKind === 'bible') return a?.bibleHelps === true
    if (textKind === 'obs') return a?.obsHelps === true
    // Any: companion union. Missing flags fail open. Known empty stays hidden.
    if (!a) return true
    return a.bibleHelps || a.obsHelps
  }
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
