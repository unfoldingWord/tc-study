import { describe, expect, test } from 'bun:test'
import type { OptimizedChapter, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { buildQuoteTokens } from './buildQuoteTokens'

function chapterWithGreek(text: string): OptimizedChapter[] {
  return [
    {
      number: 1,
      verseCount: 1,
      paragraphCount: 1,
      verses: [
        {
          number: 1,
          text,
          tokens: [
            {
              id: 1,
              text,
              type: 'word',
              strong: 'G2316',
              lemma: 'θεός',
              occurrence: 1,
            },
          ],
        },
      ],
    },
  ]
}

describe('buildQuoteTokens', () => {
  test('matches origWords to original-language tokens', () => {
    const link: TranslationWordsLink = {
      reference: '1:1',
      id: 'e2e',
      tags: 'kt',
      origWords: 'Θεοῦ',
      occurrence: '1',
      articlePath: 'bible/kt/god',
    }

    const tokens = buildQuoteTokens({
      link,
      originalChapters: chapterWithGreek('Θεοῦ'),
      bookCode: 'tit',
    })

    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens[0]?.text).toBe('Θεοῦ')
  })

  test('returns empty when original chapters missing', () => {
    const link: TranslationWordsLink = {
      reference: '1:1',
      id: 'e2e',
      tags: 'kt',
      origWords: 'Θεοῦ',
      occurrence: '1',
      articlePath: 'bible/kt/god',
    }

    expect(
      buildQuoteTokens({
        link,
        originalChapters: [],
        bookCode: 'tit',
      })
    ).toEqual([])
  })

  test('returns empty when quote has no match', () => {
    const link: TranslationWordsLink = {
      reference: '1:1',
      id: 'e2e',
      tags: 'kt',
      origWords: 'Παῦλος',
      occurrence: '1',
      articlePath: 'bible/names/paul',
    }

    expect(
      buildQuoteTokens({
        link,
        originalChapters: chapterWithGreek('Θεοῦ'),
        bookCode: 'tit',
      })
    ).toEqual([])
  })
})
