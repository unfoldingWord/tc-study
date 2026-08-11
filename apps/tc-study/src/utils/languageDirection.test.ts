import { describe, expect, test } from 'bun:test'
import { getLanguageDirection, isRtlLanguageCode } from './languageDirection'

describe('languageDirection', () => {
  test('catalog ld wins over list and known codes', () => {
    expect(getLanguageDirection('rtl', 'ltr', 'en')).toBe('rtl')
    expect(getLanguageDirection('ltr', 'rtl', 'ar')).toBe('ltr')
  })

  test('list direction used when catalog missing', () => {
    expect(getLanguageDirection(null, 'rtl', 'en')).toBe('rtl')
    expect(getLanguageDirection(undefined, 'ltr', 'ar')).toBe('ltr')
  })

  test('known RTL codes fallback when catalog/list absent', () => {
    expect(getLanguageDirection(null, null, 'ar')).toBe('rtl')
    expect(getLanguageDirection(undefined, undefined, 'he')).toBe('rtl')
    expect(getLanguageDirection(null, null, 'en')).toBe('ltr')
  })

  test('isRtlLanguageCode covers known RTL set', () => {
    expect(isRtlLanguageCode('ar')).toBe(true)
    expect(isRtlLanguageCode('fa')).toBe(true)
    expect(isRtlLanguageCode('en')).toBe(false)
    expect(isRtlLanguageCode(undefined)).toBe(false)
  })
})
