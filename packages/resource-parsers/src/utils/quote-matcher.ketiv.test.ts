/**
 * Ruth 4:5 says קניתי (ketiv), and its qere קָנִ֔יתָה is in a footnote: the verse's token is the ketiv and carries the
 * qere. unfoldingWord's notes quote the qere (es-419 ut23 «בְּ⁠יוֹם־קְנוֹתְ⁠ךָ֥ & וּ֠⁠מֵ⁠אֵת & קָנִ֔יתָה»), and its last
 * part was not found, so the note lost «adquieres».
 */

import { describe, expect, test } from 'bun:test'
import type { OptimizedChapter, OptimizedToken } from '../types/optimized-tokens'
import { QuoteMatcher } from './quote-matcher'

const KETIV = 'קניתי'
const QERE = 'קָנִ֔יתָה'

// Ruth 4:5 of the UHB, from בְּיוֹם on; a ketiv's token carries its qere.
const WORDS: Array<[string, string?]> = [
  ['וַ⁠יֹּ֣אמֶר'],
  ['בֹּ֔עַז'],
  ['בְּ⁠יוֹם'],
  ['קְנוֹתְ⁠ךָ֥'],
  ['הַ⁠שָּׂדֶ֖ה'],
  ['מִ⁠יַּ֣ד'],
  ['נָעֳמִ֑י'],
  ['וּ֠⁠מֵ⁠אֵת'],
  ['ר֣וּת'],
  ['הַ⁠מּוֹאֲבִיָּ֤ה'],
  ['אֵֽשֶׁת'],
  ['הַ⁠מֵּת֙'],
  [KETIV, QERE],
  ['לְ⁠הָקִ֥ים'],
  ['שֵׁם'],
  ['הַ⁠מֵּ֖ת'],
]

function ruth45(): OptimizedChapter[] {
  const tokens: OptimizedToken[] = WORDS.map(([text, qere], i) => ({
    id: i + 1,
    text,
    type: 'word',
    ...(qere ? { qere, qereOccurrence: 1 } : {}),
  }))
  return [{ number: 4, verseCount: 1, paragraphCount: 1, verses: [{ number: 5, text: '', tokens }] }]
}

const REF = { book: 'rut', startChapter: 4, startVerse: 5 }
const ids = (quote: string, occurrence = 1) => {
  const result = new QuoteMatcher().findOriginalTokens(ruth45(), quote, occurrence, REF)
  return result.success ? result.totalTokens.map((t) => t.id) : null
}

describe('a quote finds a ketiv by its qere', () => {
  test('the qere alone, pointed as the note writes it, finds the ketiv, which keeps its qere', () => {
    const result = new QuoteMatcher().findOriginalTokens(ruth45(), QERE, 1, REF)
    expect(result.success).toBe(true)
    expect(result.totalTokens).toHaveLength(1)
    expect(result.totalTokens[0]).toMatchObject({ id: 13, text: KETIV, qere: QERE, occurrence: 1 })
  })

  test('ut23: every part of «בְּ⁠יוֹם־קְנוֹתְ⁠ךָ֥ & וּ֠⁠מֵ⁠אֵת & קָנִ֔יתָה» is found, the qere last', () => {
    expect(ids('בְּ⁠יוֹם־קְנוֹתְ⁠ךָ֥ & וּ֠⁠מֵ⁠אֵת & קָנִ֔יתָה')).toEqual([3, 4, 8, 13])
  })

  test('dya3: «וּ֠⁠מֵ⁠אֵת ר֣וּת & קָנִ֔יתָה» keeps its last part', () => {
    expect(ids('וּ֠⁠מֵ⁠אֵת ר֣וּת & קָנִ֔יתָה')).toEqual([8, 9, 13])
  })

  test('a phrase that runs through the ketiv, named by its qere, is found whole', () => {
    expect(ids('אֵֽשֶׁת־הַ⁠מֵּת֙ קָנִ֔יתָה לְ⁠הָקִ֥ים')).toEqual([11, 12, 13, 14])
  })

  test('the ketiv as written is still found', () => {
    expect(ids(KETIV)).toEqual([13])
  })

  test('an occurrence the verse does not have is not found', () => {
    expect(ids(QERE, 2)).toBeNull()
  })
})
