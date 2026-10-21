import { describe, expect, test } from 'bun:test'
import { extractPreparedBroadcastTokens } from './extractPreparedBroadcastTokens'
import type { ScriptureFullChapter } from './scripturePreparer'

describe('extractPreparedBroadcastTokens', () => {
  test('includes pre-verse heading tokens as verse 1', () => {
    const full = {
      version: 1,
      unit: 5,
      matchKeys: [
        'psa 5:1:אל:1',
        'psa 5:1:הנחילות:1',
        'psa 5:1:אמרי:1',
      ],
      blocks: [
        {
          marker: 'd',
          role: 'heading',
          indentLevel: 0,
          chapterNumber: 5,
          verseNumbers: [1],
          inline: [
            { kind: 'token', token: { c: 'on', o: 1, k: 0, a: [0, 1] } },
            { kind: 'token', token: { c: 'the', o: 2, k: 0, a: [0, 1] } },
            { kind: 'token', token: { c: 'flutes', o: 1, k: 0, a: [0, 1] } },
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
            { kind: 'token', token: { c: 'my', o: 1, k: 2, a: [2] } },
            { kind: 'token', token: { c: 'words', o: 1, k: 2, a: [2] } },
          ],
        },
      ],
    } as ScriptureFullChapter

    const tokens = extractPreparedBroadcastTokens('psa', 5, full, 1, 999)
    expect(tokens.map((t) => t.text)).toEqual(['on', 'the', 'flutes', 'To', 'my', 'words'])
    expect(tokens.every((t) => t.verseRef === 'psa 5:1')).toBe(true)
    expect(tokens[0]!.alignedOriginalWordIds).toEqual(['psa 5:1:אל:1', 'psa 5:1:הנחילות:1'])
    expect(tokens[3]!.alignedOriginalWordIds).toEqual(['psa 5:1:אמרי:1'])
  })

  test('still skips heading tokens when the verse-1 span is excluded', () => {
    const full = {
      version: 1,
      unit: 5,
      matchKeys: ['psa 5:1:מזמור:1', 'psa 5:2:יהוה:1'],
      blocks: [
        {
          marker: 'd',
          role: 'heading',
          indentLevel: 0,
          chapterNumber: 5,
          verseNumbers: [1],
          inline: [{ kind: 'token', token: { c: 'psalm', o: 1, k: 0, a: [0] } }],
        },
        {
          marker: 'q1',
          role: 'para',
          indentLevel: 0,
          chapterNumber: 5,
          verseNumbers: [2],
          inline: [
            { kind: 'verse', chapterNumber: 5, verseNumber: 2 },
            { kind: 'token', token: { c: 'Yahweh', o: 1, k: 1, a: [1] } },
          ],
        },
      ],
    } as ScriptureFullChapter

    const tokens = extractPreparedBroadcastTokens('psa', 5, full, 2, 2)
    expect(tokens.map((t) => t.text)).toEqual(['Yahweh'])
  })
})
