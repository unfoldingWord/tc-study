import { describe, expect, test } from 'bun:test'
import {
  cachedQuoteTokensToOptimized,
  enrichmentFromCachedQuotes,
  isSupportRefQuoteChipPending,
  isSupportRefPrepareJobFor,
  isSupportRefWarmJobFor,
  paintSupportRefQuoteEnrichment,
  planSupportRefQuoteWarmJobs,
  supportRefQuoteChipKind,
  supportRefWarmJobChapter,
} from './supportRefQuotePaint'

describe('cachedQuoteTokensToOptimized', () => {
  test('keeps stamped chapter/verse so align can paint every listed verse', () => {
    const tokens = cachedQuoteTokensToOptimized([
      { id: 1, text: 'יְהוָה', type: 'word', occurrence: 1, content: 'יְהוָה', chapter: 5, verse: 1 },
      { id: 2, text: 'יְהוָה', type: 'word', occurrence: 1, content: 'יְהוָה', chapter: 5, verse: 12 },
    ])
    expect(tokens.map((t) => (t as { verse?: number }).verse)).toEqual([1, 12])
  })
})

describe('paintSupportRefQuoteEnrichment', () => {
  test('quote-cache first paint stays ol-fallback without batchAlign', () => {
    const notes = [
      { id: 'psa-1', quote: 'like a tree' },
      { id: 'psa-1b', quote: '' },
    ]
    const hits = new Map([
      ['psa-1', [{ id: 1, text: 'כְּעֵץ', type: 'word', occurrence: 1, content: 'כְּעֵץ' }]],
    ])
    const painted = enrichmentFromCachedQuotes(notes, hits)
    expect(painted.get('psa-1')?.quoteStatus).toBe('ol-fallback')
    expect(painted.get('psa-1')?.quoteWarmPending).toBeUndefined()
    expect(painted.get('psa-1')?.quoteTokens?.[0]?.text).toBe('כְּעֵץ')
    expect(painted.get('psa-1b')?.quoteStatus).toBe('none')
  })

  test('missing align cache + quote marks warm pending, not a settled miss', () => {
    const painted = paintSupportRefQuoteEnrichment({
      notes: [{ id: 'psa-18', quote: 'וְהוֹד וְהָדָר תְּעַטֶּה' }],
      quoteHits: new Map(),
      reconstructedById: new Map(),
      alignCacheKnown: false,
      warmInFlight: true,
    })
    expect(painted.get('psa-18')?.quoteStatus).toBe('ol-fallback')
    expect(painted.get('psa-18')?.quoteWarmPending).toBe(true)
    expect(painted.get('psa-18')?.alignedTokens).toBeUndefined()
  })

  test('reconstructed ULT tokens upgrade the card to aligned', () => {
    const painted = paintSupportRefQuoteEnrichment({
      notes: [{ id: 'psa-18', quote: 'וְהוֹד וְהָדָר תְּעַטֶּה' }],
      quoteHits: new Map([
        ['psa-18', [{ id: 1, text: 'והוד', type: 'word', occurrence: 1, content: 'והוד' }]],
      ]),
      reconstructedById: new Map([
        [
          'psa-18',
          {
            alignedTokens: [{ position: 4, content: 'majesty' }],
            semanticIds: ['psa 18:1:majesty:1'],
          },
        ],
      ]),
      alignCacheKnown: true,
      warmInFlight: false,
    })
    expect(painted.get('psa-18')?.quoteStatus).toBe('aligned')
    expect(painted.get('psa-18')?.quoteWarmPending).toBeUndefined()
    expect(painted.get('psa-18')?.alignedTokens?.[0]?.content).toBe('majesty')
  })

  test('align cache settled miss drops the pending icon', () => {
    const painted = paintSupportRefQuoteEnrichment({
      notes: [{ id: 'psa-18', quote: 'x' }],
      quoteHits: new Map(),
      reconstructedById: new Map([['psa-18', { alignedTokens: undefined, semanticIds: [] }]]),
      alignCacheKnown: true,
      warmInFlight: false,
    })
    expect(painted.get('psa-18')?.quoteStatus).toBe('ol-fallback')
    expect(painted.get('psa-18')?.quoteWarmPending).toBeUndefined()
  })

  test('align miss not listed in reconstructed still settles when cache is known', () => {
    const painted = paintSupportRefQuoteEnrichment({
      notes: [{ id: 'twl-e1n9', quote: 'הִֽשְׁחִ֗יתוּ' }],
      quoteHits: new Map([
        [
          'twl-e1n9',
          [{ id: 1, text: 'הִשְׁחִיתוּ', type: 'word', occurrence: 1, content: 'הִשְׁחִיתוּ' }],
        ],
      ]),
      reconstructedById: new Map(),
      alignCacheKnown: true,
      warmInFlight: false,
    })
    expect(painted.get('twl-e1n9')?.quoteStatus).toBe('ol-fallback')
    expect(painted.get('twl-e1n9')?.quoteWarmPending).toBeUndefined()
    expect(painted.get('twl-e1n9')?.quoteTokens?.[0]?.text).toBe('הִשְׁחִיתוּ')
  })
})

describe('supportRefQuoteChipKind', () => {
  test('pending vs ready', () => {
    expect(
      isSupportRefQuoteChipPending({
        hasAlignedTokens: true,
        quoteWarmPending: true,
        quoteStatus: 'aligned',
      })
    ).toBe(false)
    expect(
      isSupportRefQuoteChipPending({
        hasAlignedTokens: false,
        quoteWarmPending: true,
        quoteStatus: 'ol-fallback',
      })
    ).toBe(true)
    expect(
      supportRefQuoteChipKind({
        hasAlignedTokens: false,
        quoteStatus: 'ol-fallback',
        olQuote: 'וְהוֹד',
        quoteWarmPending: true,
      })
    ).toBe('ol-pending')
    expect(
      supportRefQuoteChipKind({
        hasAlignedTokens: false,
        quoteStatus: 'ol-fallback',
        olQuote: 'וְהוֹד',
      })
    ).toBe('ol')
    expect(
      supportRefQuoteChipKind({
        hasAlignedTokens: false,
        quoteStatus: 'pending',
      })
    ).toBe('placeholder')
    expect(
      supportRefQuoteChipKind({
        hasAlignedTokens: false,
        quoteStatus: 'pending',
        olQuote: 'וְהוֹד',
      })
    ).toBe('ol-pending')
    expect(
      supportRefQuoteChipKind({
        hasAlignedTokens: true,
        quoteStatus: 'aligned',
        olQuote: 'x',
      })
    ).toBe('aligned')
  })
})

describe('planSupportRefQuoteWarmJobs', () => {
  test('missing cache enqueues quote + align on lane 2, not batchAlign', () => {
    const jobs = planSupportRefQuoteWarmJobs({
      helpsKey: 'unfoldingWord/en/tn',
      bookId: 'psa',
      languageCode: 'en',
      quoteMissChapters: [18, 19],
      alignMissChapters: [18, 19],
      helpsStamp: 'tn1',
      olKey: 'unfoldingWord/hbo/uhb',
      olStamp: 'uhb1',
      targetKey: 'unfoldingWord/en/ult',
      targetStamp: 'ult1',
      textLanguage: 'en',
    })
    expect(jobs.every((j) => j.lane === 2)).toBe(true)
    expect(jobs.map((j) => j.kind)).toEqual([
      'quote-chapter',
      'quote-chapter',
      'prepare-unit',
      'align-chapter',
      'prepare-unit',
      'align-chapter',
    ])
    expect(jobs.some((j) => j.kind === 'prepare-unit')).toBe(true)
    expect(jobs.find((j) => j.kind === 'align-chapter')?.jobKey).toBe(
      'align:unfoldingWord/en/tn:unfoldingWord/en/ult:psa:18'
    )
    expect(jobs.find((j) => j.kind === 'prepare-unit')?.jobKey).toBe(
      'prep:scripture:unfoldingWord/en/ult:psa:18'
    )
    expect(jobs.filter((j) => j.kind === 'quote-chapter' || j.kind === 'align-chapter').every((j) => 'helpsType' in j && j.helpsType === 'notes')).toBe(true)
  })

  test('TWL off-chapter miss uses words-links helpsType and the same job keys', () => {
    const jobs = planSupportRefQuoteWarmJobs({
      helpsKey: 'unfoldingWord/en/twl',
      bookId: 'psa',
      languageCode: 'en',
      quoteMissChapters: [18],
      alignMissChapters: [18],
      helpsStamp: 'twl1',
      olKey: 'unfoldingWord/hbo/uhb',
      olStamp: 'uhb1',
      targetKey: 'unfoldingWord/en/ult',
      targetStamp: 'ult1',
      textLanguage: 'en',
      helpsType: 'words-links',
    })
    expect(jobs.map((j) => j.kind)).toEqual(['quote-chapter', 'prepare-unit', 'align-chapter'])
    expect(jobs.every((j) => j.lane === 2)).toBe(true)
    expect(jobs.filter((j) => j.kind !== 'prepare-unit').every((j) => 'helpsType' in j && j.helpsType === 'words-links')).toBe(true)
    expect(jobs[0]?.jobKey).toBe('quote:unfoldingWord/en/twl:psa:18')
    expect(jobs[1]?.jobKey).toBe('prep:scripture:unfoldingWord/en/ult:psa:18')
    expect(jobs[2]?.jobKey).toBe('align:unfoldingWord/en/twl:unfoldingWord/en/ult:psa:18')
  })

  test('without target key only quote-chapter jobs are planned', () => {
    const jobs = planSupportRefQuoteWarmJobs({
      helpsKey: 'unfoldingWord/en/tn',
      bookId: 'Psa',
      languageCode: 'en',
      quoteMissChapters: [1],
      alignMissChapters: [1],
      helpsStamp: 'tn1',
      olKey: 'unfoldingWord/hbo/uhb',
      olStamp: 'uhb1',
    })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.kind).toBe('quote-chapter')
    expect(jobs[0]?.jobKey).toBe('quote:unfoldingWord/en/tn:psa:1')
  })
})

describe('support-ref warm job identity', () => {
  test('parses chapter and matches quote/align/prepare keys', () => {
    expect(supportRefWarmJobChapter('quote:unfoldingWord/en/tn:psa:18')).toBe(18)
    expect(
      isSupportRefWarmJobFor('quote:unfoldingWord/en/tn:psa:18', 'unfoldingWord/en/tn', 'PSA')
    ).toBe(true)
    expect(
      isSupportRefWarmJobFor(
        'align:unfoldingWord/en/tn:unfoldingWord/en/ult:psa:19',
        'unfoldingWord/en/tn',
        'psa'
      )
    ).toBe(true)
    expect(
      isSupportRefPrepareJobFor('prep:scripture:unfoldingWord/en/ult:psa:18', 'unfoldingWord/en/ult', 'psa')
    ).toBe(true)
    expect(isSupportRefWarmJobFor('quote:other/en/tn:psa:18', 'unfoldingWord/en/tn', 'psa')).toBe(
      false
    )
  })
})
