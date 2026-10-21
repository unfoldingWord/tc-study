import { describe, expect, test } from 'bun:test'
import { chaptersToWarm } from './chaptersToWarm'

describe('chaptersToWarm', () => {
  test('nothing painted: the window around the nav chapter', () => {
    expect(chaptersToWarm({ navChapter: 3, lastChapter: 4, painted: [] })).toEqual([2, 3, 4])
  })

  test('adds the painted stack and one chapter past each edge', () => {
    expect(chaptersToWarm({ navChapter: 5, lastChapter: 20, painted: [5, 6, 7] })).toEqual([
      4, 5, 6, 7, 8,
    ])
  })

  test('painted stack away from nav keeps both bands, in insertion order', () => {
    expect(chaptersToWarm({ navChapter: 2, lastChapter: 20, painted: [10] })).toEqual([
      1, 2, 3, 10, 9, 11,
    ])
  })

  test('stays inside the book at both ends', () => {
    expect(chaptersToWarm({ navChapter: 1, lastChapter: 4, painted: [1] })).toEqual([1, 2])
    expect(chaptersToWarm({ navChapter: 4, lastChapter: 4, painted: [3, 4] })).toEqual([3, 4, 2])
  })
})
