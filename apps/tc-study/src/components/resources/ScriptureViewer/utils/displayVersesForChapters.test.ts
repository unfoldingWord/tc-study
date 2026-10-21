import { describe, expect, test } from 'bun:test'
import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import { displayVersesForChapters } from './displayVersesForChapters'

const viewModel = {
  chapters: [
    { number: 1, verses: [{ number: 1, text: 'a', tokens: [] }] },
    { number: 2, verses: [{ number: 1, text: 'b', tokens: [] }] },
    { number: 3, verses: [{ number: 1, text: 'c', tokens: [] }] },
  ],
} as unknown as UsjScriptureViewModel

describe('displayVersesForChapters', () => {
  test('returns only the requested chapter window', () => {
    const verses = displayVersesForChapters(viewModel, [2, 3])
    expect(verses.map((verse) => verse.chapterNumber)).toEqual([2, 3])
    expect(verses.some((verse) => verse.chapterNumber === 1)).toBe(false)
  })
})
