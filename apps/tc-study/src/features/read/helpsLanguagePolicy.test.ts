import { describe, expect, test } from 'bun:test'
import { emptyLanguageAvailability } from './languageAvailability'
import {
  filterLanguagesWithHelps,
  helpsFlagForNavigationScope,
  isHelpsCatalogKnownEmpty,
  resolveHelpsLanguageForMode,
  shouldReloadHelpsOnTextSwitch,
  shouldSkipHelpsCatalogLoad,
} from './helpsLanguagePolicy'
import type { ListedLanguage } from './languagesCache'

const AVAIL = {
  en: { bible: true, obs: true, bibleHelps: true, obsHelps: true },
  es: { bible: true, obs: false, bibleHelps: true, obsHelps: false },
  hi: { bible: false, obs: true, bibleHelps: false, obsHelps: true },
  bho: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
} as const

function availabilityFor(code: string) {
  return AVAIL[code as keyof typeof AVAIL]
}

describe('helpsFlagForNavigationScope', () => {
  test('scripture → bibleHelps, obs → obsHelps', () => {
    expect(helpsFlagForNavigationScope('scripture')).toBe('bibleHelps')
    expect(helpsFlagForNavigationScope('obs')).toBe('obsHelps')
  })
})

describe('isHelpsCatalogKnownEmpty', () => {
  test('Bible mode + OBS-only language with no TN/TWL is known empty', () => {
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'scripture',
        availability: AVAIL.bho,
      })
    ).toBe(true)
    expect(
      shouldSkipHelpsCatalogLoad({
        loadTarget: 'helps',
        navigationScope: 'scripture',
        availability: AVAIL.bho,
      })
    ).toBe(true)
  })

  test('English Bible helps stay in-flight until hydrate, not skipped', () => {
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'scripture',
        availability: AVAIL.en,
      })
    ).toBe(false)
    expect(
      shouldSkipHelpsCatalogLoad({
        loadTarget: 'helps',
        navigationScope: 'scripture',
        availability: AVAIL.en,
      })
    ).toBe(false)
  })

  test('unknown availability and scripture panels are not treated as empty', () => {
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'scripture',
        availability: undefined,
      })
    ).toBe(false)
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'scripture',
        navigationScope: 'scripture',
        availability: AVAIL.bho,
      })
    ).toBe(false)
    expect(
      shouldSkipHelpsCatalogLoad({
        loadTarget: 'both',
        navigationScope: 'scripture',
        availability: AVAIL.bho,
      })
    ).toBe(false)
  })

  test('OBS mode + no OBS helps is known empty; OBS helps languages are not', () => {
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'obs',
        availability: AVAIL.es,
      })
    ).toBe(true)
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'obs',
        availability: AVAIL.hi,
      })
    ).toBe(false)
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'obs',
        availability: AVAIL.bho,
      })
    ).toBe(false)
  })

  test('content-true language with unpopulated companion flags is not known empty', () => {
    const es419 = {
      bible: true,
      obs: true,
      bibleHelps: false,
      obsHelps: false,
    }
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'scripture',
        availability: es419,
      })
    ).toBe(false)
    expect(
      shouldSkipHelpsCatalogLoad({
        loadTarget: 'helps',
        navigationScope: 'scripture',
        availability: es419,
      })
    ).toBe(false)
    expect(
      isHelpsCatalogKnownEmpty({
        mode: 'helps',
        navigationScope: 'obs',
        availability: es419,
      })
    ).toBe(false)
  })
})

describe('resolveHelpsLanguageForMode', () => {
  test('Bible + gateway helps: minority text keeps persisted English', () => {
    expect(
      resolveHelpsLanguageForMode({
        persistedHelpsLanguage: 'en',
        textLanguageCode: 'bho',
        flag: 'bibleHelps',
        availabilityFor,
      })
    ).toBe('en')
  })

  test('OBS + gateway helps: OBS-only text keeps persisted English', () => {
    expect(
      resolveHelpsLanguageForMode({
        persistedHelpsLanguage: 'en',
        textLanguageCode: 'bho',
        flag: 'obsHelps',
        availabilityFor,
      })
    ).toBe('en')
  })

  test('same-language pair: persisted Spanish Bible helps stays Spanish', () => {
    expect(
      resolveHelpsLanguageForMode({
        persistedHelpsLanguage: 'es',
        textLanguageCode: 'es',
        flag: 'bibleHelps',
        availabilityFor,
      })
    ).toBe('es')
  })

  test('text switch never blanks: fall back to default when persisted lacks mode helps', () => {
    expect(
      resolveHelpsLanguageForMode({
        persistedHelpsLanguage: 'hi',
        textLanguageCode: 'es',
        flag: 'bibleHelps',
        availabilityFor,
      })
    ).toBe('en')
  })

  test('unknown availability keeps persisted (do not blank)', () => {
    expect(
      resolveHelpsLanguageForMode({
        persistedHelpsLanguage: 'fr',
        textLanguageCode: 'bho',
        flag: 'bibleHelps',
        availabilityFor,
      })
    ).toBe('fr')
  })

  test('first launch with no persisted uses default', () => {
    expect(
      resolveHelpsLanguageForMode({
        persistedHelpsLanguage: null,
        textLanguageCode: 'bho',
        flag: 'obsHelps',
        availabilityFor,
      })
    ).toBe('en')
  })
})

describe('shouldReloadHelpsOnTextSwitch', () => {
  test('keeps helps pane when the resolved helps language is unchanged', () => {
    expect(shouldReloadHelpsOnTextSwitch('en', 'en')).toBe(false)
  })

  test('reloads helps only when fallback changes the language', () => {
    expect(shouldReloadHelpsOnTextSwitch('hi', 'en')).toBe(true)
    expect(shouldReloadHelpsOnTextSwitch(null, 'en')).toBe(true)
  })
})

describe('filterLanguagesWithHelps', () => {
  const langs: ListedLanguage[] = [
    {
      code: 'bho',
      name: 'Bhojpuri',
      source: 'door43',
      availability: { ...AVAIL.bho },
    },
    {
      code: 'en',
      name: 'English',
      source: 'door43',
      availability: { ...AVAIL.en },
    },
    {
      code: 'es',
      name: 'Español',
      source: 'door43',
      availability: { ...AVAIL.es },
    },
    {
      code: 'hi',
      name: 'Hindi',
      source: 'door43',
      availability: { ...AVAIL.hi },
    },
    {
      code: 'sw',
      name: 'Swahili',
      source: 'door43',
      availability: emptyLanguageAvailability(),
    },
  ]

  test('Bible helps picker omits OBS-only and no-helps languages', () => {
    expect(filterLanguagesWithHelps(langs, 'bibleHelps').map((l) => l.code)).toEqual([
      'en',
      'es',
    ])
  })

  test('OBS helps picker omits Bible-only and no-helps languages', () => {
    expect(filterLanguagesWithHelps(langs, 'obsHelps').map((l) => l.code)).toEqual([
      'en',
      'hi',
    ])
  })
})
