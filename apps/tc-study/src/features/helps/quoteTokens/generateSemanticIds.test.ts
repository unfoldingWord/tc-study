import { describe, expect, test } from 'bun:test'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { generateSemanticId, generateSemanticIdsForQuoteTokens } from './generateSemanticIds'

const token = (text: string, occurrence = 1): OptimizedToken => ({
  id: 1,
  text,
  type: 'word',
  occurrence,
})

describe('generateSemanticId', () => {
  test('uses inflected text (not lemma) in id', () => {
    expect(
      generateSemanticId({
        token: { ...token('Θεοῦ'), lemma: 'θεός' },
        verseRef: 'tit 1:1',
        occurrence: 2,
      })
    ).toBe('tit 1:1:Θεοῦ:2')
  })
})

describe('generateSemanticIdsForQuoteTokens', () => {
  test('single-token quote uses baseOccurrence from TWL', () => {
    expect(
      generateSemanticIdsForQuoteTokens([token('Θεοῦ')], 'TIT', 1, 1, 2)
    ).toEqual(['tit 1:1:Θεοῦ:2'])
  })

  test('multi-token quote uses each token occurrence', () => {
    const tokens = [token('Παῦλος', 1), token('δοῦλος', 1)]
    expect(generateSemanticIdsForQuoteTokens(tokens, 'tit', 1, 1)).toEqual([
      'tit 1:1:Παῦλος:1',
      'tit 1:1:δοῦλος:1',
    ])
  })

  test('lowercases book code to match scripture viewer ids', () => {
    expect(generateSemanticIdsForQuoteTokens([token('God')], 'JHN', 3, 16, 1)).toEqual([
      'jhn 3:16:God:1',
    ])
  })

  test('stamped verse on each token wins over the fallback verse', () => {
    const tokens = [
      { ...token('יְהוָה'), chapter: 5, verse: 1 },
      { ...token('יְהוָה'), chapter: 5, verse: 3 },
      { ...token('יְהוָה'), chapter: 5, verse: 8 },
      { ...token('יְהוָה'), chapter: 5, verse: 12 },
    ]
    expect(generateSemanticIdsForQuoteTokens(tokens, 'psa', 5, 1)).toEqual([
      'psa 5:1:יְהוָה:1',
      'psa 5:3:יְהוָה:1',
      'psa 5:8:יְהוָה:1',
      'psa 5:12:יְהוָה:1',
    ])
  })
})
