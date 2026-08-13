import { describe, expect, test } from 'bun:test'
import {
  door43ToListNameFields,
  languageAnglicizedDisplayName,
  languageListDisplayName,
  languagePickerA11yLabel,
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
})
