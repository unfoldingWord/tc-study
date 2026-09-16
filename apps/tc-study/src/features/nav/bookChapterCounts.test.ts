import { describe, expect, test } from 'bun:test'
import { knownChapterCount, resolveLastChapter } from './bookChapterCounts'

describe('bookChapterCounts', () => {
  test('known counts for NT/OT books', () => {
    expect(knownChapterCount('tit')).toBe(3)
    expect(knownChapterCount('PSA')).toBe(150)
    expect(knownChapterCount('mat')).toBe(28)
    expect(knownChapterCount('unknown-book')).toBe(1)
  })

  test('resolveLastChapter takes max of explicit, TOC, and known', () => {
    expect(resolveLastChapter({ bookId: 'tit', explicit: 3 })).toBe(3)
    expect(resolveLastChapter({ bookId: 'mat', tocChapters: 28 })).toBe(28)
    expect(resolveLastChapter({ bookId: 'jhn' })).toBe(21)
    expect(resolveLastChapter({ bookId: 'psa' })).toBe(150)
    expect(resolveLastChapter({ bookId: 'tit', explicit: 0, tocChapters: 0 })).toBe(3)
    // Partial chapter-grained load must not clamp below known/TOC
    expect(resolveLastChapter({ bookId: 'psa', explicit: 2, tocChapters: 150 })).toBe(150)
    expect(resolveLastChapter({ bookId: 'psa', explicit: 2 })).toBe(150)
  })
})
