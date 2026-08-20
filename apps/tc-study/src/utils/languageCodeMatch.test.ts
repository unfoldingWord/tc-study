import { describe, expect, test } from 'bun:test'
import {
  canonicalReadLanguageCode,
  DEFAULT_READ_LANGUAGE_CODE,
  door43LanguageQueryCode,
  languageCodesMatch,
  primaryLanguageSegment,
} from './languageCodeMatch'

describe('languageCodeMatch', () => {
  test('en and eng are the same English language', () => {
    expect(languageCodesMatch('en', 'eng')).toBe(true)
    expect(languageCodesMatch('eng', 'en')).toBe(true)
    expect(languageCodesMatch('en-US', 'eng')).toBe(true)
    expect(languageCodesMatch('en', 'tr')).toBe(false)
    expect(primaryLanguageSegment('eng')).toBe('eng')
    expect(door43LanguageQueryCode('eng')).toBe('en')
    expect(door43LanguageQueryCode('en')).toBe('en')
    expect(door43LanguageQueryCode('tr')).toBe('tr')
    expect(canonicalReadLanguageCode('eng')).toBe(DEFAULT_READ_LANGUAGE_CODE)
    expect(DEFAULT_READ_LANGUAGE_CODE).toBe('en')
  })
})
