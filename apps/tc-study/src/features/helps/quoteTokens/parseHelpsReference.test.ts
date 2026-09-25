import { describe, expect, test } from 'bun:test'
import {
  formatHelpsChapterVerseLabel,
  helpsReferenceCoversVerse,
  helpsReferenceOverlapsRange,
  parseHelpsReference,
  splitHelpsQuote,
} from './parseHelpsReference'

describe('parseHelpsReference', () => {
  test('parses a single verse', () => {
    expect(parseHelpsReference('5:1')).toEqual({
      chapter: 5,
      verses: [{ chapter: 5, verse: 1 }],
      isIntro: false,
      isFront: false,
      isDiscontinuous: false,
      isRange: false,
    })
  })

  test('expands a contiguous range (svyb 5:2-3)', () => {
    const parsed = parseHelpsReference('5:2-3')
    expect(parsed.verses).toEqual([
      { chapter: 5, verse: 2 },
      { chapter: 5, verse: 3 },
    ])
    expect(parsed.isRange).toBe(true)
    expect(parsed.isDiscontinuous).toBe(false)
  })

  test('expands a comma list (sbh4 5:1,3,8,12)', () => {
    const parsed = parseHelpsReference('5:1,3,8,12')
    expect(parsed.verses).toEqual([
      { chapter: 5, verse: 1 },
      { chapter: 5, verse: 3 },
      { chapter: 5, verse: 8 },
      { chapter: 5, verse: 12 },
    ])
    expect(parsed.isDiscontinuous).toBe(true)
    expect(parsed.isRange).toBe(false)
  })

  test('expands mixed range + list', () => {
    expect(parseHelpsReference('5:1-2,8').verses.map((v) => v.verse)).toEqual([1, 2, 8])
  })

  test('treats intro as non-verse', () => {
    const parsed = parseHelpsReference('1:intro')
    expect(parsed.isIntro).toBe(true)
    expect(parsed.isFront).toBe(false)
    expect(parsed.verses).toEqual([])
    expect(parsed.chapter).toBe(1)
  })

  test('maps 5:front / 5:0 superscription refs onto verse 1', () => {
    const front = parseHelpsReference('5:front')
    expect(front).toMatchObject({
      chapter: 5,
      verses: [{ chapter: 5, verse: 1 }],
      isIntro: false,
      isFront: true,
    })
    expect(parseHelpsReference('5:0')).toMatchObject({
      chapter: 5,
      verses: [{ chapter: 5, verse: 1 }],
      isFront: true,
    })
  })
})

describe('splitHelpsQuote', () => {
  test('splits Door43 & snippets', () => {
    expect(splitHelpsQuote('יְהוָ֔ה & יְֽהוָ֔ה & יְהוָ֕ה & יְהוָ֑ה')).toHaveLength(4)
    expect(splitHelpsQuote('לְקזוֹל & קוֹלִ֑י')).toEqual(['לְקזוֹל', 'קוֹלִ֑י'])
  })
})

describe('formatHelpsChapterVerseLabel', () => {
  test('formats TSV examples for headers', () => {
    expect(formatHelpsChapterVerseLabel('5:1,3,8,12')).toBe('5:1, 3, 8, 12')
    expect(formatHelpsChapterVerseLabel('5:2-3')).toBe('5:2–3')
    expect(formatHelpsChapterVerseLabel('5:1')).toBe('5:1')
  })
})

describe('placement: any listed verse', () => {
  test('comma list covers each listed verse, not the in-between', () => {
    expect(helpsReferenceCoversVerse('5:1,3,8,12', 5, 1)).toBe(true)
    expect(helpsReferenceCoversVerse('5:1,3,8,12', 5, 3)).toBe(true)
    expect(helpsReferenceCoversVerse('5:1,3,8,12', 5, 2)).toBe(false)
    expect(helpsReferenceCoversVerse('5:2-3', 5, 2)).toBe(true)
    expect(helpsReferenceCoversVerse('5:2-3', 5, 3)).toBe(true)
    expect(helpsReferenceCoversVerse('5:2-3', 5, 4)).toBe(false)
  })

  test('front covers verse 1 of that chapter', () => {
    expect(helpsReferenceCoversVerse('5:front', 5, 1)).toBe(true)
    expect(helpsReferenceCoversVerse('5:front', 5, 2)).toBe(false)
  })

  test('range overlap uses listed verses, not first-verse collapse', () => {
    const span = { startChapter: 5, startVerse: 3, endChapter: 5, endVerse: 3 }
    expect(helpsReferenceOverlapsRange('5:1,3,8,12', span)).toBe(true)
    expect(helpsReferenceOverlapsRange('5:1', span)).toBe(false)
    expect(helpsReferenceOverlapsRange('5:2-3', span)).toBe(true)
  })
})
