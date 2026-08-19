import { describe, expect, test } from 'bun:test'
import type { OptimizedChapter } from '../types/optimized-tokens'
import { QuoteMatcher } from './quote-matcher'

function chapter(words: string[]): OptimizedChapter[] {
  return [
    {
      number: 1,
      verseCount: 1,
      paragraphCount: 1,
      verses: [
        {
          number: 1,
          text: words.join(' '),
          tokens: words.map((text, i) => ({
            id: i + 1,
            text,
            type: 'word' as const,
          })),
        },
      ],
    },
  ]
}

describe('QuoteMatcher occurrence (USJ identity contract)', () => {
  const matcher = new QuoteMatcher()

  test('assigns verse-wide occurrence case-insensitively', () => {
    const result = matcher.findOriginalTokens(chapter(['God', 'of', 'god']), 'god', 2, {
      book: 'tit',
      startChapter: 1,
      startVerse: 1,
    })
    expect(result.success).toBe(true)
    expect(result.totalTokens).toHaveLength(1)
    expect(result.totalTokens[0]?.text).toBe('god')
    expect(result.totalTokens[0]?.occurrence).toBe(2)
  })

  test('matches multi-part quotes with & (later parts occurrence 1 after prior)', () => {
    const result = matcher.findOriginalTokens(
      chapter(['Παῦλος', 'δοῦλος', 'θεοῦ', 'ἀπόστολος']),
      'Παῦλος & θεοῦ',
      1,
      { book: 'tit', startChapter: 1, startVerse: 1 }
    )
    expect(result.success).toBe(true)
    expect(result.totalTokens.map((t) => t.text)).toEqual(['Παῦλος', 'θεοῦ'])
    expect(result.totalTokens.map((t) => t.occurrence)).toEqual([1, 1])
  })

  test('Hebrew unpointed quote matches pointed UHB token (consonants only)', () => {
    const pointedBereshit = 'בְּרֵאשִׁית'
    const pointedErets = 'הָאָרֶץ'
    const bereshit = matcher.findOriginalTokens(chapter([pointedBereshit]), 'בראשית', 1, {
      book: 'gen',
      startChapter: 1,
      startVerse: 1,
    })
    expect(bereshit.success).toBe(true)
    expect(bereshit.totalTokens[0]?.text).toBe(pointedBereshit)

    const erets = matcher.findOriginalTokens(chapter([pointedErets]), 'הארץ', 1, {
      book: 'gen',
      startChapter: 1,
      startVerse: 1,
    })
    expect(erets.success).toBe(true)
    expect(erets.totalTokens[0]?.text).toBe(pointedErets)
  })

  test('Greek tonos quote matches oxia UGNT token', () => {
    const oxia = 'κακούς'
    const result = matcher.findOriginalTokens(chapter([oxia]), 'κακούς', 1, {
      book: 'rev',
      startChapter: 1,
      startVerse: 1,
    })
    expect(result.success).toBe(true)
    expect(result.totalTokens).toHaveLength(1)
    expect(result.totalTokens[0]?.text).toBe(oxia)
  })
})
