import { describe, expect, test } from 'bun:test'
import {
  parseScriptureLink,
  parseScriptureRefFromText,
  parseScriptureRefsFromText,
  splitScriptureRefText,
} from './parseScriptureLink'

describe('parseScriptureRefsFromText', () => {
  test('parses parallel-passage and multi-book xref text', () => {
    expect(parseScriptureRefFromText('1 Timothy 5:3–16', 'rut')).toEqual({
      book: '1ti',
      chapter: 5,
      verse: 3,
      endVerse: 16,
    })
    expect(parseScriptureRefsFromText('Matthew 1:1–17; Luke 3:23–38', 'rut')).toEqual([
      { book: 'mat', chapter: 1, verse: 1, endVerse: 17 },
      { book: 'luk', chapter: 3, verse: 23, endVerse: 38 },
    ])
  })

  test('falls back to the current book for chapter:verse-only text', () => {
    expect(parseScriptureRefFromText('1:1–2:10', 'rut')).toEqual({
      book: 'rut',
      chapter: 1,
      verse: 1,
      endChapter: 2,
      endVerse: 10,
    })
  })
})

describe('splitScriptureRefText', () => {
  test('keeps parentheses around a clickable ref', () => {
    const parts = splitScriptureRefText('(1 Timothy 5:3–16)', 'rut')
    expect(parts).toEqual([
      { kind: 'text', text: '(' },
      {
        kind: 'ref',
        text: '1 Timothy 5:3–16',
        ref: { book: '1ti', chapter: 5, verse: 3, endVerse: 16 },
      },
      { kind: 'text', text: ')' },
    ])
  })
})

describe('parseScriptureLink', () => {
  test('still parses relative markdown scripture links', () => {
    expect(parseScriptureLink('1:1–2:10', '../01/01.md', 'rut')).toEqual({
      book: 'rut',
      chapter: 1,
      verse: 1,
      endChapter: 2,
      endVerse: 10,
    })
    expect(parseScriptureLink('See verse 5', '../01/05.md', 'rut')).toEqual({
      book: 'rut',
      chapter: 1,
      verse: 5,
    })
  })
})
