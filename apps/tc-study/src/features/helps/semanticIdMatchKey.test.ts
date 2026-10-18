import { describe, expect, test } from 'bun:test'
import { foldedMatchKey, semanticIdMatchKey } from './semanticIdMatchKey'

describe('semanticIdMatchKey', () => {
  test('keeps a word as written: two words that differ only by their accents are two words', () => {
    // Jonah 1:3: Door43 counts each as the first of its kind (x-occurrence 1 of 1).
    const etnahta = 'jon 1:3:יְהוָ֑ה:1'
    const silluq = 'jon 1:3:יְהוָֽה:1'
    expect(semanticIdMatchKey(etnahta)).not.toBe(semanticIdMatchKey(silluq))
    expect(semanticIdMatchKey('tit 3:12:πρὸς:1')).not.toBe(semanticIdMatchKey('tit 3:12:πρός:1'))
  })

  test('UHB word-joiner morphs match ULT zaln without word joiner', () => {
    const uhb = 'psa 14:1:לְ⁠דָ֫וִ֥ד:1' // U+2060 between ל and ד
    const ultZaln = 'psa 14:1:לְדָ֫וִ֥ד:1'
    expect(uhb.includes('⁠')).toBe(true)
    expect(ultZaln.includes('⁠')).toBe(false)
    expect(semanticIdMatchKey(uhb)).toBe(semanticIdMatchKey(ultZaln))
  })

  test('the same written word in another Unicode order is the same word', () => {
    const decomposed = 'tit 1:1:παῦλος:1'.normalize('NFD')
    expect(semanticIdMatchKey(decomposed)).toBe(semanticIdMatchKey('tit 1:1:παῦλος:1'))
  })

  test('Greek case-folds without changing letters', () => {
    expect(semanticIdMatchKey('tit 1:1:Παῦλος:1')).toBe(
      semanticIdMatchKey('tit 1:1:παῦλος:1')
    )
  })
})

describe('foldedMatchKey', () => {
  test('folds pointed Hebrew to consonants, only to find a word written another way', () => {
    expect(foldedMatchKey('psa 14:1:לְ⁠דָ֫וִ֥ד:1')).toBe('psa 14:1:לדוד:1')
  })
})
