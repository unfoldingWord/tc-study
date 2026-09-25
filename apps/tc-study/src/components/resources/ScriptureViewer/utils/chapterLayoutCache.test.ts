import { describe, expect, test } from 'bun:test'
import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import {
  getBookLayoutBlocks,
  getCachedChapterLayoutHeight,
  getChapterDisplayVerses,
  getChapterLayoutBlocks,
  getChapterLayoutCacheStats,
  getChapterParagraphs,
  getChapterVerseBlockItems,
  rememberChapterLayoutHeight,
  resetChapterLayoutCacheStats,
  resetChapterLayoutHeights,
} from './chapterLayoutCache'
import { displayVersesForChapters } from './displayVersesForChapters'

function twoChapterViewModel(): UsjScriptureViewModel {
  const usj = {
    type: 'USJ',
    version: '3.1',
    content: [
      { type: 'book', marker: 'id', content: 'TIT' },
      { type: 'chapter', marker: 'c', number: '1', sid: 'TIT 1' },
      {
        type: 'para',
        marker: 's1',
        content: ['Greeting'],
      },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '1', sid: 'TIT 1:1' },
          { type: 'char', marker: 'w', content: ['Paul'] },
          ', ',
          { type: 'char', marker: 'w', content: ['servant'] },
        ],
      },
      { type: 'chapter', marker: 'c', number: '2', sid: 'TIT 2' },
      {
        type: 'para',
        marker: 'p',
        content: [
          { type: 'verse', marker: 'v', number: '1', sid: 'TIT 2:1' },
          { type: 'char', marker: 'w', content: ['Teach'] },
        ],
      },
    ],
  }
  return {
    bookCode: 'tit',
    bookName: 'Titus',
    usj,
    alignmentMap: {},
    chapters: [
      {
        number: 1,
        verses: [{ number: 1, reference: 'tit 1:1', text: 'Paul servant', tokens: [] }],
      },
      {
        number: 2,
        verses: [{ number: 1, reference: 'tit 2:1', text: 'Teach', tokens: [] }],
      },
    ],
  } as unknown as UsjScriptureViewModel
}

describe('chapterLayoutCache', () => {
  test('stitching chapter N does not re-walk or rebuild chapter N-1', () => {
    resetChapterLayoutCacheStats()
    const viewModel = twoChapterViewModel()

    const chapter1Blocks = getChapterLayoutBlocks(viewModel, 1)
    const chapter1Sequence = getChapterVerseBlockItems(viewModel, 1)
    const chapter1Verses = getChapterDisplayVerses(viewModel, 1)
    expect(chapter1Blocks.length).toBeGreaterThan(0)
    expect(chapter1Sequence.length).toBeGreaterThan(0)
    expect(getChapterLayoutCacheStats()).toEqual({
      bookBuilds: 0,
      chapterBuilds: 1,
      chapterSequenceComputes: 1,
      displayVerseComputes: 1,
      paragraphBuilds: 0,
    })

    const chapter2Blocks = getChapterLayoutBlocks(viewModel, 2)
    const chapter2Sequence = getChapterVerseBlockItems(viewModel, 2)
    expect(chapter2Blocks.length).toBeGreaterThan(0)
    expect(chapter2Sequence.length).toBeGreaterThan(0)
    expect(getChapterLayoutCacheStats()).toEqual({
      bookBuilds: 0,
      chapterBuilds: 2,
      chapterSequenceComputes: 2,
      displayVerseComputes: 2,
      paragraphBuilds: 0,
    })

    expect(getChapterLayoutBlocks(viewModel, 1)).toBe(chapter1Blocks)
    expect(getChapterVerseBlockItems(viewModel, 1)).toBe(chapter1Sequence)
    expect(getChapterDisplayVerses(viewModel, 1)).toBe(chapter1Verses)
    // Full-book build is separate and should not invalidate chapter caches already held.
    const full = getBookLayoutBlocks(viewModel)
    expect(getBookLayoutBlocks(viewModel)).toBe(full)
    expect(getChapterLayoutCacheStats().bookBuilds).toBe(1)
    expect(getChapterLayoutCacheStats().chapterSequenceComputes).toBe(2)
    expect(getChapterLayoutCacheStats().displayVerseComputes).toBe(2)
  })

  test('remembers measured chapter heights for later placeholders', () => {
    resetChapterLayoutHeights()
    expect(getCachedChapterLayoutHeight('tit', 2)).toBeNull()
    rememberChapterLayoutHeight('TIT', 2, 640)
    expect(getCachedChapterLayoutHeight('tit', 2)).toBe(640)
    rememberChapterLayoutHeight('tit', 2, 4)
    expect(getCachedChapterLayoutHeight('tit', 2)).toBe(640)
    resetChapterLayoutHeights()
    expect(getCachedChapterLayoutHeight('tit', 2)).toBeNull()
  })

  test('displayVersesForChapters reuses cached chapter N-1 verse objects', () => {
    resetChapterLayoutCacheStats()
    const viewModel = twoChapterViewModel()
    const first = displayVersesForChapters(viewModel, [1])
    const windowed = displayVersesForChapters(viewModel, [1, 2])
    expect(windowed[0]).toBe(first[0])
    expect(windowed.map((verse) => verse.chapterNumber)).toEqual([1, 2])
    expect(getChapterLayoutCacheStats().displayVerseComputes).toBe(2)
    expect(getChapterLayoutCacheStats().bookBuilds).toBe(0)
  })

  test('paragraph cache is one book walk and does not build layout tokens', () => {
    resetChapterLayoutCacheStats()
    const viewModel = twoChapterViewModel()
    const chapter1 = getChapterParagraphs(viewModel, 1)
    const chapter2 = getChapterParagraphs(viewModel, 2)
    expect(chapter1).toEqual(['1 Paul, servant'])
    expect(chapter2).toEqual(['1 Teach'])
    expect(getChapterParagraphs(viewModel, 1)).toBe(chapter1)
    expect(getChapterLayoutCacheStats()).toEqual({
      bookBuilds: 0,
      chapterBuilds: 0,
      chapterSequenceComputes: 0,
      displayVerseComputes: 0,
      paragraphBuilds: 1,
    })
  })
})
