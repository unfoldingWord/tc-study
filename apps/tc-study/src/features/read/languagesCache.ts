/**
 * Language-list cache for Read / LanguagePicker.
 * v6: OBS-helps flags union prod subject lists (not the 3 tc-ready TSV GLs).
 * Bump version to invalidate.
 */

import { type LanguageAvailabilityFlags } from './languageAvailability'

export const LANGUAGES_CACHE_KEY = 'tc-study:languages-cache'
export const LANGUAGES_CACHE_VERSION = 6

export interface ListedLanguage {
  code: string
  name: string
  /** Door43 `ang` — English/display name for empty-state copy (picker cards show `name`). */
  anglicizedName?: string
  source: 'catalog' | 'door43'
  direction?: 'ltr' | 'rtl'
  /** Present when Door43 subject lookups returned flags; omit = unknown (Any fail-open). */
  availability?: LanguageAvailabilityFlags
}

interface CachedLanguages {
  version: number
  timestamp: number
  subjects: string[]
  languages: ListedLanguage[]
}

function subjectsMatch(cached: string[], current: string[]): boolean {
  if (cached.length !== current.length) return false
  const cachedSet = new Set(cached)
  return current.every((subject) => cachedSet.has(subject))
}

function normalizeListedLanguage(lang: ListedLanguage): ListedLanguage {
  const anglicizedName = lang.anglicizedName?.trim() || undefined
  return {
    ...lang,
    anglicizedName,
    availability: lang.availability,
  }
}

export function loadLanguagesCache(supportedSubjects: string[]): ListedLanguage[] | null {
  try {
    const cached = localStorage.getItem(LANGUAGES_CACHE_KEY)
    if (!cached) return null

    const parsed = JSON.parse(cached) as CachedLanguages
    if (parsed.version !== LANGUAGES_CACHE_VERSION) return null
    if (!Array.isArray(parsed.languages) || !Array.isArray(parsed.subjects)) return null
    if (!subjectsMatch(parsed.subjects, supportedSubjects)) return null

    return parsed.languages.map(normalizeListedLanguage)
  } catch (error) {
    console.warn('⚠️ Failed to load languages from cache:', error)
    return null
  }
}

export function saveLanguagesCache(
  languages: ListedLanguage[],
  supportedSubjects: string[]
): void {
  try {
    const cacheData: CachedLanguages = {
      version: LANGUAGES_CACHE_VERSION,
      timestamp: Date.now(),
      subjects: supportedSubjects,
      languages,
    }
    localStorage.setItem(LANGUAGES_CACHE_KEY, JSON.stringify(cacheData))
  } catch (error) {
    console.warn('⚠️ Failed to save languages to cache:', error)
  }
}

export function withAvailability(
  lang: Omit<ListedLanguage, 'availability'> & { availability?: LanguageAvailabilityFlags },
  availability: LanguageAvailabilityFlags
): ListedLanguage {
  return { ...lang, availability }
}
