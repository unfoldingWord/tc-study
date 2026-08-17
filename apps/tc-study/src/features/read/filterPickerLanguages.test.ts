import { describe, expect, test } from 'bun:test'
import { emptyLanguageAvailability } from './languageAvailability'
import { filterPickerLanguages } from './filterPickerLanguages'
import type { ListedLanguage } from './languagesCache'

const LANGS: ListedLanguage[] = [
  {
    code: 'en',
    name: 'English',
    source: 'door43',
    availability: { bible: true, obs: true, bibleHelps: true, obsHelps: true },
  },
  {
    code: 'es',
    name: 'español',
    anglicizedName: 'Spanish',
    source: 'catalog',
    availability: { bible: true, obs: false, bibleHelps: true, obsHelps: false },
  },
  {
    code: 'bho',
    name: 'Bhojpuri',
    source: 'door43',
    availability: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
  },
  {
    code: 'hi',
    name: 'Hindi',
    source: 'door43',
    availability: { bible: false, obs: true, bibleHelps: false, obsHelps: true },
  },
  {
    code: 'sw',
    name: 'Swahili',
    source: 'door43',
    availability: emptyLanguageAvailability(),
  },
]

describe('filterPickerLanguages', () => {
  test('default Any (both) lists OBS-only and Bible-only (issue #25)', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: '',
    }).map((l) => l.code)
    expect(codes).toEqual(['en', 'es', 'bho', 'hi'])
    expect(codes).toContain('bho')
    expect(codes).not.toContain('sw')
  })

  test('omitted listMode + omitted textKind defaults to both (bible OR obs)', () => {
    const codes = filterPickerLanguages(LANGS, { searchQuery: '' }).map((l) => l.code)
    expect(codes).toEqual(['en', 'es', 'bho', 'hi'])
  })

  test('textKind bible keeps languages with availability.bible', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      textKind: 'bible',
    }).map((l) => l.code)
    expect(codes).toEqual(['en', 'es'])
  })

  test('textKind obs keeps languages with availability.obs, including OBS-only', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      textKind: 'obs',
    }).map((l) => l.code)
    expect(codes).toEqual(['en', 'bho', 'hi'])
  })

  test('textKind both (Any) is bible OR obs (not both-required)', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      textKind: 'both',
    }).map((l) => l.code)
    expect(codes).toEqual(['en', 'es', 'bho', 'hi'])
  })

  test('text and helps pickers share the Scripture/OBS union; filter hides Bible-only or OBS-only', () => {
    const textCodes = filterPickerLanguages(LANGS, { searchQuery: '' }).map((l) => l.code)
    const helpsCodes = filterPickerLanguages(LANGS, { searchQuery: '' }).map((l) => l.code)
    expect(textCodes).toEqual(['en', 'es', 'bho', 'hi'])
    expect(helpsCodes).toEqual(textCodes)
    expect(textCodes).toContain('bho')
    expect(textCodes).not.toContain('sw')

    const bibleCodes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      textKind: 'bible',
    }).map((l) => l.code)
    const obsCodes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      textKind: 'obs',
    }).map((l) => l.code)
    expect(bibleCodes).toEqual(['en', 'es'])
    expect(bibleCodes).not.toContain('bho')
    expect(obsCodes).toEqual(['en', 'bho', 'hi'])
    expect(obsCodes).not.toContain('es')
  })

  test('union includes OBS-only languages even without obsHelps', () => {
    const langs: ListedLanguage[] = [
      {
        code: 'en',
        name: 'English',
        source: 'catalog',
        availability: { bible: true, obs: true, bibleHelps: true, obsHelps: true },
      },
      {
        code: 'es-419',
        name: 'Español Latin America',
        source: 'catalog',
        availability: { bible: true, obs: true, bibleHelps: true, obsHelps: true },
      },
      {
        code: 'id',
        name: 'Bahasa Indonesia',
        source: 'catalog',
        availability: { bible: true, obs: true, bibleHelps: true, obsHelps: true },
      },
      {
        code: 'hi',
        name: 'Hindi',
        source: 'door43',
        availability: { bible: false, obs: true, bibleHelps: false, obsHelps: true },
      },
      {
        code: 'fr',
        name: 'français',
        source: 'door43',
        availability: { bible: false, obs: true, bibleHelps: false, obsHelps: true },
      },
      {
        code: 'bho',
        name: 'Bhojpuri',
        source: 'door43',
        availability: { bible: false, obs: true, bibleHelps: false, obsHelps: false },
      },
    ]
    const codes = filterPickerLanguages(langs, { searchQuery: '' }).map((l) => l.code)
    expect(codes).toEqual(['en', 'es-419', 'id', 'hi', 'fr', 'bho'])
    expect(codes).toContain('bho')
    expect(codes.length).toBeGreaterThan(3)
  })

  test('search still applies after the union filter', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: 'esp',
    }).map((l) => l.code)
    expect(codes).toEqual(['es'])
  })

  test('search matches catalog anglicized_name (Spanish), not only the autonym', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: 'spanish',
    }).map((l) => l.code)
    expect(codes).toEqual(['es'])
  })

  test('search still applies after textKind filter', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: 'bho',
      textKind: 'obs',
    }).map((l) => l.code)
    expect(codes).toEqual(['bho'])
  })

  test('missing availability degrades into default both', () => {
    const langs: ListedLanguage[] = [
      { code: 'fr', name: 'French', source: 'door43' },
      LANGS[4],
    ]
    const codes = filterPickerLanguages(langs, { searchQuery: '' }).map((l) => l.code)
    expect(codes).toEqual(['fr'])
  })

  test('textKind applies the same way for every picker (no helps-only list)', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      textKind: 'obs',
    }).map((l) => l.code)
    expect(codes).toEqual(['en', 'bho', 'hi'])
  })
})
