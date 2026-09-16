import { describe, expect, test } from 'bun:test'
import { semanticIdFor } from '@bt-synergy/scripture-loader'
import { batchAlignLinks } from './batchAlignLinks'
import {
  SCRIPTURE_EMPTY_REVISION,
  shouldResetTokenGroupsDedupe,
  scriptureContentRevision,
} from './scriptureReadyUnderlineRebind'
import { extractPreparedBroadcastTokens } from '../scripture/extractPreparedBroadcastTokens'
import type { ScriptureFullChapter } from '../scripture/scripturePreparer'

describe('batchAlignLinks', () => {
  test('aligns quote semantic ids against target tokens for the open chapter', () => {
    const targetTokens = [
      {
        id: 1,
        text: 'Paul',
        type: 'word' as const,
        content: 'Paul',
        occurrence: 1,
        semanticId: semanticIdFor('tit 1:1', 'Paul', 1),
        alignedOriginalWordIds: ['tit 1:1:Παῦλος:1'],
      },
    ]
    const results = batchAlignLinks({
      links: [
        {
          id: 'tn-1',
          reference: '1:1',
          origWords: 'Παῦλος',
          occurrence: '1',
          quoteTokens: [
            {
              id: 1,
              text: 'Παῦλος',
              type: 'word',
              content: 'Παῦλος',
              occurrence: 1,
            } as never,
          ],
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
    expect(results).toHaveLength(1)
    expect(results[0]!.alignedTokens?.some((t) => t.content === 'Paul' || t.text === 'Paul')).toBe(
      true
    )
    expect(results[0]!.quoteStatus).not.toBe('pending')
  })

  test('Hebrew UHB word-joiner quote aligns to ULT zaln without word joiner', () => {
    // UHB `\w` surface often has U+2060 between morphs; ULT `\zaln` x-content does not.
    const uhbSurface = 'לְ⁠דָ֫וִ֥ד'
    const ultZalnContent = 'לְדָ֫וִ֥ד'
    expect(uhbSurface.includes('\u2060')).toBe(true)
    expect(ultZalnContent.includes('\u2060')).toBe(false)

    const targetTokens = [
      {
        id: 1,
        text: 'David',
        type: 'word' as const,
        content: 'David',
        occurrence: 1,
        semanticId: semanticIdFor('psa 14:1', 'David', 1),
        alignedOriginalWordIds: [`psa 14:1:${ultZalnContent}:1`],
      },
    ]
    const results = batchAlignLinks({
      links: [
        {
          id: 'f0ya',
          reference: '14:1',
          origWords: uhbSurface,
          occurrence: '1',
          quoteTokens: [
            {
              id: 2,
              text: uhbSurface,
              type: 'word',
              content: uhbSurface,
              occurrence: 1,
            } as never,
          ],
        },
      ],
      targetTokens: targetTokens as never,
      bookCode: 'psa',
      currentChapter: 14,
      tokenBook: 'psa',
      tokenChapter: 14,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/twl',
      textLanguage: 'en',
    })
    expect(results[0]!.quoteStatus).toBe('aligned')
    expect(results[0]!.alignedTokens?.some((t) => t.content === 'David')).toBe(true)
  })

  test('empty tokens stay pending even when quote-build is ready', () => {
    const results = batchAlignLinks({
      links: [{ id: 'tn-1', reference: '1:1', origWords: 'Παῦλος' }],
      targetTokens: [],
      bookCode: 'tit',
      currentChapter: 1,
      tokenBook: 'tit',
      tokenChapter: 1,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: false,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/tn',
    })
    expect(results[0]!.alignedTokens).toBeUndefined()
    expect(results[0]!.quoteStatus).toBe('pending')
  })

  test('tokens without zaln ids stay pending (do not false ol-fallback)', () => {
    const results = batchAlignLinks({
      links: [
        {
          id: 'tn-1',
          reference: '1:1',
          origWords: 'Παῦλος',
          quoteTokens: [
            {
              id: 1,
              text: 'Παῦλος',
              type: 'word' as const,
              content: 'Παῦλος',
              occurrence: 1,
            },
          ],
        },
      ],
      targetTokens: [
        {
          id: 1,
          text: 'Paul',
          type: 'word' as const,
          content: 'Paul',
          occurrence: 1,
          semanticId: 'tit 1:1:Paul:1',
          alignedOriginalWordIds: [],
        },
      ] as never,
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
    expect(results[0]!.quoteStatus).toBe('pending')
  })

  test('empty tokens stay pending while quote-build is still running', () => {
    const results = batchAlignLinks({
      links: [{ id: 'tn-1', reference: '1:1', origWords: 'Παῦλος' }],
      targetTokens: [],
      bookCode: 'tit',
      currentChapter: 1,
      tokenBook: 'tit',
      tokenChapter: 1,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: false,
      quoteBuildReady: false,
      resourceKey: 'unfoldingWord/en/tn',
    })
    expect(results[0]!.quoteStatus).toBe('pending')
  })

  test('quoteReady false stays pending and never paints ol-fallback', () => {
    const targetTokens = [
      {
        id: 1,
        text: 'Paul',
        type: 'word' as const,
        content: 'Paul',
        occurrence: 1,
        semanticId: semanticIdFor('tit 1:1', 'Paul', 1),
        alignedOriginalWordIds: ['tit 1:1:Παῦλος:1'],
      },
    ]
    const results = batchAlignLinks({
      links: [
        {
          id: 'deferred',
          reference: '1:1',
          origWords: 'Παῦλος',
          occurrence: '1',
          quoteReady: false,
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
    expect(results[0]!.alignedTokens).toBeUndefined()
    expect(results[0]!.quoteStatus).toBe('pending')
    expect(results[0]!.quoteStatus).not.toBe('ol-fallback')
  })

  test('verse-range broadcast aligns only links inside the token verse span', () => {
    const targetTokens = [
      {
        id: 1,
        text: 'overseer',
        type: 'word' as const,
        content: 'overseer',
        occurrence: 1,
        semanticId: semanticIdFor('tit 1:7', 'overseer', 1),
        alignedOriginalWordIds: ['tit 1:7:ἐπίσκοπον:1'],
      },
    ]
    const results = batchAlignLinks({
      links: [
        {
          id: 'in-range',
          reference: '1:7',
          origWords: 'ἐπίσκοπον',
          occurrence: '1',
          quoteTokens: [
            {
              id: 1,
              text: 'ἐπίσκοπον',
              type: 'word',
              content: 'ἐπίσκοπον',
              occurrence: 1,
            } as never,
          ],
        },
        {
          id: 'out-of-range',
          reference: '1:1',
          origWords: 'Παῦλος',
          occurrence: '1',
        },
      ],
      targetTokens: targetTokens as never,
      bookCode: 'tit',
      currentChapter: 1,
      endChapter: 1,
      tokenBook: 'tit',
      tokenChapter: 1,
      tokenEndChapter: 1,
      tokenStartVerse: 7,
      tokenEndVerse: 8,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/tn',
      textLanguage: 'en',
    })
    expect(results.find((r) => r.id === 'in-range')!.alignedTokens?.length).toBeGreaterThan(0)
    expect(results.find((r) => r.id === 'out-of-range')!.alignedTokens).toBeUndefined()
  })

  test('multi-chapter passage aligns links in either chapter', () => {
    const targetTokens = [
      {
        id: 1,
        text: 'Paul',
        type: 'word' as const,
        content: 'Paul',
        occurrence: 1,
        semanticId: semanticIdFor('tit 1:1', 'Paul', 1),
        alignedOriginalWordIds: ['tit 1:1:Παῦλος:1'],
      },
      {
        id: 2,
        text: 'older',
        type: 'word' as const,
        content: 'older',
        occurrence: 1,
        semanticId: semanticIdFor('tit 2:2', 'older', 1),
        alignedOriginalWordIds: ['tit 2:2:πρεσβύτας:1'],
      },
    ]
    const results = batchAlignLinks({
      links: [
        {
          id: 'ch1',
          reference: '1:1',
          origWords: 'Παῦλος',
          occurrence: '1',
          quoteTokens: [
            { id: 1, text: 'Παῦλος', type: 'word', content: 'Παῦλος', occurrence: 1 } as never,
          ],
        },
        {
          id: 'ch2',
          reference: '2:2',
          origWords: 'πρεσβύτας',
          occurrence: '1',
          quoteTokens: [
            { id: 1, text: 'πρεσβύτας', type: 'word', content: 'πρεσβύτας', occurrence: 1 } as never,
          ],
        },
      ],
      targetTokens: targetTokens as never,
      bookCode: 'tit',
      currentChapter: 1,
      endChapter: 2,
      tokenBook: 'tit',
      tokenChapter: 1,
      tokenEndChapter: 2,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/tn',
      textLanguage: 'en',
    })
    expect(results.find((r) => r.id === 'ch1')!.alignedTokens?.length).toBeGreaterThan(0)
    expect(results.find((r) => r.id === 'ch2')!.alignedTokens?.length).toBeGreaterThan(0)
  })
})

describe('shouldResetTokenGroupsDedupe', () => {
  test('resets when leaving scripture:empty', () => {
    expect(
      shouldResetTokenGroupsDedupe({
        previousRevision: SCRIPTURE_EMPTY_REVISION,
        nextRevision: scriptureContentRevision({
          sourceResourceId: 'ult',
          book: 'tit',
          chapter: 1,
          tokenCount: 10,
        }),
      })
    ).toBe(true)
    expect(
      shouldResetTokenGroupsDedupe({
        previousRevision: 'scripture:ult:tit:1:10',
        nextRevision: 'scripture:ult:tit:1:12',
      })
    ).toBe(false)
  })
})

describe('extractPreparedBroadcastTokens → underline path', () => {
  test('prepared full chapter yields broadcast tokens with alignment ids', () => {
    const full = {
      version: 1,
      bookId: 'tit',
      unit: 1,
      matchKeys: ['tit 1:1:Παῦλος:1'],
      blocks: [
        {
          type: 'p',
          inline: [
            { kind: 'verse', verseNumber: 1 },
            {
              kind: 'token',
              token: { c: 'Paul', o: 1, a: [0] },
            },
          ],
        },
      ],
    } as unknown as ScriptureFullChapter

    const tokens = extractPreparedBroadcastTokens('tit', 1, full, 1, 999)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.text).toBe('Paul')
    expect(tokens[0]!.alignedOriginalWordIds).toContain('tit 1:1:Παῦλος:1')

    const aligned = batchAlignLinks({
      links: [
        {
          id: 'tn-1',
          reference: '1:1',
          origWords: 'Παῦλος',
          occurrence: '1',
          quoteTokens: [
            {
              id: 1,
              text: 'Παῦλος',
              type: 'word',
              content: 'Παῦλος',
              occurrence: 1,
            } as never,
          ],
        },
      ],
      targetTokens: tokens as never,
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
    expect(aligned[0]!.alignedTokens?.length).toBeGreaterThan(0)
  })
})
