import { beforeEach, describe, expect, test } from 'bun:test'
import {
  LANGUAGES_CACHE_KEY,
  LANGUAGES_CACHE_VERSION,
  loadLanguagesCache,
  saveLanguagesCache,
  type ListedLanguage,
} from './languagesCache'

const g = globalThis as typeof globalThis & { localStorage?: Storage }
if (!g.localStorage) {
  const mem = new Map<string, string>()
  g.localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    },
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size
    },
  }
}

const SUBJECTS = ['Bible', 'Open Bible Stories']

const SAMPLE: ListedLanguage[] = [
  {
    code: 'es',
    name: 'español',
    anglicizedName: 'Spanish',
    source: 'door43',
    direction: 'ltr',
    availability: {
      bible: true,
      obs: false,
      bibleHelps: true,
      obsHelps: false,
    },
  },
]

describe('languagesCache', () => {
  beforeEach(() => {
    g.localStorage?.removeItem(LANGUAGES_CACHE_KEY)
  })

  test('round-trips availability flags at cache version 7', () => {
    saveLanguagesCache(SAMPLE, SUBJECTS)
    expect(LANGUAGES_CACHE_VERSION).toBe(7)
    expect(loadLanguagesCache(SUBJECTS)).toEqual(SAMPLE)
  })

  test('invalidates version 2 cache that lacks availability', () => {
    g.localStorage?.setItem(
      LANGUAGES_CACHE_KEY,
      JSON.stringify({
        version: 2,
        timestamp: Date.now(),
        subjects: SUBJECTS,
        languages: [{ code: 'es', name: 'español', source: 'door43' }],
      })
    )
    expect(loadLanguagesCache(SUBJECTS)).toBeNull()
  })

  test('invalidates when supported subjects change', () => {
    saveLanguagesCache(SAMPLE, SUBJECTS)
    expect(loadLanguagesCache(['Bible'])).toBeNull()
  })

  test('invalidates when a newly registered content subject appears', () => {
    saveLanguagesCache(SAMPLE, SUBJECTS)
    expect(loadLanguagesCache([...SUBJECTS, 'Study Bible'])).toBeNull()
  })

  test('does not invent empty flags for a v5 entry missing availability', () => {
    saveLanguagesCache(SAMPLE, SUBJECTS)
    const raw = JSON.parse(g.localStorage!.getItem(LANGUAGES_CACHE_KEY)!)
    delete raw.languages[0].availability
    g.localStorage!.setItem(LANGUAGES_CACHE_KEY, JSON.stringify(raw))
    expect(loadLanguagesCache(SUBJECTS)?.[0].availability).toBeUndefined()
  })
})
