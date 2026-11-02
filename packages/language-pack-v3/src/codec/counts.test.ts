import { describe, expect, test } from 'bun:test'
import { bookSet } from '../ids'
import { ColumnError, encodeUvarints } from './columns'
import {
  decodeCounts,
  decodeCoverage,
  decodeVerseLists,
  encodeCounts,
  encodeCoverage,
  encodeVerseLists,
  type CountRows,
  type Coverage,
} from './counts'

const rows = (): CountRows => new Map([['G54850', new Map<string, [number, number]>([['rom', [3, 2]], ['tit', [2, 1]]])]])
const bad = (counts: number[], unit = 'occurrences', keys = ['K']) =>
  decodeCounts({ unit, keys, counts: encodeUvarints(counts) }, 'occurrences')

describe('counts', () => {
  test('encodes and round trips', () => {
    const e = encodeCounts('occurrences', rows())
    expect(e.keys).toEqual(['G54850'])
    expect(e.counts).toEqual(encodeUvarints([2, 45, 3, 2, 11, 2, 1]))
    expect(decodeCounts(e, 'occurrences')).toEqual(rows())
  })
  test('keys by code point', () => {
    const one = new Map<string, [number, number]>([['tit', [1, 1]]])
    const e = encodeCounts('notes', new Map([['\u{1D538}', one], [String.fromCodePoint(0xffff), one]]))
    expect(e.keys).toEqual([String.fromCodePoint(0xffff), '\u{1D538}'])
  })
  test('rejects bad tables', () => {
    expect(() => bad([2, 45, 1, 1, 0, 1, 1])).toThrow(ColumnError)
    expect(() => bad([1, 67, 1, 1])).toThrow(ColumnError)
    expect(() => bad([1, 45, 0, 0])).toThrow(ColumnError)
    expect(() => bad([1, 45, 2, 3])).not.toThrow() // verses above count is valid
    expect(() => bad([1, 45, 2, 0])).not.toThrow() // so is verses 0
    expect(() => bad([0])).toThrow(ColumnError)
    expect(() => bad([1, 45, 1, 1, 9])).toThrow(ColumnError)
    expect(() => bad([1, 45, 1])).toThrow(ColumnError)
    expect(() => bad([1, 45, 1, 1], 'links')).toThrow(ColumnError)
    expect(() => bad([1, 45, 1, 1, 1, 45, 1, 1], 'occurrences', ['b', 'a'])).toThrow(ColumnError)
  })
})

describe('verse lists', () => {
  test('encodes and round trips', () => {
    const lists = new Map([['G54850', [56001001, 56001004, 56002011]]])
    const e = encodeVerseLists('tit', lists)
    expect(e.keys).toEqual(['G54850'])
    expect(e.verses).toEqual(encodeUvarints([3, 1001, 3, 1007]))
    expect(decodeVerseLists('tit', e)).toEqual(lists)
    const intro = new Map([['k', [56000000]]])
    expect(decodeVerseLists('tit', encodeVerseLists('tit', intro))).toEqual(intro)
  })
  test('rejects bad tables', () => {
    const d = (nums: number[], keys = ['a']) => decodeVerseLists('tit', { keys, verses: encodeUvarints(nums) })
    expect(() => d([0])).toThrow(ColumnError)
    expect(() => d([2, 5, 0])).toThrow(ColumnError)
    expect(() => d([1, 5, 1, 5], ['b', 'a'])).toThrow(ColumnError)
    expect(() => d([1, 5, 7])).toThrow(ColumnError)
    expect(() => d([1, 1_000_000])).toThrow(ColumnError)
    expect(() => d([2, 5])).toThrow(ColumnError)
  })
})

describe('coverage', () => {
  test('encodes and round trips', () => {
    const c: Coverage = new Map([['unfoldingWord/en/tn', { whole: ['tit'], partial: [] }]])
    expect(encodeCoverage(c)).toEqual({ 'unfoldingWord/en/tn': [bookSet(['tit'])] })
    expect(decodeCoverage(encodeCoverage(c))).toEqual(c)
    const p: Coverage = new Map([['x', { whole: ['tit'], partial: ['rut'] }]])
    expect(encodeCoverage(p).x).toEqual([bookSet(['tit']), bookSet(['rut'])])
    expect(decodeCoverage(encodeCoverage(p))).toEqual(p)
  })
})

describe('fix round 1', () => {
  test('encodeCounts rejects count below 1', () => {
    const r: CountRows = new Map([['k', new Map<string, [number, number]>([['tit', [0, 0]]])]])
    expect(() => encodeCounts('notes', r)).toThrow(ColumnError)
  })
  test('multi-key round trip resets deltas per key', () => {
    const r: CountRows = new Map([
      ['a', new Map<string, [number, number]>([['gen', [1, 1]], ['rev', [5, 9]]])],
      ['b', new Map<string, [number, number]>([['mat', [2, 0]]])],
    ])
    const e = encodeCounts('links', r)
    expect(e.counts).toEqual(encodeUvarints([2, 1, 1, 1, 65, 5, 9, 1, 40, 2, 0]))
    expect(decodeCounts(e, 'links')).toEqual(r)
    const lists = new Map([['a', [56000000, 56001001]], ['b', [56001001]]])
    expect(decodeVerseLists('tit', encodeVerseLists('tit', lists))).toEqual(lists)
  })
  test('decodeCounts rejects an unknown unit and non-tables', () => {
    const t = { unit: 'words', keys: [], counts: new Uint8Array() }
    expect(() => decodeCounts(t, 'notes')).toThrow(ColumnError)
    expect(() => decodeCounts(t, 'words' as never)).not.toThrow()
    expect(() => decodeCounts(new Uint8Array(), 'notes')).toThrow(ColumnError)
  })
  test('verse lists: repeated keys, overflow', () => {
    expect(() => decodeVerseLists('tit', { keys: ['a', 'a'], verses: encodeUvarints([1, 1, 1, 1]) })).toThrow(ColumnError)
    expect(() => decodeVerseLists('tit', { keys: ['a'], verses: encodeUvarints([2, 999_999, 1]) })).toThrow(ColumnError)
    expect(() => decodeVerseLists('tit', { keys: ['a'], verses: encodeUvarints([2, 999_998, 1]) })).not.toThrow()
  })
  test('coverage rejections', () => {
    const ok = bookSet(['tit'])
    const cases: unknown[] = [
      { k: [] },
      { k: [ok, ok, ok] },
      { k: [[1, 2]] },
      { k: ['x'] },
      { k: [new Uint8Array(8)] },
      { k: [ok, new Uint8Array(10)] },
      { k: [Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 4])] },
      { k: 'x' },
      new Uint8Array(),
      [],
    ]
    for (const c of cases) expect(() => decodeCoverage(c)).toThrow(ColumnError)
  })
})
