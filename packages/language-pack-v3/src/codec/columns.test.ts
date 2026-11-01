import { describe, expect, test } from 'bun:test'
import {
  ColumnError,
  compareCodePoints,
  decodeBits,
  decodeDeltas,
  decodeSvarints,
  decodeTexts,
  decodeUvarints,
  encodeBits,
  encodeDeltas,
  encodeSvarints,
  encodeTexts,
  encodeUvarints,
  stringTable,
} from './columns'

const bytes = (...b: number[]) => Uint8Array.from(b)

describe('uvarints', () => {
  test('uvarints round trip', () => {
    const values = [0, 1, 127, 128, 300, 2 ** 31, 2 ** 40, 2 ** 53 - 1]
    expect(decodeUvarints(encodeUvarints(values))).toEqual(values)
  })

  test('300 is ac 02', () => {
    expect(encodeUvarints([300])).toEqual(bytes(0xac, 0x02))
  })

  test('127 and 128 straddle the one-byte limit', () => {
    expect(encodeUvarints([127])).toEqual(bytes(0x7f))
    expect(encodeUvarints([128])).toEqual(bytes(0x80, 0x01))
  })

  test('a non minimal varint throws ColumnError', () => {
    expect(() => decodeUvarints(bytes(0x80, 0x00))).toThrow(ColumnError)
  })

  test('a zero written with a trailing 80 byte is not minimal', () => {
    expect(() => decodeUvarints(bytes(0x01, 0x81, 0x80, 0x00))).toThrow(ColumnError)
  })

  test('a varint cut short throws ColumnError', () => {
    expect(() => decodeUvarints(bytes(0x80))).toThrow(ColumnError)
  })

  test('a varint longer than 8 bytes throws ColumnError', () => {
    expect(() => decodeUvarints(bytes(0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01))).toThrow(ColumnError)
  })

  test('a varint above 2^53 - 1 throws ColumnError', () => {
    // 8 bytes: 0x10 * 128 ** 7 = 2 ** 53.
    expect(() => decodeUvarints(bytes(0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10))).toThrow(ColumnError)
  })

  test('encoding a value that is not a safe unsigned integer throws ColumnError', () => {
    expect(() => encodeUvarints([-1])).toThrow(ColumnError)
    expect(() => encodeUvarints([1.5])).toThrow(ColumnError)
    expect(() => encodeUvarints([2 ** 53])).toThrow(ColumnError)
    expect(() => encodeUvarints([Number.NaN])).toThrow(ColumnError)
  })

  test('accepts any iterable', () => {
    expect(encodeUvarints(new Set([1, 2, 3]))).toEqual(bytes(1, 2, 3))
  })
})

describe('svarints', () => {
  test('svarints maps [0, -1, 1, -2] to uvarints [0, 1, 2, 3]', () => {
    expect(encodeSvarints([0, -1, 1, -2])).toEqual(encodeUvarints([0, 1, 2, 3]))
  })

  test('svarints round trip, large values included', () => {
    const values = [0, -1, 1, -2, 2 ** 31, -(2 ** 31), 2 ** 40, -(2 ** 40), 2 ** 51, -(2 ** 51)]
    expect(decodeSvarints(encodeSvarints(values))).toEqual(values)
  })

  test('negative zero is zero', () => {
    expect(encodeSvarints([-0])).toEqual(bytes(0))
  })

  test('the zigzag range ends at -2^52 and 2^52 - 1', () => {
    const edges = [2 ** 52 - 1, -(2 ** 52)]
    expect(decodeSvarints(encodeSvarints(edges))).toEqual(edges)
    expect(() => encodeSvarints([2 ** 52])).toThrow(ColumnError)
    expect(() => encodeSvarints([-(2 ** 52) - 1])).toThrow(ColumnError)
    expect(() => encodeSvarints([0.5])).toThrow(ColumnError)
  })
})

describe('deltas', () => {
  test('deltas of verse ids round trip', () => {
    const values = [56001001, 56001003, 56001002]
    expect(decodeDeltas(encodeDeltas(values))).toEqual(values)
  })

  test('deltas are svarints of each value minus the previous one', () => {
    expect(encodeDeltas([56001001, 56001003, 56001002])).toEqual(encodeSvarints([56001001, 2, -1]))
  })

  test('deltas of nothing is nothing', () => {
    expect(encodeDeltas([])).toEqual(new Uint8Array(0))
    expect(decodeDeltas(new Uint8Array(0))).toEqual([])
  })

  test('deltas survive values above 2^31', () => {
    const values = [2 ** 40, 2 ** 40 + 5, 2 ** 51, 0]
    expect(decodeDeltas(encodeDeltas(values))).toEqual(values)
  })

  test('deltas throw ColumnError on a value that is not a safe integer', () => {
    expect(() => encodeDeltas([0.5, 1.5])).toThrow(ColumnError)
  })

  test('decodeDeltas throws ColumnError when the running value leaves the safe range', () => {
    expect(() => decodeDeltas(encodeSvarints([2 ** 52 - 1, 2 ** 52 - 1, 2 ** 52 - 1]))).toThrow(ColumnError)
  })
})

describe('bits', () => {
  const flags = [true, false, true, true, false, false, false, false, true]

  test('bits is least significant first', () => {
    expect(encodeBits(flags)).toEqual(bytes(0x0d, 0x01))
  })

  test('bits round trip', () => {
    expect(decodeBits(encodeBits(flags), flags.length)).toEqual(flags)
  })

  test('unused bits are 0 and the length is ceil(n / 8)', () => {
    expect(encodeBits([true]).length).toBe(1)
    expect(encodeBits(new Array(8).fill(true))).toEqual(bytes(0xff))
    expect(encodeBits(new Array(9).fill(true))).toEqual(bytes(0xff, 0x01))
    expect(encodeBits([])).toEqual(new Uint8Array(0))
  })

  test('decodeBits throws ColumnError when the byte string has the wrong length', () => {
    expect(() => decodeBits(bytes(0x0d), 9)).toThrow(ColumnError)
    expect(() => decodeBits(bytes(0x0d, 0x01), 8)).toThrow(ColumnError)
  })

  test('decodeBits throws ColumnError when an unused bit is set', () => {
    expect(() => decodeBits(bytes(0x0d, 0x03), 9)).toThrow(ColumnError)
  })
})

describe('texts', () => {
  const strings = ['', 'Pablo', 'ἀνέγκλητος']
  const enc = new TextEncoder()

  test('texts round-trips', () => {
    expect(decodeTexts(encodeTexts(strings))).toEqual(strings)
  })

  test('texts joins the strings in UTF-8 and counts bytes', () => {
    const t = encodeTexts(strings)
    const lengths = strings.map((s) => enc.encode(s).length)
    expect(lengths).toEqual([0, 5, 21])
    expect(t.len).toEqual(encodeUvarints(lengths))
    expect(t.utf8).toEqual(enc.encode(strings.join('')))
  })

  test('texts keeps text as published, with no normalization', () => {
    // "é" as e + U+0301 stays two code points.
    const decomposed = ['é', ' padded ']
    expect(decodeTexts(encodeTexts(decomposed))).toEqual(decomposed)
    expect(encodeTexts(decomposed).utf8).toEqual(enc.encode('é padded '))
  })

  test('texts keeps a leading byte order mark', () => {
    const withBom = ['﻿abc']
    expect(decodeTexts(encodeTexts(withBom))).toEqual(withBom)
  })

  test('texts keeps characters outside the BMP', () => {
    const astral = ['\u{1D538}x', '\u{10FFFF}']
    expect(decodeTexts(encodeTexts(astral))).toEqual(astral)
  })

  test('encodeTexts throws ColumnError on a lone surrogate', () => {
    expect(() => encodeTexts(['a\uD800'])).toThrow(ColumnError)
    expect(() => encodeTexts(['\uDC00b'])).toThrow(ColumnError)
    expect(() => encodeTexts(['\uD800x'])).toThrow(ColumnError)
  })

  test('texts of nothing is nothing', () => {
    const t = encodeTexts([])
    expect(t.utf8.length).toBe(0)
    expect(t.len.length).toBe(0)
    expect(decodeTexts(t)).toEqual([])
  })

  test('decodeTexts throws ColumnError when len does not add up to utf8', () => {
    expect(() => decodeTexts({ utf8: enc.encode('abc'), len: encodeUvarints([2]) })).toThrow(ColumnError)
    expect(() => decodeTexts({ utf8: enc.encode('abc'), len: encodeUvarints([4]) })).toThrow(ColumnError)
  })

  test('decodeTexts throws ColumnError on invalid UTF-8', () => {
    expect(() => decodeTexts({ utf8: bytes(0xff, 0xfe), len: encodeUvarints([2]) })).toThrow(ColumnError)
  })

  test('decodeTexts throws ColumnError when a string cuts a character in two', () => {
    const utf8 = enc.encode('é') // c3 a9
    expect(() => decodeTexts({ utf8, len: encodeUvarints([1, 1]) })).toThrow(ColumnError)
  })
})

describe('string tables', () => {
  test('stringTable sorts by code point, not by UTF-16 code unit', () => {
    const { list, index } = stringTable(['b', 'a', 'b', '\u{1D538}', '￿'])
    expect(list).toEqual(['b', 'a', '￿', '\u{1D538}'])
    expect(index.get('b')).toBe(0)
    expect(index.get('\u{1D538}')).toBe(3)
    expect(index.size).toBe(4)
  })

  test('stringTable puts the most used first and breaks ties by code point', () => {
    const { list } = stringTable(['z', 'z', 'a', 'm', 'm', 'b'])
    expect(list).toEqual(['m', 'z', 'a', 'b'])
  })

  test('stringTable accepts any iterable and an empty one', () => {
    expect(stringTable(new Set(['y', 'x'])).list).toEqual(['x', 'y'])
    expect(stringTable([]).list).toEqual([])
  })

  test('compareCodePoints orders by code point', () => {
    expect(compareCodePoints('￿', '\u{1D538}')).toBeLessThan(0)
    expect(compareCodePoints('\u{1D538}', '￿')).toBeGreaterThan(0)
    expect(compareCodePoints('a', 'a')).toBe(0)
    expect(compareCodePoints('a', 'ab')).toBeLessThan(0)
    expect(compareCodePoints('ab', 'a')).toBeGreaterThan(0)
    expect(compareCodePoints('', 'a')).toBeLessThan(0)
  })
})
