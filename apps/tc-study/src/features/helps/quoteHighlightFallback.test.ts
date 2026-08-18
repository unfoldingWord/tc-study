/**
 * Quote/token highlight when text language ≠ helps language (Epic #21 / #24 residual).
 *
 * Frozen fixtures:
 * 1. Same-language still highlights (zaln + quote-text fallback)
 * 2. Minority text + en tN does not throw; OL bridge or clean no-op
 * 3. Reference filters still show the correct verse notes
 */
import { describe, expect, test } from 'bun:test'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { semanticIdFor } from '@bt-synergy/scripture-loader'
import { findAlignedTokens } from './findAlignedTokens'
import { findTokensByQuoteText } from './findTokensByQuoteText'
import {
  canFallbackToQuoteText,
  isOriginalLanguageCode,
  resolveAlignedQuoteTokens,
} from './resolveAlignedQuoteTokens'
import { filterNotesByReferenceRange } from './helpsDisplayFilters'
import { resolveQuoteSemanticIds } from './resolveQuoteSemanticIds'
import { generateSemanticIdsForQuoteTokens } from './quoteTokens'

type BroadcastToken = OptimizedToken & {
  semanticId?: string
  alignedOriginalWordIds?: string[]
  occurrence?: number
}

function word(
  text: string,
  opts: { semanticId?: string; aligned?: string[]; occurrence?: number } = {}
): BroadcastToken {
  const occurrence = opts.occurrence ?? 1
  return {
    id: 1,
    text,
    type: 'word',
    occurrence,
    semanticId: opts.semanticId ?? semanticIdFor('tit 1:1', text, occurrence),
    alignedOriginalWordIds: opts.aligned ?? [],
  }
}

const EN_TN_TITUS = [
  { id: 'en-tit-1-1', reference: '1:1', quote: 'Paul, a servant' },
  { id: 'en-tit-1-2', reference: '1:2', quote: 'in hope of eternal life' },
  { id: 'en-tit-2-1', reference: '2:1', quote: 'But you' },
]

describe('same-language quote highlight', () => {
  test('zaln path: Greek semantic ID underlines English Paul', () => {
    const olIds = generateSemanticIdsForQuoteTokens(
      [{ id: 1, text: 'Παῦλος', type: 'word', occurrence: 1 }],
      'tit',
      1,
      1,
      1
    )
    const tokens = [
      word('Paul', { aligned: ['tit 1:1:Παῦλος:1'] }),
      word('a'),
      word('servant'),
    ]
    const aligned = findAlignedTokens(tokens, olIds, 'tit', 1, 1)
    expect(aligned.some((t) => t.content === 'Paul')).toBe(true)
  })

  test('no zaln: English quote still matches English tokens', () => {
    const tokens = [word('Paul'), word('a'), word('servant'), word('of'), word('God')]
    const result = resolveAlignedQuoteTokens({
      targetTokens: tokens,
      originalSemanticIds: [],
      quoteText: 'Paul, a servant',
      occurrence: 1,
      bookCode: 'tit',
      chapter: 1,
      verse: 1,
      quoteLanguage: 'en',
      textLanguage: 'en',
    })
    expect(result.alignedTokens.map((t) => t.content)).toEqual(['Paul', 'a', 'servant'])
    expect(result.semanticIds.some((id) => id.toLowerCase().includes(':paul:'))).toBe(true)
  })
})

describe('minority text + English tN', () => {
  test('does not throw and no-ops when there is no zaln and languages differ', () => {
    const olIds = ['tit 1:1:Παῦλος:1']
    const minority = [
      word('पौलुस', { semanticId: 'tit 1:1:पौलुस:1' }),
      word('के', { semanticId: 'tit 1:1:के:1' }),
      word('दास', { semanticId: 'tit 1:1:दास:1' }),
    ]
    expect(() => {
      const result = resolveAlignedQuoteTokens({
        targetTokens: minority,
        originalSemanticIds: olIds,
        quoteText: 'Παῦλος',
        occurrence: 1,
        bookCode: 'tit',
        chapter: 1,
        verse: 1,
        quoteLanguage: 'en',
        textLanguage: 'bho',
      })
      expect(result.alignedTokens).toEqual([])
    }).not.toThrow()
  })

  test('OL bridge: UGNT in the text pane highlights via own semanticId', () => {
    const olIds = ['tit 1:1:Παῦλος:1']
    const ugnt = [
      word('Παῦλος', { semanticId: 'tit 1:1:Παῦλος:1', aligned: [] }),
      word('δοῦλος', { semanticId: 'tit 1:1:δοῦλος:1', aligned: [] }),
    ]
    const result = resolveAlignedQuoteTokens({
      targetTokens: ugnt,
      originalSemanticIds: olIds,
      quoteText: 'Παῦλος',
      occurrence: 1,
      bookCode: 'tit',
      chapter: 1,
      verse: 1,
      quoteLanguage: 'en',
      textLanguage: 'el-x-koine',
    })
    expect(result.alignedTokens.some((t) => t.content === 'Παῦλος')).toBe(true)
  })

  test('isOriginalLanguageCode recognizes UHB keys, not gateway codes', () => {
    expect(isOriginalLanguageCode('hbo')).toBe(true)
    expect(isOriginalLanguageCode('el-x-koine')).toBe(true)
    expect(isOriginalLanguageCode('unfoldingWord/hbo/uhb')).toBe(true)
    expect(isOriginalLanguageCode('unfoldingWord/hbo/uhb#2')).toBe(true)
    expect(isOriginalLanguageCode('en')).toBe(false)
    expect(isOriginalLanguageCode('es')).toBe(false)
  })

  test('OL bridge: UHB in the text pane highlights via own semanticId', () => {
    const pointed = 'בְּרֵאשִׁית'
    const olIds = [`rut 1:1:${pointed}:1`]
    const uhb = [
      word(pointed, { semanticId: `rut 1:1:${pointed}:1`, aligned: [] }),
      word('הָיָה', { semanticId: 'rut 1:1:הָיָה:1', aligned: [] }),
    ]
    const result = resolveAlignedQuoteTokens({
      targetTokens: uhb,
      originalSemanticIds: olIds,
      quoteText: pointed,
      occurrence: 1,
      bookCode: 'rut',
      chapter: 1,
      verse: 1,
      quoteLanguage: 'en',
      textLanguage: 'hbo',
    })
    expect(result.alignedTokens.some((t) => t.content === pointed)).toBe(true)
  })

  test('OL bridge: UHB resource key still enables quote-text fallback when language defaulted', () => {
    expect(canFallbackToQuoteText('en', 'es')).toBe(false)
    expect(canFallbackToQuoteText('en', 'hbo')).toBe(true)
    expect(canFallbackToQuoteText('en', 'unfoldingWord/hbo/uhb')).toBe(true)
    const unpointed = 'בראשית'
    const pointed = 'בְּרֵאשִׁית'
    const uhb = [
      word(pointed, { semanticId: `rut 1:1:${pointed}:1`, aligned: [] }),
    ]
    const result = resolveAlignedQuoteTokens({
      targetTokens: uhb,
      originalSemanticIds: [`rut 1:1:${unpointed}:1`],
      quoteText: unpointed,
      occurrence: 1,
      bookCode: 'rut',
      chapter: 1,
      verse: 1,
      quoteLanguage: 'en',
      textLanguage: 'unfoldingWord/hbo/uhb',
    })
    expect(result.alignedTokens.some((t) => t.content === pointed)).toBe(true)
  })

  test('English quote is not text-matched against minority tokens', () => {
    expect(canFallbackToQuoteText('en', 'bho')).toBe(false)
    const tokens = [word('God'), word('created')]
    const viaText = findTokensByQuoteText(tokens, 'God created', 1, 'tit', 1, 1)
    // Matcher itself can hit Latin loanwords; the orchestrator must refuse the fallback.
    expect(viaText.length).toBeGreaterThan(0)
    const result = resolveAlignedQuoteTokens({
      targetTokens: tokens,
      originalSemanticIds: [],
      quoteText: 'God created',
      occurrence: 1,
      bookCode: 'tit',
      chapter: 1,
      verse: 1,
      quoteLanguage: 'en',
      textLanguage: 'bho',
    })
    expect(result.alignedTokens).toEqual([])
  })
})

describe('reference filters still key on verse, not language', () => {
  test('English tN for a verse still match when text language is minority', () => {
    const shown = filterNotesByReferenceRange(EN_TN_TITUS, {
      startChapter: 1,
      startVerse: 1,
      endChapter: 1,
      endVerse: 1,
    })
    expect(shown.map((n) => n.id)).toEqual(['en-tit-1-1'])
  })

  test('resolveQuoteSemanticIds does not throw without quoteTokens', () => {
    expect(resolveQuoteSemanticIds({}, 'tit', 1, 1)).toEqual([])
  })
})
