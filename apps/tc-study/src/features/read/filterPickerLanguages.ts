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

export function filterPickerLanguages(
  languages: readonly ListedLanguage[],
  options: {
    searchQuery: string
    listMode?: LanguagePickerListMode
    helpsFlag?: HelpsModeFlag
  }
): ListedLanguage[] {
  let list =
    options.listMode === 'helps' && options.helpsFlag
      ? filterLanguagesWithHelps(languages, options.helpsFlag)
      : [...languages]

  const q = options.searchQuery.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (lang) =>
      lang.name.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q)
  )
}
