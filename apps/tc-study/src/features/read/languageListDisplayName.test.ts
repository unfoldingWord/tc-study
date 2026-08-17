import { describe, expect, test } from 'bun:test'
import {
  door43ToListNameFields,
  languageAnglicizedDisplayName,
  languageEnglishCopyDisplayName,
  languageListDisplayName,
  languagePickerA11yLabel,
  listedLanguageByCode,
  sentenceCaseLanguageName,
} from './languageListDisplayName'

/** Door43 list/languages shape: `ln` → name, `ang` → anglicized_name. */
const ES_DOOR43 = {
  code: 'es',
  name: 'español',
  anglicized_name: 'Spanish',
} as const

const ES_LISTED = {
  code: 'es',
  name: ES_DOOR43.name,
  anglicizedName: ES_DOOR43.anglicized_name,
} as const

describe('languageListDisplayName', () => {
  test('maps Door43 ln/ang into list name + anglicizedName', () => {
    const fields = door43ToListNameFields(ES_DOOR43)
    expect(fields).toEqual({ name: 'español', anglicizedName: 'Spanish' })
  })

  test('picker cards use the autonym, not catalog anglicized_name', () => {
    expect(languageListDisplayName(ES_LISTED, 'es')).toBe('Español')
    expect(languageListDisplayName({ name: 'español' }, 'es')).toBe('Español')
    expect(languageListDisplayName({ anglicizedName: 'Spanish' }, 'es')).toBe('Spanish')
  })

  test('empty copy uses catalog anglicized_name, not the autonym', () => {
    expect(languageAnglicizedDisplayName(ES_LISTED, 'es')).toBe('Spanish')
    expect(languageAnglicizedDisplayName({ name: 'español' }, 'es')).toBe('Español')
  })

  test('card a11y label is native primary with anglicized in parentheses', () => {
    expect(languagePickerA11yLabel(ES_LISTED, 'es')).toBe('Español (Spanish)')
    expect(languagePickerA11yLabel({ name: 'English', anglicizedName: 'English' }, 'en')).toBe(
      'English'
    )
  })

  test('sentence-cases lowercase autonyms when anglicized_name is missing', () => {
    expect(sentenceCaseLanguageName('español')).toBe('Español')
    expect(sentenceCaseLanguageName('Spanish')).toBe('Spanish')
  })

  test('es-419 picker stays native; English copy uses anglicizedName', () => {
    const es419 = {
      code: 'es-419',
      name: 'Español Latin America',
      anglicizedName: 'Latin American Spanish',
    } as const
    expect(languageListDisplayName(es419, 'es-419')).toBe('Español Latin America')
    expect(languageAnglicizedDisplayName(es419, 'es-419')).toBe('Latin American Spanish')
    expect(languagePickerA11yLabel(es419, 'es-419')).toBe(
      'Español Latin America (Latin American Spanish)'
    )
    expect(listedLanguageByCode([ES_LISTED, es419], 'es-419')).toEqual(es419)
    expect(listedLanguageByCode([ES_LISTED, es419], 'es-419')?.anglicizedName).not.toBe('Spanish')
    expect(listedLanguageByCode([ES_LISTED, es419], 'es')?.anglicizedName).toBe('Spanish')
  })

  test('en and eng resolve to the same Door43 English list row', () => {
    const english = { code: 'en', name: 'English', anglicizedName: 'English' } as const
    expect(listedLanguageByCode([english, ES_LISTED], 'eng')).toEqual(english)
    expect(listedLanguageByCode([english, ES_LISTED], 'en')).toEqual(english)
  })

  test('English sentence copy is anglicized with native in parentheses when they differ', () => {
    const es419 = {
      code: 'es-419',
      name: 'Español Latin America',
      anglicizedName: 'Latin American Spanish',
    } as const
    expect(languageEnglishCopyDisplayName(es419, 'es-419')).toBe(
      'Latin American Spanish (Español Latin America)'
    )
    expect(languageEnglishCopyDisplayName(ES_LISTED, 'es')).toBe('Spanish (Español)')
    expect(
      languageEnglishCopyDisplayName({ name: 'English', anglicizedName: 'English' }, 'en')
    ).toBe('English')
    expect(languageEnglishCopyDisplayName({ name: 'English', anglicizedName: 'English' }, 'en')).not.toContain(
      '(English)'
    )
    expect(languageEnglishCopyDisplayName({ anglicizedName: 'Spanish' }, 'es')).toBe('Spanish')
    expect(languageEnglishCopyDisplayName({ name: 'español' }, 'es')).toBe('Español')
    expect(languageListDisplayName(es419, 'es-419')).toBe('Español Latin America')
  })
})
