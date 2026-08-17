import { describe, expect, test } from 'bun:test'
import {
  languagePickerCardRole,
  pickerLanguageCodesEqual,
} from './languagePickerCardRole'

describe('pickerLanguageCodesEqual', () => {
  test('matches exact BCP-47 and en/eng, not es-419 → es', () => {
    expect(pickerLanguageCodesEqual('es-419', 'es-419')).toBe(true)
    expect(pickerLanguageCodesEqual('es-419', 'es')).toBe(false)
    expect(pickerLanguageCodesEqual('en', 'eng')).toBe(true)
    expect(pickerLanguageCodesEqual('mr', 'MR')).toBe(true)
    expect(pickerLanguageCodesEqual('es-419', null)).toBe(false)
  })
})

describe('languagePickerCardRole', () => {
  test('p1 es-419 / p2 mr: this pane is current, sibling is other', () => {
    expect(languagePickerCardRole('es-419', 'es-419', 'mr')).toBe('current')
    expect(languagePickerCardRole('mr', 'es-419', 'mr')).toBe('other')
    expect(languagePickerCardRole('en', 'es-419', 'mr')).toBeUndefined()
  })

  test('picker on p2 reverses current vs other', () => {
    expect(languagePickerCardRole('mr', 'mr', 'es-419')).toBe('current')
    expect(languagePickerCardRole('es-419', 'mr', 'es-419')).toBe('other')
  })

  test('same language both panes is current only', () => {
    expect(languagePickerCardRole('es-419', 'es-419', 'es-419')).toBe('current')
    expect(languagePickerCardRole('mr', 'es-419', 'es-419')).toBeUndefined()
  })
})
