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
    name: 'Español',
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
  test('text mode lists all languages (no Bible/OBS hide — that is #25)', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      listMode: 'text',
    }).map((l) => l.code)
    expect(codes).toEqual(['en', 'es', 'bho', 'hi', 'sw'])
  })

  test('omitted listMode behaves as text (all languages)', () => {
    const codes = filterPickerLanguages(LANGS, { searchQuery: '' }).map((l) => l.code)
    expect(codes).toEqual(['en', 'es', 'bho', 'hi', 'sw'])
  })

  test('helps mode + bibleHelps keeps only Bible-helps languages', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      listMode: 'helps',
      helpsFlag: 'bibleHelps',
    }).map((l) => l.code)
    expect(codes).toEqual(['en', 'es'])
  })

  test('helps mode + obsHelps keeps only OBS-helps languages', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: '',
      listMode: 'helps',
      helpsFlag: 'obsHelps',
    }).map((l) => l.code)
    expect(codes).toEqual(['en', 'hi'])
  })

  test('search still applies after helps filter', () => {
    const codes = filterPickerLanguages(LANGS, {
      searchQuery: 'esp',
      listMode: 'helps',
      helpsFlag: 'bibleHelps',
    }).map((l) => l.code)
    expect(codes).toEqual(['es'])
  })
})
