import { describe, expect, test } from 'bun:test'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { resolveQuoteSemanticIds } from './resolveQuoteSemanticIds'

const greekToken = (text: string): OptimizedToken => ({
  id: 1,
  text,
  type: 'word',
  occurrence: 1,
})

describe('resolveQuoteSemanticIds', () => {
  test('returns cached semanticIds when present', () => {
    expect(
      resolveQuoteSemanticIds(
        {
          semanticIds: ['JHN 3:16:θεός:1'],
          quoteTokens: [greekToken('θεός')],
        },
        'jhn',
        3,
        16
      )
    ).toEqual(['JHN 3:16:θεός:1'])
  })

  test('returns empty when no cache and no tokens', () => {
    expect(resolveQuoteSemanticIds({}, 'jhn', 3, 16)).toEqual([])
  })

  test('regenerates from quoteTokens when semanticIds cache is missing', () => {
    expect(
      resolveQuoteSemanticIds(
        {
          quoteTokens: [greekToken('Θεοῦ')],
          occurrence: '1',
        },
        'tit',
        1,
        1
      )
    ).toEqual(['tit 1:1:Θεοῦ:1'])
  })

  test('regeneration honors occurrence from the item', () => {
    expect(
      resolveQuoteSemanticIds(
        {
          quoteTokens: [greekToken('Θεοῦ')],
          occurrence: 2,
        },
        'TIT',
        1,
        1
      )
    ).toEqual(['tit 1:1:Θεοῦ:2'])
  })

  test('empty semanticIds array falls through to regeneration', () => {
    expect(
      resolveQuoteSemanticIds(
        {
          semanticIds: [],
          quoteTokens: [greekToken('Θεοῦ')],
          occurrence: '1',
        },
        'tit',
        1,
        1
      )
    ).toEqual(['tit 1:1:Θεοῦ:1'])
  })

  test('falls back to alignedTokens when quoteTokens are missing', () => {
    expect(
      resolveQuoteSemanticIds(
        {
          alignedTokens: [{ semanticId: 'tit 1:1:Paul:1', type: 'word' }],
        },
        'tit',
        1,
        1
      )
    ).toEqual(['tit 1:1:Paul:1'])
  })
})
