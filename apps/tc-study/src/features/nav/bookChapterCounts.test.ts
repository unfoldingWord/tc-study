import { describe, expect, test } from 'bun:test'
import { knownChapterCount, resolveLastChapter } from './bookChapterCounts'

describe('bookChapterCounts', () => {
  test('known counts for NT/OT books', () => {
    expect(knownChapterCount('tit')).toBe(3)
    expect(knownChapterCount('PSA')).toBe(150)
    expect(knownChapterCount('mat')).toBe(28)
    expect(knownChapterCount('unknown-book')).toBe(1)
  })

  test('resolveLastChapter prefers explicit then TOC then known', () => {
    expect(resolveLastChapter({ bookId: 'tit', explicit: 3 })).toBe(3)
    expect(resolveLastChapter({ bookId: 'mat', tocChapters: 28 })).toBe(28)
    expect(resolveLastChapter({ bookId: 'jhn' })).toBe(21)
    expect(resolveLastChapter({ bookId: 'tit', explicit: 0, tocChapters: 0 })).toBe(3)
  })
})
