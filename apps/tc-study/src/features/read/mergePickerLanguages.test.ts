import { describe, expect, test } from 'bun:test'
import { filterPickerLanguages } from './filterPickerLanguages'
import { mergeAvailabilityFromLanguageSets } from './languageAvailability'
import { mergePickerLanguages } from './mergePickerLanguages'

/**
 * Frozen Door43 snapshot (2026-08-12):
 * `list/languages?subject=Bible&subject=Aligned+Bible&stage=prod&topic=tc-ready`
 * is the 15-language GL set the picker was showing. French is not in it.
 *
 * Why French is excluded from `availability.bible` with current mapping:
 * `BIBLE_SUBJECTS` is only `Bible` + `Aligned Bible` at `topic=tc-ready`.
 * French Bibles exist at `stage=prod` (fr_lsg, fr_glt, fr_ulb, …) but are
 * **not** tagged tc-ready. French tc-ready resources are Open Bible Stories
 * only, so `obs` is true and `bible` stays false.
 */
const TC_READY_ALIGNED_BIBLE_CODES = Object.freeze([
  'ar',
  'bn',
  'en',
  'es-419',
  'fa',
  'gu',
  'hi',
  'id',
  'kn',
  'mr',
  'ne',
  'or',
  'ru',
  'te',
  'vi',
])

const DOOR43_LANGS = Object.freeze([
  Object.freeze({ code: 'en', name: 'English', anglicized_name: 'English', direction: 'ltr' as const }),
  Object.freeze({ code: 'fr', name: 'français', anglicized_name: 'French', direction: 'ltr' as const }),
  Object.freeze({ code: 'ru', name: 'Русский', anglicized_name: 'Russian', direction: 'ltr' as const }),
  Object.freeze({ code: 'el-x-koine', name: 'Koine Greek', direction: 'ltr' as const }),
])

describe('mergePickerLanguages + textKind (issue: incomplete Bible list)', () => {
  test('language in the catalog list but missing from availability still appears for Any', () => {
    const availabilityByCode = mergeAvailabilityFromLanguageSets({
      bible: ['en', 'ru'],
      obs: ['en'],
      bibleHelps: ['en'],
      obsHelps: [],
    })
    expect(availabilityByCode.has('fr')).toBe(false)

    const merged = mergePickerLanguages({
      catalogCodes: [],
      door43Langs: DOOR43_LANGS,
      availabilityByCode,
    })
    const fr = merged.find((lang) => lang.code === 'fr')
    expect(fr?.availability).toBeUndefined()
    expect(fr?.name).toBe('français')

    const anyCodes = filterPickerLanguages(merged, {
      searchQuery: '',
      listMode: 'text',
      textKind: 'both',
    }).map((lang) => lang.code)
    expect(anyCodes).toContain('fr')
    expect(anyCodes).toContain('en')
    expect(anyCodes).toContain('ru')
    expect(anyCodes).not.toContain('el-x-koine')

    const bibleCodes = filterPickerLanguages(merged, {
      searchQuery: '',
      listMode: 'text',
      textKind: 'bible',
    }).map((lang) => lang.code)
    expect(bibleCodes.sort()).toEqual(['en', 'ru'])
    expect(bibleCodes).not.toContain('fr')
    expect(anyCodes.length).toBeGreaterThan(bibleCodes.length)
  })

  test('Bible flags do not replace the Any list with the availability-only set', () => {
    const availabilityByCode = mergeAvailabilityFromLanguageSets({
      bible: [...TC_READY_ALIGNED_BIBLE_CODES],
      obs: ['fr', 'en'],
      bibleHelps: ['en'],
      obsHelps: [],
    })
    const merged = mergePickerLanguages({
      catalogCodes: ['en', 'hi'],
      door43Langs: [
        ...DOOR43_LANGS,
        { code: 'hi', name: 'हिन्दी', anglicized_name: 'Hindi' },
        { code: 'id', name: 'Indonesian' },
      ],
      availabilityByCode,
    })

    const anyCodes = filterPickerLanguages(merged, {
      searchQuery: '',
      listMode: 'text',
      textKind: 'both',
    }).map((lang) => lang.code)
    const bibleCodes = filterPickerLanguages(merged, {
      searchQuery: '',
      listMode: 'text',
      textKind: 'bible',
    }).map((lang) => lang.code)

    expect(anyCodes).toContain('fr')
    expect(anyCodes).toContain('ru')
    expect(bibleCodes).toContain('ru')
    expect(bibleCodes).not.toContain('fr')
    expect(anyCodes.length).toBeGreaterThan(bibleCodes.length)
    expect(merged.find((lang) => lang.code === 'hi')?.source).toBe('catalog')
  })

  test('availability-only OBS language is added when missing from getLanguages', () => {
    const availabilityByCode = mergeAvailabilityFromLanguageSets({
      bible: ['en'],
      obs: ['en', 'fr'],
      bibleHelps: [],
      obsHelps: [],
    })
    const merged = mergePickerLanguages({
      catalogCodes: ['en'],
      door43Langs: [{ code: 'en', name: 'English' }],
      availabilityByCode,
    })
    expect(merged.map((lang) => lang.code).sort()).toEqual(['en', 'fr'])
    expect(merged.find((lang) => lang.code === 'fr')?.availability?.obs).toBe(true)

    const anyCodes = filterPickerLanguages(merged, {
      searchQuery: '',
      textKind: 'both',
    }).map((lang) => lang.code)
    expect(anyCodes).toContain('fr')
  })

  test('tc-ready Bible subject mapping excludes French (OBS-only in that catalog)', () => {
    expect(TC_READY_ALIGNED_BIBLE_CODES).toContain('ru')
    expect(TC_READY_ALIGNED_BIBLE_CODES).not.toContain('fr')
    expect(TC_READY_ALIGNED_BIBLE_CODES).toHaveLength(15)
  })

  test('helps/OBS list unions every obsHelps code, not a 3-item cached GL subset', () => {
    const cachedGls = ['en', 'es-419', 'id'] as const
    const obsHelps = [
      'en',
      'es-419',
      'id',
      'hi',
      'fr',
      'ru',
      'sw',
      'bn',
      'gu',
      'ne',
      'or',
      'te',
      'kn',
      'mr',
      'ta',
      'ml',
      'pa',
      'as',
      'hr',
      'uk',
    ] as const
    const bibleHelps = ['en', 'es-419', 'hi', 'ru', 'ar', 'bn', 'fa', 'gu', 'id', 'kn', 'mr', 'ne', 'or', 'te'] as const
    const availabilityByCode = mergeAvailabilityFromLanguageSets({
      bible: ['en'],
      obs: ['en', 'hi', 'fr'],
      bibleHelps,
      obsHelps,
    })
    const merged = mergePickerLanguages({
      catalogCodes: [...cachedGls],
      door43Langs: cachedGls.map((code) => ({ code, name: code })),
      availabilityByCode,
    })

    const helpsObsCodes = filterPickerLanguages(merged, {
      searchQuery: '',
      listMode: 'helps',
      helpsFlag: 'obsHelps',
    }).map((lang) => lang.code)
    expect(helpsObsCodes.sort()).toEqual([...obsHelps].sort())
    expect(helpsObsCodes).toContain('hi')
    expect(helpsObsCodes).toContain('fr')
    expect(helpsObsCodes).not.toHaveLength(cachedGls.length)
    expect(helpsObsCodes.length).toBeGreaterThan(cachedGls.length)

    const helpsBibleCodes = filterPickerLanguages(merged, {
      searchQuery: '',
      listMode: 'helps',
      helpsFlag: 'bibleHelps',
    }).map((lang) => lang.code)
    expect(helpsBibleCodes.sort()).toEqual([...bibleHelps].sort())
    expect(helpsBibleCodes.length).toBeGreaterThan(cachedGls.length)
    expect(helpsBibleCodes).toContain('ar')
    expect(helpsBibleCodes).not.toContain('sw')
  })
})
