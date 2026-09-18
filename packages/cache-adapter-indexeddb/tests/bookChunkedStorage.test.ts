import { describe, expect, test } from 'bun:test'

import {
  canSplitUsjScripture,
  isChapterSubKey,
} from '../src/bookChunkedStorage'

const chapterEntry = {
  content: {
    book: '1 Corinthians',
    bookCode: '1co',
    metadata: { version: '2.1.0-usj', bookCode: '1co' },
    usj: { type: 'USJ', version: '3.0', content: [{ c: 10 }] },
    alignmentMap: { '1CO 10:1': [] },
    chapters: [{ number: 10, content: [{ c: 10 }] }],
  },
  timestamp: Date.now(),
}

const bookEntry = {
  content: {
    ...chapterEntry.content,
    chapters: [
      { number: 1, content: [{ c: 1 }] },
      { number: 10, content: [{ c: 10 }] },
    ],
  },
  timestamp: Date.now(),
}

describe('canSplitUsjScripture', () => {
  test('does not re-split a first-class chapter key (even with chapters[])', () => {
    const key = 'scripture-usj:unfoldingWord/en/ust:1co:10'
    expect(isChapterSubKey(key)).toBe(true)
    expect(canSplitUsjScripture(key, chapterEntry as never)).toBe(false)
  })

  test('does not split a single-chapter payload at the book key', () => {
    expect(
      canSplitUsjScripture('scripture-usj:unfoldingWord/en/ust:1co', chapterEntry as never)
    ).toBe(false)
  })

  test('still splits a multi-chapter book blob', () => {
    expect(
      canSplitUsjScripture('scripture-usj:unfoldingWord/en/ust:1co', bookEntry as never)
    ).toBe(true)
  })
})
