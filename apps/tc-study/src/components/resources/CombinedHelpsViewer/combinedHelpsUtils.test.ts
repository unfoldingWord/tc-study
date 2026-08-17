import { describe, expect, test } from 'bun:test'
import { helpsCardVerseFilter } from './combinedHelpsUtils'

describe('helpsCardVerseFilter', () => {
  test('OBS card reference 1:1 maps to verse-filter chapter/verse', () => {
    expect(helpsCardVerseFilter('1:1')).toEqual({ chapter: 1, verse: 1 })
    expect(helpsCardVerseFilter('1:7')).toEqual({ chapter: 1, verse: 7 })
  })
})
