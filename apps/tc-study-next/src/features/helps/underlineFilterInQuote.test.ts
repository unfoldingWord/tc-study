import { describe, expect, test } from 'bun:test'
import { underlineFilterInQuote } from './underlineFilterInQuote'

function marked(quote: string, filter: string | null | undefined): string[] {
  return underlineFilterInQuote(quote, filter)
    .filter((s) => s.underline)
    .map((s) => s.text)
}

function plain(quote: string, filter: string | null | undefined): string {
  return underlineFilterInQuote(quote, filter)
    .map((s) => s.text)
    .join('')
}

describe('underlineFilterInQuote', () => {
  test('no filter leaves the quote unmarked', () => {
    const quote = 'One of them of their own prophets'
    expect(underlineFilterInQuote(quote, null)).toEqual([{ text: quote, underline: false }])
    expect(underlineFilterInQuote(quote, undefined)).toEqual([{ text: quote, underline: false }])
    expect(underlineFilterInQuote(quote, '')).toEqual([{ text: quote, underline: false }])
    expect(underlineFilterInQuote(quote, '   ')).toEqual([{ text: quote, underline: false }])
  })

  test('marks the filter word in a TN-style quote', () => {
    expect(marked('One of them of their own prophets', 'prophets')).toEqual(['prophets'])
    expect(plain('One of them of their own prophets', 'prophets')).toBe(
      'One of them of their own prophets'
    )
  })

  test('marks the filter word in an ellipsis TWL quote', () => {
    expect(marked('of … prophets', 'prophets')).toEqual(['prophets'])
    expect(marked('of ... prophets', 'prophets')).toEqual(['prophets'])
  })

  test('punctuation is a boundary, not part of the word', () => {
    expect(marked('prophets.', 'prophets')).toEqual(['prophets'])
    expect(marked('(prophets)', 'prophets')).toEqual(['prophets'])
    expect(marked('“prophets”', 'prophets')).toEqual(['prophets'])
    expect(plain('prophets.', 'prophets')).toBe('prophets.')
  })

  test('match is case-insensitive and preserves quote casing', () => {
    expect(marked('their own Prophets', 'prophets')).toEqual(['Prophets'])
    expect(marked('their own prophets', 'Prophets')).toEqual(['prophets'])
  })

  test('does not mark a longer word that only shares a prefix', () => {
    expect(marked('a prophetic word', 'prophet')).toEqual([])
    expect(marked('prophetic prophets', 'prophets')).toEqual(['prophets'])
  })

  test('marks every whole-word occurrence', () => {
    expect(marked('prophets and more prophets', 'prophets')).toEqual(['prophets', 'prophets'])
  })

  test('empty quote yields no segments', () => {
    expect(underlineFilterInQuote('', 'prophets')).toEqual([])
  })
})
