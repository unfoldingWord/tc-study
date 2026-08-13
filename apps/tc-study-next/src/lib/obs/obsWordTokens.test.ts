import { describe, expect, test } from 'bun:test'
import { splitQuoteIntoParts, tokenizeObsFrameWords, tokenizeQuotePart } from './obsWordTokens'

describe('tokenizeObsFrameWords', () => {
  test('basic tokenization assigns wordIndex', () => {
    const tokens = tokenizeObsFrameWords('God created the world.')
    expect(tokens.map((t) => t.text)).toEqual(['God', 'created', 'the', 'world'])
    expect(tokens.map((t) => t.wordIndex)).toEqual([0, 1, 2, 3])
  })

  test('normalized is lowercase NFKD-stripped', () => {
    const tokens = tokenizeObsFrameWords('Cité')
    expect(tokens[0]!.normalized).toBe('cite')
    expect(tokens[0]!.text).toBe('Cité')
  })

  test('totalOccurrences counts repeated normalized forms', () => {
    const tokens = tokenizeObsFrameWords('God said God rested')
    const godTokens = tokens.filter((t) => t.normalized === 'god')
    expect(godTokens).toHaveLength(2)
    expect(godTokens.every((t) => t.totalOccurrences === 2)).toBe(true)
  })

  test('occurrence is 1-based per normalized form', () => {
    const tokens = tokenizeObsFrameWords('God said God rested')
    const godTokens = tokens.filter((t) => t.normalized === 'god')
    expect(godTokens[0]!.occurrence).toBe(1)
    expect(godTokens[1]!.occurrence).toBe(2)
  })

  test('hyphenated words treated as single token', () => {
    const tokens = tokenizeObsFrameWords('well-known fact')
    expect(tokens[0]!.text).toBe('well-known')
    expect(tokens[1]!.text).toBe('fact')
  })

  test('apostrophe words treated as single token', () => {
    const tokens = tokenizeObsFrameWords("he didn't go")
    expect(tokens[1]!.text).toBe("didn't")
  })

  test('curly apostrophe treated as single token', () => {
    const tokens = tokenizeObsFrameWords('he didn\u2019t go')
    expect(tokens[1]!.text).toBe('didn\u2019t')
  })

  test('digit sequences are tokens', () => {
    const tokens = tokenizeObsFrameWords('Genesis 1:1 says')
    expect(tokens.some((t) => t.text === '1')).toBe(true)
  })

  test('start and end are correct UTF-16 positions', () => {
    const text = 'In the beginning'
    const tokens = tokenizeObsFrameWords(text)
    for (const t of tokens) {
      expect(text.slice(t.start, t.end)).toBe(t.text)
    }
  })

  test('empty string returns empty array', () => {
    expect(tokenizeObsFrameWords('')).toEqual([])
  })

  test('accent-insensitive occurrence counting', () => {
    const tokens = tokenizeObsFrameWords('Cite cite Cité')
    // all three normalize to 'cite'
    expect(tokens.every((t) => t.totalOccurrences === 3)).toBe(true)
    expect(tokens.map((t) => t.occurrence)).toEqual([1, 2, 3])
  })
})

describe('splitQuoteIntoParts', () => {
  test('no separator → single part', () => {
    expect(splitQuoteIntoParts('hello world')).toEqual(['hello world'])
  })

  test('splits on &', () => {
    expect(splitQuoteIntoParts('foo & bar')).toEqual(['foo', 'bar'])
  })

  test('splits on ellipsis …', () => {
    expect(splitQuoteIntoParts('foo … bar')).toEqual(['foo', 'bar'])
  })

  test('splits on ...', () => {
    expect(splitQuoteIntoParts('foo ... bar')).toEqual(['foo', 'bar'])
  })

  test('multiple separators', () => {
    expect(splitQuoteIntoParts('a & b … c')).toEqual(['a', 'b', 'c'])
  })

  test('trims parts', () => {
    expect(splitQuoteIntoParts('  hello  &  world  ')).toEqual(['hello', 'world'])
  })

  test('empty string → empty array', () => {
    expect(splitQuoteIntoParts('')).toEqual([])
  })
})

describe('tokenizeQuotePart', () => {
  test('returns normalized word strings', () => {
    expect(tokenizeQuotePart('Hello World')).toEqual(['hello', 'world'])
  })

  test('accent normalization', () => {
    expect(tokenizeQuotePart('Cité')).toEqual(['cite'])
  })

  test('empty part → empty array', () => {
    expect(tokenizeQuotePart('')).toEqual([])
  })

  test('punctuation only → empty array', () => {
    expect(tokenizeQuotePart('...')).toEqual([])
  })
})
