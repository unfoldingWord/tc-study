/**
 * Psalm `\d` superscriptions: raw ULT has zaln + `\w`, but stripAlignments /
 * collectUsjWords previously dropped pre-verse content — tokens rendered as
 * bold heading text without semantic IDs (TWL fell back to OL).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildUsjLayoutBlocksForChapter,
  collectUsjWords,
  collectVerseDisplayInline,
  harvestPreVerseAlignments,
  plainTextFromLayoutInline,
  USJProcessor,
} from '../src/index'
import { stripAlignments } from '../src/usfmTools'

const FIXTURE = readFileSync(
  join(import.meta.dir, '..', 'fixtures', 'en_ult_PSA14_superscription.usfm'),
  'utf8'
)

describe('PSA 14 superscription (pre-verse \\d)', () => {
  test('raw USFM words before \\v 1 are collected as PSA 14:1', () => {
    // Minimal USJ-shaped tree mirroring parser output for \\d then \\v 1
    const usj = {
      content: [
        { type: 'book', marker: 'id', code: 'PSA' },
        { type: 'chapter', marker: 'c', number: '14' },
        {
          type: 'para',
          marker: 'd',
          content: [
            { type: 'char', marker: 'w', content: ['To'] },
            ' ',
            { type: 'char', marker: 'w', content: ['David'] },
          ],
        },
        {
          type: 'para',
          marker: 'q1',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'PSA 14:1' },
            { type: 'char', marker: 'w', content: ['A'] },
            ' ',
            { type: 'char', marker: 'w', content: ['foolish'] },
          ],
        },
      ],
    }
    const words = collectUsjWords(usj, 'PSA')
    expect(words.map((w) => w.content)).toEqual(['To', 'David', 'A', 'foolish'])
    expect(words.every((w) => w.verseSid === 'PSA 14:1')).toBe(true)
  })

  test('harvestPreVerseAlignments restores \\d zaln dropped by stripAlignments', async () => {
    const { usj, alignmentMap: stripped } = await (async () => {
      const { usj, alignmentMap } = await new USJProcessor().processUSFM(
        FIXTURE,
        'PSA',
        'Psalms'
      )
      // Re-strip to simulate stock usj-core map (no pre-verse groups).
      const { alignments } = stripAlignments(
        JSON.parse(JSON.stringify(usj)) as typeof usj
      )
      return { usj, alignmentMap: alignments }
    })()

    const bodyFirst = stripped['PSA 14:1']?.[0]?.targets?.[0]?.word
    expect(bodyFirst).toBe('A')
    expect(
      stripped['PSA 14:1']?.some((g) =>
        g.targets.some((t) => t.word === 'David')
      )
    ).toBe(false)

    const pre = harvestPreVerseAlignments(usj, 'PSA')
    expect(pre['PSA 14:1']?.length).toBe(2)
    expect(pre['PSA 14:1']![0]!.targets.map((t) => t.word)).toEqual([
      'To',
      'the',
      'music',
      'director',
    ])
    expect(pre['PSA 14:1']![1]!.targets.map((t) => t.word)).toEqual(['Of', 'David'])
    expect(pre['PSA 14:1']![1]!.sources[0]!.content).toContain('לְ⁠דָ')
    expect(pre['PSA 14:1']![1]!.sources[0]!.lemma).toContain('דָּוִד')

    // Processor merge puts David on the gateway token.
    const { viewModel } = await new USJProcessor().processUSFM(FIXTURE, 'PSA', 'Psalms')
    const v1 = viewModel.chapters
      .find((c) => c.number === 14)!
      .verses.find((v) => v.number === 1)!
    const david = v1.tokens.find((t) => t.content === 'David')
    expect(david).toBeTruthy()
    expect(david!.alignedOriginalWordIds.length).toBeGreaterThan(0)
    expect(
      david!.alignedOriginalWordIds.some(
        (id) => id.includes('לְ⁠דָ') || id.includes('דָוִד') || id.includes('דָּוִד')
      )
    ).toBe(true)
  })

  test('\\d layout keeps tokens with semantic ids (not flattened heading text)', async () => {
    const { viewModel } = await new USJProcessor().processUSFM(FIXTURE, 'PSA', 'Psalms')
    const blocks = buildUsjLayoutBlocksForChapter(viewModel.usj, viewModel, 14)
    const d = blocks.find((b) => b.marker === 'd')
    expect(d).toBeTruthy()
    expect(d!.role).toBe('heading')

    const tokens = d!.inline.filter((i) => i.kind === 'token')
    expect(tokens.length).toBeGreaterThanOrEqual(6)
    expect(
      tokens.every((i) => i.kind === 'token' && i.token.semanticId.includes('PSA 14:1'))
    ).toBe(true)
    const david = tokens.find((i) => i.kind === 'token' && i.token.content === 'David')
    expect(david).toBeTruthy()
    if (david?.kind === 'token') {
      expect(david.token.alignedOriginalWordIds.length).toBeGreaterThan(0)
    }
    // Surfaces must not be collapsed into heading text runs (the old bug).
    expect(
      d!.inline.some((i) => i.kind === 'heading' && /David|director/.test(i.text))
    ).toBe(false)

    // Verse-body inline must not duplicate the superscription tokens.
    const v1Inline = collectVerseDisplayInline(blocks, 14, 1)
    expect(plainTextFromLayoutInline(v1Inline)).toContain('foolish')
    expect(plainTextFromLayoutInline(v1Inline)).not.toContain('David')
  })
})
