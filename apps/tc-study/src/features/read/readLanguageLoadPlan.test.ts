import { describe, expect, test } from 'bun:test'
import { emptyLanguageAvailability } from './languageAvailability'
import {
  availabilityLookupFromListed,
  mergeExpectedResourceKeys,
  resolveReadCatalogLoadPlan,
  shouldHydrateOriginalLanguages,
} from './readLanguageLoadPlan'
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

describe('resolveReadCatalogLoadPlan', () => {
  test('first text load (no current helps) loads both sides', () => {
    expect(
      resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: 'en',
        currentHelpsLanguage: null,
        persistedHelpsLanguage: 'en',
        navigationScope: 'scripture',
        availabilityFor,
      })
    ).toEqual({ helpsLanguageCode: 'en', loadTarget: 'both' })
  })

  test('refresh with persisted helps still dual-loads when helps pane is empty', () => {
    expect(
      resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: 'bho',
        currentHelpsLanguage: null,
        persistedHelpsLanguage: 'en',
        navigationScope: 'obs',
        availabilityFor,
      })
    ).toEqual({ helpsLanguageCode: 'en', loadTarget: 'both' })
  })

  test('same-language pair still uses both (Studio-safe)', () => {
    expect(
      resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: 'es',
        currentHelpsLanguage: null,
        persistedHelpsLanguage: 'es',
        navigationScope: 'scripture',
        availabilityFor,
      })
    ).toEqual({ helpsLanguageCode: 'es', loadTarget: 'both' })
  })

  test('text switch keeps helps language and loads text only', () => {
    expect(
      resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: 'bho',
        currentHelpsLanguage: 'en',
        persistedHelpsLanguage: 'en',
        navigationScope: 'scripture',
        availabilityFor,
      })
    ).toEqual({ helpsLanguageCode: 'en', loadTarget: 'text' })
  })

  test('after explicit OBS switch, persisted helps language is kept when it has OBS helps', () => {
    expect(
      resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: 'bho',
        currentHelpsLanguage: 'en',
        persistedHelpsLanguage: 'en',
        navigationScope: 'obs',
        availabilityFor,
      })
    ).toEqual({ helpsLanguageCode: 'en', loadTarget: 'text' })
  })

  test('after explicit Bible switch, helps fall back when persisted language lacks Bible helps', () => {
    expect(
      resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: 'es',
        currentHelpsLanguage: 'hi',
        persistedHelpsLanguage: 'hi',
        navigationScope: 'scripture',
        availabilityFor,
      })
    ).toEqual({ helpsLanguageCode: 'en', loadTarget: 'both' })
  })

  test('text switch reloads helps only when fallback changes the language', () => {
    expect(
      resolveReadCatalogLoadPlan({
        switchedPane: 'text',
        textLanguageCode: 'es',
        currentHelpsLanguage: 'hi',
        persistedHelpsLanguage: 'hi',
        navigationScope: 'scripture',
        availabilityFor,
      })
    ).toEqual({ helpsLanguageCode: 'en', loadTarget: 'both' })
  })

  test('helps switch is helps-only and does not change URL language', () => {
    expect(
      resolveReadCatalogLoadPlan({
        switchedPane: 'helps',
        textLanguageCode: 'bho',
        nextHelpsLanguageCode: 'es',
        currentHelpsLanguage: 'en',
        persistedHelpsLanguage: 'en',
        navigationScope: 'scripture',
        availabilityFor,
      })
    ).toEqual({ helpsLanguageCode: 'es', loadTarget: 'helps' })
  })
})

describe('mergeExpectedResourceKeys', () => {
  const existingText = ['u/bho/obs']
  const existingHelps = ['u/en/tn']
  const nextText = ['u/es/glt']
  const nextHelps = ['u/es/tn']

  test('text-only keeps prior helps keys', () => {
    expect(
      mergeExpectedResourceKeys({
        loadTarget: 'text',
        existingTextKeys: existingText,
        existingHelpsKeys: existingHelps,
        nextTextKeys: nextText,
        nextHelpsKeys: [],
      })
    ).toEqual({ textKeys: nextText, helpsKeys: existingHelps })
  })

  test('helps-only keeps prior text keys', () => {
    expect(
      mergeExpectedResourceKeys({
        loadTarget: 'helps',
        existingTextKeys: existingText,
        existingHelpsKeys: existingHelps,
        nextTextKeys: [],
        nextHelpsKeys: nextHelps,
      })
    ).toEqual({ textKeys: existingText, helpsKeys: nextHelps })
  })

  test('both replaces both sides', () => {
    expect(
      mergeExpectedResourceKeys({
        loadTarget: 'both',
        existingTextKeys: existingText,
        existingHelpsKeys: existingHelps,
        nextTextKeys: nextText,
        nextHelpsKeys: nextHelps,
      })
    ).toEqual({ textKeys: nextText, helpsKeys: nextHelps })
  })
})

describe('shouldHydrateOriginalLanguages', () => {
  test('UGNT/UHB stay on the text side', () => {
    expect(shouldHydrateOriginalLanguages('text')).toBe(true)
    expect(shouldHydrateOriginalLanguages('both')).toBe(true)
    expect(shouldHydrateOriginalLanguages('helps')).toBe(false)
  })
})

describe('availabilityLookupFromListed', () => {
  const langs: ListedLanguage[] = [
    {
      code: 'en',
      name: 'English',
      source: 'door43',
      availability: { ...AVAIL.en },
    },
    {
      code: 'bho',
      name: 'Bhojpuri',
      source: 'door43',
      availability: emptyLanguageAvailability(),
    },
  ]

  test('returns cached flags and undefined for unknown codes', () => {
    const lookup = availabilityLookupFromListed(langs)
    expect(lookup('en')?.bibleHelps).toBe(true)
    expect(lookup('bho')).toEqual(emptyLanguageAvailability())
    expect(lookup('fr')).toBeUndefined()
  })
})
