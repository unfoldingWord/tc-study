import { describe, expect, test } from 'bun:test'
import { decodeWords, encodeWords } from './wordList'

describe('word lists', () => {
  test('the empty list is the empty text', () => {
    expect(encodeWords([])).toBe('')
    expect(decodeWords('')).toEqual([])
  })

  test('each number is written as its gap from the one before, so consecutive words are zero bytes', () => {
    expect(encodeWords([0, 1, 2])).toBe('AAAA')
  })

  test('gaps of several bytes round-trip', () => {
    // Gaps 0, 0, 3, 194, 69799: bytes 00 00 03 C2 01 A7 A1 04.
    expect(encodeWords([0, 1, 5, 200, 70000])).toBe('AAADwgGnoQQ=')
    expect(decodeWords(encodeWords([0, 1, 5, 200, 70000]))).toEqual([0, 1, 5, 200, 70000])
  })

  test('numbers past 32 bits round-trip', () => {
    expect(decodeWords(encodeWords([2 ** 31, 2 ** 32 + 5, Number.MAX_SAFE_INTEGER]))).toEqual([2 ** 31, 2 ** 32 + 5, Number.MAX_SAFE_INTEGER])
  })

  test('twenty thousand random sorted numbers round-trip', () => {
    // A fixed seed: a failure can be run again.
    let seed = 0x2f6b
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0)
    const words = new Set<number>()
    while (words.size < 20_000) words.add(next() % 500_000)
    const sorted = [...words].sort((a, b) => a - b)
    expect(decodeWords(encodeWords(sorted))).toEqual(sorted)
  })

  test('a list that is not sorted, distinct, non-negative integers is refused', () => {
    expect(() => encodeWords([3, 1])).toThrow()
    expect(() => encodeWords([1, 1])).toThrow()
    expect(() => encodeWords([-1])).toThrow()
    expect(() => encodeWords([1.5])).toThrow()
    expect(() => encodeWords([Number.NaN])).toThrow()
    expect(() => encodeWords([2 ** 53])).toThrow()
  })

  test('text that is not base64 is refused', () => {
    expect(() => decodeWords('A')).toThrow()
    expect(() => decodeWords('AA!A')).toThrow()
    expect(() => decodeWords('A=AA')).toThrow()
    expect(() => decodeWords('AA=A')).toThrow()
    expect(() => decodeWords('A===')).toThrow()
    expect(() => decodeWords('AAA A')).toThrow()
  })

  test('text that ends inside a number is refused', () => {
    // One byte, 0x80: its high bit says another byte follows.
    expect(() => decodeWords('gA==')).toThrow()
  })
})
