import { describe, expect, test } from 'bun:test'
import { semanticIdFor } from '@bt-synergy/scripture-loader'
import { batchAlignLinks } from './batchAlignLinks'
import {
  compactAlignRow,
  compactFromAlignResult,
  reconstructAlignFromPositions,
} from './reconstructAlignFromPositions'
import { generateSemanticIdsForQuoteTokens } from './quoteTokens'

const targetTokens = [
  {
    id: 0,
    text: 'Paul',
    type: 'word' as const,
    content: 'Paul',
    occurrence: 1,
    semanticId: semanticIdFor('tit 1:1', 'Paul', 1),
    alignedOriginalWordIds: ['tit 1:1:Παῦλος:1'],
  },
  {
    id: 1,
    text: ',',
    type: 'punctuation' as const,
    content: ',',
    occurrence: 1,
  },
  {
    id: 2,
    text: 'a',
    type: 'word' as const,
    content: 'a',
    occurrence: 1,
    semanticId: semanticIdFor('tit 1:1', 'a', 1),
    alignedOriginalWordIds: [],
  },
]

const quoteTokens = [
  {
    id: 1,
    text: 'Παῦλος',
    type: 'word' as const,
    content: 'Παῦλος',
    occurrence: 1,
  },
]

describe('reconstructAlignFromPositions', () => {
  test('compact → reconstruct matches live id-match align', () => {
    const live = batchAlignLinks({
      links: [
        {
          id: 'tn-1',
          reference: '1:1',
          origWords: 'Παῦλος',
          occurrence: '1',
          quoteTokens: quoteTokens as never,
        },
      ],
      targetTokens: targetTokens as never,
      bookCode: 'tit',
      currentChapter: 1,
      tokenBook: 'tit',
      tokenChapter: 1,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/tn',
      textLanguage: 'en',
    })
    const liveResult = live[0]!
    expect(liveResult.alignedTokens?.length).toBeGreaterThan(0)

    const row = compactFromAlignResult({
      alignedTokens: liveResult.alignedTokens,
      quoteTokens: quoteTokens as never,
      bookCode: 'tit',
      chapter: 1,
      verse: 1,
      occurrence: '1',
    })
    expect(row.m).toBe(1)
    expect(row.p.length).toBeGreaterThan(0)

    const reconstructed = reconstructAlignFromPositions({
      targetTokens: targetTokens as never,
      quoteTokens: quoteTokens as never,
      origWords: 'Παῦλος',
      occurrence: '1',
      bookCode: 'tit',
      chapter: 1,
      verse: 1,
      row,
    })

    expect(reconstructed.alignedTokens?.map((t) => t.position)).toEqual(
      liveResult.alignedTokens?.map((t) => t.position)
    )
    expect(reconstructed.alignedTokens?.map((t) => t.content)).toEqual(
      liveResult.alignedTokens?.map((t) => t.content)
    )
    expect(reconstructed.semanticIds).toEqual(liveResult.semanticIds)
    expect(reconstructed.quoteStatus).not.toBe('pending')
  })

  test('settled miss reconstructs without aligned tokens', () => {
    const row = compactAlignRow({ alignedTokens: undefined, method: 0 })
    expect(row).toEqual({ p: [], m: 0 })
    const reconstructed = reconstructAlignFromPositions({
      targetTokens: targetTokens as never,
      quoteTokens: quoteTokens as never,
      origWords: 'Παῦλος',
      occurrence: '1',
      bookCode: 'tit',
      chapter: 1,
      verse: 1,
      row,
    })
    expect(reconstructed.alignedTokens).toBeUndefined()
    expect(reconstructed.semanticIds).toEqual(
      generateSemanticIdsForQuoteTokens(quoteTokens as never, 'tit', 1, 1, 1)
    )
    expect(reconstructed.quoteStatus).toBe('ol-fallback')
  })

  test('stores display texts so refresh can paint without target tokens', () => {
    const row = compactAlignRow({
      alignedTokens: [
        {
          content: 'Paul',
          semanticId: semanticIdFor('tit 1:1', 'Paul', 1),
          verseRef: 'tit 1:1',
          position: 0,
          type: 'word',
        },
      ],
      method: 1,
    })
    expect(row.t).toEqual(['Paul'])
    const painted = reconstructAlignFromPositions({
      targetTokens: [],
      quoteTokens: quoteTokens as never,
      origWords: 'Παῦλος',
      occurrence: '1',
      bookCode: 'tit',
      chapter: 1,
      verse: 1,
      row,
    })
    expect(painted.alignedTokens?.[0]?.content).toBe('Paul')
    expect(painted.quoteStatus).toBe('aligned')
  })

  test('text-fallback method stores m=2 and rebuilds chip tokens', () => {
    const enTokens = [
      {
        id: 0,
        text: 'faithful',
        type: 'word' as const,
        content: 'faithful',
        occurrence: 1,
        semanticId: semanticIdFor('tit 1:9', 'faithful', 1),
      },
    ]
    const row = compactAlignRow({
      alignedTokens: [
        {
          content: 'faithful',
          semanticId: semanticIdFor('tit 1:9', 'faithful', 1),
          verseRef: 'tit 1:9',
          position: 0,
          type: 'word',
        },
      ],
      method: 2,
    })
    expect(row.m).toBe(2)
    const reconstructed = reconstructAlignFromPositions({
      targetTokens: enTokens as never,
      quoteTokens: undefined,
      origWords: 'faithful',
      occurrence: '1',
      bookCode: 'tit',
      chapter: 1,
      verse: 9,
      row,
    })
    expect(reconstructed.alignedTokens?.[0]?.content).toBe('faithful')
    expect(reconstructed.semanticIds?.[0]).toBe(semanticIdFor('tit 1:9', 'faithful', 1))
  })
})
