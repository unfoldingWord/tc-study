import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OptimizedChapter, OptimizedToken, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { buildQuoteTokens } from './buildQuoteTokens'

function loadTnMultiVerseExamples(): Map<string, { reference: string; quote: string }> {
  const text = readFileSync(join(import.meta.dir, '../../../../docs/tn-multi-verse-example.tsv'), 'utf8')
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0]!.split('\t')
  const refI = header.indexOf('Reference')
  const idI = header.indexOf('ID')
  const quoteI = header.indexOf('Quote')
  const out = new Map<string, { reference: string; quote: string }>()
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cols = line.split('\t')
    out.set(cols[idI]!, { reference: cols[refI]!, quote: cols[quoteI]! })
  }
  return out
}

const tnExamples = loadTnMultiVerseExamples()

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

  test('Hebrew unpointed quote still matches pointed UHB tokens', () => {
    const pointed = 'בְּרֵאשִׁית'
    const link: TranslationWordsLink = {
      reference: '1:1',
      id: 'bereshit',
      tags: 'kt',
      origWords: 'בראשית',
      occurrence: '1',
      articlePath: '',
    }
    const tokens = buildQuoteTokens({
      link,
      originalChapters: [
        {
          number: 1,
          verseCount: 1,
          paragraphCount: 1,
          verses: [
            {
              number: 1,
              text: pointed,
              tokens: [{ id: 1, text: pointed, type: 'word', occurrence: 1 }],
            },
          ],
        },
      ],
      bookCode: 'gen',
    })
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.text).toBe(pointed)
  })

  test('NFD-folds Greek tonos quote onto UGNT oxia token', () => {
    const oxia = 'κακούς'
    const tonos = 'κακούς'
    const link: TranslationWordsLink = {
      reference: '2:2',
      id: 'kakous',
      tags: 'kt',
      origWords: tonos,
      occurrence: '1',
      articlePath: '',
    }
    const tokens = buildQuoteTokens({
      link,
      originalChapters: [
        {
          number: 2,
          verseCount: 1,
          paragraphCount: 1,
          verses: [
            {
              number: 2,
              text: oxia,
              tokens: [{ id: 1, text: oxia, type: 'word', occurrence: 1 }],
            },
          ],
        },
      ],
      bookCode: 'rev',
    })
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.text).toBe(oxia)
  })

  function hebrewChapter(
    verses: Array<{ number: number; words: string[] }>
  ): OptimizedChapter[] {
    return [
      {
        number: 5,
        verseCount: verses.length,
        paragraphCount: 1,
        verses: verses.map((v) => ({
          number: v.number,
          text: v.words.join(' '),
          tokens: v.words.map(
            (text, i): OptimizedToken => ({
              id: i + 1,
              text,
              type: 'word',
              occurrence: v.words
                .slice(0, i + 1)
                .filter((w) => w.toLowerCase() === text.toLowerCase()).length,
            })
          ),
        })),
      },
    ]
  }

  test('sbh4 TSV quote walks four Yahweh hits across 5:1,3,8,12', () => {
    const example = tnExamples.get('sbh4')
    expect(example).toBeDefined()
    const yahweh = 'יְהוָה'
    const tokens = buildQuoteTokens({
      link: {
        reference: example!.reference,
        id: 'sbh4',
        tags: '',
        origWords: example!.quote,
        occurrence: '1',
        articlePath: '',
      },
      originalChapters: hebrewChapter([
        { number: 1, words: [yahweh] },
        { number: 2, words: ['אֱלֹהָי'] },
        { number: 3, words: [yahweh] },
        { number: 8, words: [yahweh] },
        { number: 12, words: [yahweh] },
      ]),
      bookCode: 'psa',
    })
    expect(tokens).toHaveLength(4)
    expect(tokens.map((t) => (t as { verse?: number }).verse)).toEqual([1, 3, 8, 12])
    expect(tokens.every((t) => (t as { chapter?: number }).chapter === 5)).toBe(true)
  })

  test('svyb TSV quote walks two spans on the 5:2-3 merged stream', () => {
    const example = tnExamples.get('svyb')
    expect(example).toBeDefined()
    const [sound, voice] = example!.quote.split(/\s*&\s*/).map((p) => p.trim())
    const tokens = buildQuoteTokens({
      link: {
        reference: example!.reference,
        id: 'svyb',
        tags: '',
        origWords: example!.quote,
        occurrence: '1',
        articlePath: '',
      },
      originalChapters: hebrewChapter([
        { number: 2, words: [sound!] },
        { number: 3, words: [voice!] },
      ]),
      bookCode: 'psa',
    })
    expect(tokens).toHaveLength(2)
    expect(tokens[0]?.text).toBe(sound)
    expect(tokens[1]?.text).toBe(voice)
    expect((tokens[0] as { verse?: number }).verse).toBe(2)
    expect((tokens[1] as { verse?: number }).verse).toBe(3)
  })

  test('two & parts in verse 1 are consecutive occurrences, not 1:1 part→verse', () => {
    const yahweh = 'יְהוָה'
    const tokens = buildQuoteTokens({
      link: {
        reference: '5:1,3',
        id: 'not-1to1',
        tags: '',
        origWords: `${yahweh} & ${yahweh}`,
        occurrence: '1',
        articlePath: '',
      },
      originalChapters: hebrewChapter([
        { number: 1, words: [yahweh, yahweh] },
        { number: 3, words: ['אֱלֹהָי'] },
      ]),
      bookCode: 'psa',
    })
    expect(tokens).toHaveLength(2)
    expect(tokens.map((t) => (t as { verse?: number }).verse)).toEqual([1, 1])
    expect(tokens.map((t) => t.occurrence)).toEqual([1, 2])
  })

  test('keeps matched segments when one multi-verse part misses', () => {
    const link: TranslationWordsLink = {
      reference: '5:1,3,8,12',
      id: 'sbh4-partial',
      tags: '',
      origWords: 'יְהוָה & יְהוָה & חסר & יְהוָה',
      occurrence: '1',
      articlePath: '',
    }
    const tokens = buildQuoteTokens({
      link,
      originalChapters: hebrewChapter([
        { number: 1, words: ['יְהוָה'] },
        { number: 3, words: ['יְהוָה'] },
        { number: 8, words: ['יְהוָה'] },
        { number: 12, words: ['יְהוָה'] },
      ]),
      bookCode: 'psa',
    })
    expect(tokens).toHaveLength(3)
    expect(tokens.map((t) => (t as { verse?: number }).verse)).toEqual([1, 3, 8])
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
