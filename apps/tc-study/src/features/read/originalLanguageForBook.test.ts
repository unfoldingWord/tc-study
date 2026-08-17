import { describe, expect, test } from 'bun:test'
import {
  originalLanguageBelongsOnBook,
  originalLanguageKeyForBook,
  UHB_RESOURCE_KEY,
  UGNT_RESOURCE_KEY,
} from './originalLanguageForBook'

describe('originalLanguageKeyForBook', () => {
  test('NT books map to UGNT only', () => {
    expect(originalLanguageKeyForBook('tit')).toBe(UGNT_RESOURCE_KEY)
    expect(originalLanguageKeyForBook('TIT')).toBe(UGNT_RESOURCE_KEY)
    expect(originalLanguageKeyForBook('mat')).toBe(UGNT_RESOURCE_KEY)
    expect(originalLanguageKeyForBook('rev')).toBe(UGNT_RESOURCE_KEY)
  })

  test('OT books map to UHB only', () => {
    expect(originalLanguageKeyForBook('rut')).toBe(UHB_RESOURCE_KEY)
    expect(originalLanguageKeyForBook('gen')).toBe(UHB_RESOURCE_KEY)
    expect(originalLanguageKeyForBook('mal')).toBe(UHB_RESOURCE_KEY)
  })

  test('OBS and unknown books have no original-language tab', () => {
    expect(originalLanguageKeyForBook('obs')).toBeNull()
    expect(originalLanguageKeyForBook('')).toBeNull()
    expect(originalLanguageKeyForBook('xyz')).toBeNull()
  })

  test('wrong-testament originals do not belong on the current book', () => {
    expect(originalLanguageBelongsOnBook(UHB_RESOURCE_KEY, 'tit')).toBe(false)
    expect(originalLanguageBelongsOnBook(`${UHB_RESOURCE_KEY}#2`, 'tit')).toBe(false)
    expect(originalLanguageBelongsOnBook(UGNT_RESOURCE_KEY, 'tit')).toBe(true)
    expect(originalLanguageBelongsOnBook(`${UGNT_RESOURCE_KEY}#2`, 'tit')).toBe(true)
    expect(originalLanguageBelongsOnBook(UGNT_RESOURCE_KEY, 'rut')).toBe(false)
    expect(originalLanguageBelongsOnBook(UHB_RESOURCE_KEY, 'rut')).toBe(true)
    expect(originalLanguageBelongsOnBook('unfoldingWord/en/ult', 'tit')).toBe(true)
  })
})
