import { describe, expect, test } from 'bun:test'
import { strongCodesOf } from './strongCode'

describe('the lexicon codes of an original word', () => {
  test('a UGNT number loses its last digit, with no padding', () => {
    expect(strongCodesOf('G54850')).toEqual(['G5485'])
    expect(strongCodesOf('G39720')).toEqual(['G3972'])
    // About 210 NT words end in another digit; they still join their lexicon entry.
    expect(strongCodesOf('G52281')).toEqual(['G5228'])
  })

  test('a Hebrew number is padded to four digits and keeps its letter', () => {
    expect(strongCodesOf('H853')).toEqual(['H0853'])
    expect(strongCodesOf('H0853')).toEqual(['H0853'])
    expect(strongCodesOf('H1121a')).toEqual(['H1121a'])
  })

  test('particle prefixes are dropped', () => {
    expect(strongCodesOf('c:d:H0776')).toEqual(['H0776'])
    expect(strongCodesOf('b:H7225')).toEqual(['H7225'])
  })

  test('a part of no known shape gives no code', () => {
    expect(strongCodesOf('b')).toEqual([])
    expect(strongCodesOf('c:d')).toEqual([])
    expect(strongCodesOf('')).toEqual([])
    expect(strongCodesOf(undefined)).toEqual([])
    expect(strongCodesOf('H0')).toEqual([])
    expect(strongCodesOf('G5')).toEqual([])
  })

  test('each code is given once', () => {
    expect(strongCodesOf('H3068:H3068')).toEqual(['H3068'])
    expect(strongCodesOf('H853:H0853')).toEqual(['H0853'])
    expect(strongCodesOf('c:H1121:H0853')).toEqual(['H1121', 'H0853'])
  })
})
