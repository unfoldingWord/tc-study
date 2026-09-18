import { describe, expect, test } from 'bun:test'
import { semanticIdMatchKey } from './semanticIdMatchKey'

describe('semanticIdMatchKey', () => {
  test('folds pointed Hebrew to consonants', () => {
    expect(semanticIdMatchKey('psa 14:1:לְדָ֫וִ֥ד:1')).toBe('psa 14:1:לדוד:1')
  })

  test('UHB word-joiner morphs match ULT zaln without word joiner', () => {
    const uhb = 'psa 14:1:לְ⁠דָ֫וִ֥ד:1' // U+2060 between ל and ד
    const ultZaln = 'psa 14:1:לְדָ֫וִ֥ד:1'
    expect(uhb.includes('\u2060')).toBe(true)
    expect(ultZaln.includes('\u2060')).toBe(false)
    expect(semanticIdMatchKey(uhb)).toBe(semanticIdMatchKey(ultZaln))
    expect(semanticIdMatchKey(uhb)).toBe('psa 14:1:לדוד:1')
  })

  test('Greek case-folds without changing letters', () => {
    expect(semanticIdMatchKey('tit 1:1:Παῦλος:1')).toBe(
      semanticIdMatchKey('tit 1:1:παῦλος:1')
    )
  })
})
