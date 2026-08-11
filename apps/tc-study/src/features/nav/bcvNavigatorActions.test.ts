import { describe, expect, test } from 'bun:test'
import {
  buildObsRangeApplyRef,
  buildVerseApplyRef,
  chapterClickSelection,
  initVerseRangeFromRef,
  nextObsRangeClick,
  nextVerseClickSelection,
  obsStoryIdsFromIngredients,
} from './bcvNavigatorActions'

describe('bcvNavigatorActions', () => {
  test('nextVerseClickSelection toggles start/end', () => {
    expect(nextVerseClickSelection('1:1', null, null)).toEqual({
      startVerse: '1:1',
      endVerse: null,
    })
    expect(nextVerseClickSelection('1:1', '1:1', null)).toEqual({
      startVerse: null,
      endVerse: null,
    })
    expect(nextVerseClickSelection('1:3', '1:1', null)).toEqual({
      startVerse: '1:1',
      endVerse: '1:3',
    })
  })

  test('chapterClickSelection spans first/last verse', () => {
    expect(
      chapterClickSelection([
        { key: '2:1', chapter: 2, verse: 1 },
        { key: '2:2', chapter: 2, verse: 2 },
      ])
    ).toEqual({ startVerse: '2:1', endVerse: '2:2' })
    expect(chapterClickSelection([])).toBeNull()
  })

  test('buildVerseApplyRef and buildObsRangeApplyRef shape refs', () => {
    expect(buildVerseApplyRef('gen', '1:1', '1:3')).toEqual({
      book: 'gen',
      chapter: 1,
      verse: 1,
      endChapter: 1,
      endVerse: 3,
    })
    expect(buildObsRangeApplyRef({ story: 1, frame: 2 }, { story: 1, frame: 4 })).toEqual({
      book: 'obs',
      chapter: 1,
      verse: 2,
      endChapter: undefined,
      endVerse: 4,
    })
  })

  test('nextObsRangeClick and initVerseRangeFromRef', () => {
    expect(nextObsRangeClick(1, 2, null, null)).toEqual({
      start: { story: 1, frame: 2 },
      end: null,
    })
    expect(
      initVerseRangeFromRef({ book: 'gen', chapter: 3, verse: 4, endVerse: 6 })
    ).toEqual({ startVerse: '3:4', endVerse: '3:6' })
  })

  test('obsStoryIdsFromIngredients falls back to 1..50', () => {
    expect(obsStoryIdsFromIngredients(undefined)).toHaveLength(50)
    expect(obsStoryIdsFromIngredients([{ identifier: '3' }, { identifier: '1' }])).toEqual([
      1, 3,
    ])
  })
})
