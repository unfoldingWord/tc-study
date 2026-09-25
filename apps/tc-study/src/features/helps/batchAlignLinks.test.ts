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

  test('5:front TWL aligns heading tokens extracted before \\v 1', () => {
    const full = {
      version: 1,
      unit: 5,
      matchKeys: ['psa 5:1:מזמור:1', 'psa 5:1:לדוד:1', 'psa 5:1:אמרי:1'],
      blocks: [
        {
          marker: 'd',
          role: 'heading',
          indentLevel: 0,
          chapterNumber: 5,
          verseNumbers: [1],
          inline: [
            { kind: 'token', token: { c: 'psalm', o: 1, k: 0, a: [0] } },
            { kind: 'token', token: { c: 'of', o: 1, k: 1, a: [1] } },
            { kind: 'token', token: { c: 'David', o: 1, k: 1, a: [1] } },
          ],
        },
        {
          marker: 'q1',
          role: 'para',
          indentLevel: 0,
          chapterNumber: 5,
          verseNumbers: [1],
          inline: [
            { kind: 'verse', chapterNumber: 5, verseNumber: 1 },
            { kind: 'token', token: { c: 'To', o: 1, k: 2, a: [2] } },
          ],
        },
      ],
    } as unknown as ScriptureFullChapter

    const targetTokens = extractPreparedBroadcastTokens('psa', 5, full, 1, 999)
    expect(targetTokens.map((t) => t.text)).toEqual(['psalm', 'of', 'David', 'To'])

    const results = batchAlignLinks({
      links: [
        {
          id: 'kjx7',
          reference: '5:front',
          origWords: 'מִזְמ֥וֹר',
          occurrence: '1',
          quoteTokens: [
            {
              id: 4,
              text: 'מִזְמ֥וֹר',
              type: 'word',
              content: 'מִזְמ֥וֹר',
              occurrence: 1,
              chapter: 5,
              verse: 1,
            } as never,
          ],
        },
      ],
      targetTokens: targetTokens as never,
      bookCode: 'psa',
      currentChapter: 5,
      tokenBook: 'psa',
      tokenChapter: 5,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/twl',
      textLanguage: 'en',
    })
    expect(results[0]!.quoteStatus).toBe('aligned')
    expect(results[0]!.alignedTokens?.some((t) => t.content === 'psalm')).toBe(true)
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

  test('aligns merged-stream hits across listed verses (sbh4)', () => {
    const yahweh = 'יְהוָה'
    const verses = [1, 3, 8, 12]
    const targetTokens = verses.flatMap((verse, i) => [
      {
        id: i + 1,
        text: 'Yahweh',
        type: 'word' as const,
        content: 'Yahweh',
        occurrence: 1,
        verseRef: `psa 5:${verse}`,
        semanticId: semanticIdFor(`psa 5:${verse}`, 'Yahweh', 1),
        alignedOriginalWordIds: [`psa 5:${verse}:${yahweh}:1`],
      },
    ])
    const results = batchAlignLinks({
      links: [
        {
          id: 'tn-sbh4',
          reference: '5:1,3,8,12',
          origWords: `${yahweh} & ${yahweh} & ${yahweh} & ${yahweh}`,
          occurrence: '1',
          quoteTokens: verses.map((verse, i) => ({
            id: i + 1,
            text: yahweh,
            type: 'word',
            content: yahweh,
            occurrence: 1,
            chapter: 5,
            verse,
          })) as never,
        },
      ],
      targetTokens: targetTokens as never,
      bookCode: 'psa',
      currentChapter: 5,
      tokenBook: 'psa',
      tokenChapter: 5,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/tn',
      textLanguage: 'en',
    })
    const words = (results[0]!.alignedTokens ?? []).filter((t) => t.type === 'word')
    expect(words.map((t) => t.content)).toEqual(['Yahweh', 'Yahweh', 'Yahweh', 'Yahweh'])
    expect(words.map((t) => t.verseRef)).toEqual([
      'psa 5:1',
      'psa 5:3',
      'psa 5:8',
      'psa 5:12',
    ])
    expect(results[0]!.alignedTokens?.some((t) => t.type === 'gap' && t.content === '…')).toBe(true)
    expect(results[0]!.quoteStatus).toBe('aligned')
  })

  test('clone-safe quote tokens without verse stamps only hit the first verse', () => {
    const yahweh = 'יְהוָה'
    const verses = [1, 3, 8, 12]
    const targetTokens = verses.flatMap((verse, i) => [
      {
        id: i + 1,
        text: 'Yahweh',
        type: 'word' as const,
        content: 'Yahweh',
        occurrence: 1,
        verseRef: `psa 5:${verse}`,
        semanticId: semanticIdFor(`psa 5:${verse}`, 'Yahweh', 1),
        alignedOriginalWordIds: [`psa 5:${verse}:${yahweh}:1`],
      },
    ])
    const results = batchAlignLinks({
      links: [
        {
          id: 'tn-sbh4-stripped',
          reference: '5:1,3,8,12',
          origWords: `${yahweh} & ${yahweh} & ${yahweh} & ${yahweh}`,
          occurrence: '1',
          quoteTokens: verses.map((_verse, i) => ({
            id: i + 1,
            text: yahweh,
            type: 'word',
            content: yahweh,
            occurrence: 1,
          })) as never,
        },
      ],
      targetTokens: targetTokens as never,
      bookCode: 'psa',
      currentChapter: 5,
      tokenBook: 'psa',
      tokenChapter: 5,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/tn',
      textLanguage: 'en',
    })
    const words = (results[0]!.alignedTokens ?? []).filter((t) => t.type === 'word')
    expect(words.map((t) => t.verseRef)).toEqual(['psa 5:1'])
  })

  test('aligns svyb range hits on 5:2-3 with a single … gap', () => {
    const sound = 'לְקזוֹל'
    const voice = 'קוֹלִי'
    const targetTokens = [
      {
        id: 1,
        text: 'sound',
        type: 'word' as const,
        content: 'sound',
        occurrence: 1,
        verseRef: 'psa 5:2',
        semanticId: semanticIdFor('psa 5:2', 'sound', 1),
        alignedOriginalWordIds: [`psa 5:2:${sound}:1`],
      },
      {
        id: 2,
        text: 'voice',
        type: 'word' as const,
        content: 'voice',
        occurrence: 1,
        verseRef: 'psa 5:3',
        semanticId: semanticIdFor('psa 5:3', 'voice', 1),
        alignedOriginalWordIds: [`psa 5:3:${voice}:1`],
      },
    ]
    const results = batchAlignLinks({
      links: [
        {
          id: 'tn-svyb',
          reference: '5:2-3',
          origWords: `${sound} & ${voice}`,
          occurrence: '1',
          quoteTokens: [
            {
              id: 1,
              text: sound,
              type: 'word',
              content: sound,
              occurrence: 1,
              chapter: 5,
              verse: 2,
            },
            {
              id: 2,
              text: voice,
              type: 'word',
              content: voice,
              occurrence: 1,
              chapter: 5,
              verse: 3,
            },
          ] as never,
        },
      ],
      targetTokens: targetTokens as never,
      bookCode: 'psa',
      currentChapter: 5,
      tokenBook: 'psa',
      tokenChapter: 5,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
      hasTokens: true,
      quoteBuildReady: true,
      resourceKey: 'unfoldingWord/en/tn',
      textLanguage: 'en',
    })
    const words = (results[0]!.alignedTokens ?? []).filter((t) => t.type === 'word')
    expect(words.map((t) => t.content)).toEqual(['sound', 'voice'])
    expect(words.map((t) => t.verseRef)).toEqual(['psa 5:2', 'psa 5:3'])
    expect(results[0]!.alignedTokens?.filter((t) => t.type === 'gap').map((t) => t.content)).toEqual([
      '…',
    ])
    expect(results[0]!.quoteStatus).toBe('aligned')
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
