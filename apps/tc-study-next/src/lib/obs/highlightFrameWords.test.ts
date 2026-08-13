import { describe, expect, test } from 'bun:test'
import type { ObsFrameQuoteEntry } from '../../signals/studioSignals'
import { computeFrameWordSpans, overlappingEntriesForWordRange } from './highlightFrameWords'

function entry(
  quote: string,
  occurrence: number,
  wordRanges: Array<{ startWord: number; endWord: number }>,
  sourceId = 's1'
): ObsFrameQuoteEntry {
  return {
    sourceId,
    kind: 'tn',
    quote,
    occurrence,
    wordRanges,
    startWord: wordRanges[0]?.startWord,
    endWord: wordRanges[0]?.endWord,
  }
}

describe('computeFrameWordSpans', () => {
  test('single match produces highlighted span', () => {
    const text = 'God created the world.'
    const entries = [entry('created', 1, [{ startWord: 1, endWord: 1 }])]
    const spans = computeFrameWordSpans(text, entries)
    const highlighted = spans.filter((s) => s.quoteIndex !== undefined)
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]!.text).toBe('created')
    expect(highlighted[0]!.quoteIndex).toBe(0)
    expect(highlighted[0]!.startWord).toBe(1)
    expect(highlighted[0]!.endWord).toBe(1)
  })

  test('plain text before and after is preserved', () => {
    const text = 'In the beginning'
    const entries = [entry('the', 1, [{ startWord: 1, endWord: 1 }])]
    const spans = computeFrameWordSpans(text, entries)
    const texts = spans.map((s) => s.text)
    expect(texts.join('')).toBe(text)
  })

  test('case insensitive — original text preserved in span', () => {
    const text = 'God Created the world.'
    const entries = [entry('created', 1, [{ startWord: 1, endWord: 1 }])]
    const spans = computeFrameWordSpans(text, entries)
    expect(spans.some((s) => s.text === 'Created' && s.quoteIndex === 0)).toBe(true)
  })

  test('Nth occurrence — correct token highlighted', () => {
    const text = 'God said God rested.'
    const entries = [entry('God', 2, [{ startWord: 2, endWord: 2 }])]
    const spans = computeFrameWordSpans(text, entries)
    const hl = spans.filter((s) => s.quoteIndex !== undefined)
    expect(hl).toHaveLength(1)
    expect(hl[0]!.startWord).toBe(2)
  })

  test('overlap: shorter range wins, parentQuoteIndices on shorter span', () => {
    // "foo bar" (2 words, qi=0) and "bar" (1 word, qi=1)
    // "bar" is shorter → wins the "bar" token; "foo" stays with qi=0
    const text = 'foo bar baz'
    const entries = [
      entry('foo bar', 1, [{ startWord: 0, endWord: 1 }], 's1'), // qi=0, length 2
      entry('bar', 1, [{ startWord: 1, endWord: 1 }], 's2'),     // qi=1, length 1
    ]
    const spans = computeFrameWordSpans(text, entries)
    const fooSpan = spans.find((s) => s.text === 'foo' && s.quoteIndex === 0)
    const barSpan = spans.find((s) => s.text === 'bar' && s.quoteIndex === 1)
    expect(fooSpan).toBeDefined()
    expect(barSpan).toBeDefined()
    expect(barSpan!.parentQuoteIndices).toContain(0)
  })

  test('equal-length tie: lower entryIndex wins', () => {
    const text = 'abc def'
    const entries = [
      entry('abc', 1, [{ startWord: 0, endWord: 0 }], 's1'), // qi=0
      entry('abc', 1, [{ startWord: 0, endWord: 0 }], 's2'), // qi=1
    ]
    const spans = computeFrameWordSpans(text, entries)
    const hl = spans.filter((s) => s.quoteIndex !== undefined)
    expect(hl[0]!.quoteIndex).toBe(0)
  })

  test('occurrence -1: all matches highlighted', () => {
    const text = 'God said God rested and God slept.'
    const entries = [
      entry('God', -1, [
        { startWord: 0, endWord: 0 },
        { startWord: 2, endWord: 2 },
        { startWord: 5, endWord: 5 },
      ]),
    ]
    const spans = computeFrameWordSpans(text, entries)
    expect(spans.filter((s) => s.quoteIndex === 0)).toHaveLength(3)
  })

  test('multi-part & quote: both parts highlighted as same entry', () => {
    const text = 'The Lord God spoke and the earth trembled.'
    // "Lord" is word 1, "earth" is word 6
    const entries = [
      entry('Lord & earth', 1, [
        { startWord: 1, endWord: 1 },
        { startWord: 6, endWord: 6 },
      ]),
    ]
    const spans = computeFrameWordSpans(text, entries)
    const hl = spans.filter((s) => s.quoteIndex === 0)
    expect(hl).toHaveLength(2)
    expect(hl.map((s) => s.text)).toEqual(expect.arrayContaining(['Lord', 'earth']))
  })

  test('no entries → single plain span', () => {
    const spans = computeFrameWordSpans('hello world', [])
    expect(spans).toEqual([{ text: 'hello world' }])
  })

  test('empty text → empty array', () => {
    expect(computeFrameWordSpans('', [])).toEqual([])
  })

  test('full text reconstruction from all spans', () => {
    const text = 'In the beginning God created the heavens and the earth.'
    const entries = [entry('the beginning', 1, [{ startWord: 1, endWord: 2 }])]
    const spans = computeFrameWordSpans(text, entries)
    expect(spans.map((s) => s.text).join('')).toBe(text)
  })
})

describe('overlappingEntriesForWordRange', () => {
  test('returns entry when range intersects', () => {
    const entries = [
      entry('foo', 1, [{ startWord: 2, endWord: 4 }]),
    ]
    expect(overlappingEntriesForWordRange(entries, 3, 3)).toHaveLength(1)
  })

  test('returns nothing when range does not intersect', () => {
    const entries = [entry('foo', 1, [{ startWord: 2, endWord: 4 }])]
    expect(overlappingEntriesForWordRange(entries, 5, 6)).toHaveLength(0)
  })

  test('returns entry when range exactly matches', () => {
    const entries = [entry('foo', 1, [{ startWord: 2, endWord: 4 }])]
    expect(overlappingEntriesForWordRange(entries, 2, 4)).toHaveLength(1)
  })

  test('multi-part entry: click on second part returns entry', () => {
    const e = entry('Lord & earth', 1, [
      { startWord: 1, endWord: 1 },
      { startWord: 6, endWord: 6 },
    ])
    // Click on word 6 (earth)
    expect(overlappingEntriesForWordRange([e], 6, 6)).toHaveLength(1)
    // Click on word 1 (Lord)
    expect(overlappingEntriesForWordRange([e], 1, 1)).toHaveLength(1)
    // Click on word 3 (not in any part)
    expect(overlappingEntriesForWordRange([e], 3, 3)).toHaveLength(0)
  })

  test('falls back to startWord/endWord when no wordRanges', () => {
    const e: ObsFrameQuoteEntry = {
      sourceId: 's1',
      kind: 'tn',
      quote: 'test',
      occurrence: 1,
      startWord: 2,
      endWord: 4,
    }
    expect(overlappingEntriesForWordRange([e], 3, 3)).toHaveLength(1)
    expect(overlappingEntriesForWordRange([e], 5, 5)).toHaveLength(0)
  })

  test('entry with no word info → excluded', () => {
    const e: ObsFrameQuoteEntry = {
      sourceId: 's1',
      kind: 'tn',
      quote: 'test',
      occurrence: 1,
    }
    expect(overlappingEntriesForWordRange([e], 0, 10)).toHaveLength(0)
  })
})
