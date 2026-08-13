/**
 * LanguagePicker list filtering (text vs helps). Extracted so the picker
 * stays under the god-size budget.
 */

import type { ListedLanguage } from './languagesCache'
import {
  filterLanguagesWithHelps,
  type HelpsModeFlag,
} from './helpsLanguagePolicy'

export type LanguagePickerListMode = 'text' | 'helps'

/** Text-picker Any (`both`) / Bible / OBS. Ignored when `listMode` is `'helps'`. */
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
    listMode?: LanguagePickerListMode
    helpsFlag?: HelpsModeFlag
    textKind?: TextKindFilter
  }
): ListedLanguage[] {
  let list: ListedLanguage[]
  if (options.listMode === 'helps') {
    list = options.helpsFlag
      ? filterLanguagesWithHelps(languages, options.helpsFlag)
      : [...languages]
  } else {
    list = languages.filter((lang) =>
      matchesTextKind(lang, options.textKind ?? DEFAULT_TEXT_KIND_FILTER)
    )
  }

  const q = options.searchQuery.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (lang) =>
      lang.name.toLowerCase().includes(q) ||
      lang.code.toLowerCase().includes(q) ||
      (lang.anglicizedName?.toLowerCase().includes(q) ?? false)
  )
}
