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
  mergePreVerseAlignments,
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

describe('PSA \\d + following body verse (chapter-slice casing)', () => {
  /**
   * Regression: chapter SoT slices omit the book node; harvest with a lowercase
   * book hint used to key pre-verse under `psa 5:1` while stripAlignments body
   * stayed on `PSA 5:1`. groupsForVerse short-circuited on the lowercase key →
   * heading tokens got zaln, body tokens did not → TN/TWL chips stayed on OL.
   */
  test('lowercase book hint + chapter sid: body v1 tokens keep zaln after \\d', () => {
    const usj = {
      content: [
        { type: 'chapter', marker: 'c', number: 5, sid: 'PSA 5' },
        {
          type: 'para',
          marker: 'd',
          content: [
            {
              type: 'ms',
              marker: 'zaln-s',
              'x-strong': 'l:H5329',
              'x-lemma': 'נָצַח',
              'x-content': 'לַ⁠מְנַצֵּ֥חַ',
              'x-occurrence': '1',
              'x-occurrences': '1',
            },
            { type: 'char', marker: 'w', content: ['For'] },
            { type: 'char', marker: 'w', content: ['the'] },
            { type: 'char', marker: 'w', content: ['chief'] },
            { type: 'char', marker: 'w', content: ['musician'] },
            { type: 'ms', marker: 'zaln-e' },
          ],
        },
        {
          type: 'para',
          marker: 'q1',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'PSA 5:1' },
            {
              type: 'ms',
              marker: 'zaln-s',
              'x-strong': 'H03068',
              'x-lemma': 'יהוה',
              'x-content': 'יְהוָ֗ה',
              'x-occurrence': '1',
              'x-occurrences': '1',
            },
            { type: 'char', marker: 'w', content: ['Yahweh'] },
            { type: 'ms', marker: 'zaln-e' },
            {
              type: 'ms',
              marker: 'zaln-s',
              'x-strong': 'H0995',
              'x-lemma': 'בּין',
              'x-content': 'בִּ֣ינָ⁠ה',
              'x-occurrence': '1',
              'x-occurrences': '1',
            },
            { type: 'char', marker: 'w', content: ['Understand'] },
            { type: 'ms', marker: 'zaln-e' },
          ],
        },
      ],
    }

    const bodyOnly = {
      'PSA 5:1': [
        {
          sources: [
            {
              strong: 'H03068',
              lemma: 'יהוה',
              content: 'יְהוָ֗ה',
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [{ word: 'Yahweh', occurrence: 1, occurrences: 1 }],
        },
        {
          sources: [
            {
              strong: 'H0995',
              lemma: 'בּין',
              content: 'בִּ֣ינָ⁠ה',
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [{ word: 'Understand', occurrence: 1, occurrences: 1 }],
        },
      ],
    }

    const pre = harvestPreVerseAlignments(usj, 'psa')
    expect(Object.keys(pre)).toEqual(['PSA 5:1'])
    const merged = mergePreVerseAlignments(bodyOnly, pre)
    expect(Object.keys(merged)).toEqual(['PSA 5:1'])
    expect(merged['PSA 5:1']!.map((g) => g.targets.map((t) => t.word).join(' '))).toEqual([
      'For the chief musician',
      'Yahweh',
      'Understand',
    ])

    const { viewModel } = new USJProcessor().fromUsjAndAlignments(
      usj as never,
      bodyOnly as never,
      'psa',
      'Psalms'
    )
    const v1 = viewModel.chapters
      .find((c) => c.number === 5)!
      .verses.find((v) => v.number === 1)!
    const yahweh = v1.tokens.find((t) => t.content === 'Yahweh')
    const understand = v1.tokens.find((t) => t.content === 'Understand')
    const musician = v1.tokens.find((t) => t.content === 'musician')
    expect(musician?.alignedOriginalWordIds.length).toBeGreaterThan(0)
    expect(yahweh?.alignedOriginalWordIds.length).toBeGreaterThan(0)
    expect(understand?.alignedOriginalWordIds.length).toBeGreaterThan(0)
    expect(yahweh!.alignedOriginalWordIds.some((id) => id.includes('יְהוָ'))).toBe(true)
    expect(understand!.alignedOriginalWordIds.some((id) => id.includes('בִּ֣ינ'))).toBe(true)
  })

  test('no chapter sid + lowercase hint: merge still collapses onto PSA body key', () => {
    const usj = {
      content: [
        { type: 'chapter', marker: 'c', number: 5 },
        {
          type: 'para',
          marker: 'd',
          content: [
            {
              type: 'ms',
              marker: 'zaln-s',
              'x-strong': 'l:H5329',
              'x-lemma': 'נ',
              'x-content': 'ל',
              'x-occurrence': '1',
              'x-occurrences': '1',
            },
            { type: 'char', marker: 'w', content: ['For'] },
            { type: 'ms', marker: 'zaln-e' },
          ],
        },
        {
          type: 'para',
          marker: 'q1',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'PSA 5:1' },
            {
              type: 'ms',
              marker: 'zaln-s',
              'x-strong': 'H03068',
              'x-lemma': 'י',
              'x-content': 'יְהוָ֗ה',
              'x-occurrence': '1',
              'x-occurrences': '1',
            },
            { type: 'char', marker: 'w', content: ['Yahweh'] },
            { type: 'ms', marker: 'zaln-e' },
          ],
        },
      ],
    }
    const bodyOnly = {
      'PSA 5:1': [
        {
          sources: [
            {
              strong: 'H03068',
              lemma: 'י',
              content: 'יְהוָ֗ה',
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [{ word: 'Yahweh', occurrence: 1, occurrences: 1 }],
        },
      ],
    }
    const pre = harvestPreVerseAlignments(usj, 'psa')
    expect(Object.keys(pre)).toEqual(['psa 5:1'])
    const merged = mergePreVerseAlignments(bodyOnly, pre)
    expect(Object.keys(merged)).toEqual(['PSA 5:1'])
    expect(merged['PSA 5:1']!.map((g) => g.targets.map((t) => t.word).join(' '))).toEqual([
      'For',
      'Yahweh',
    ])
  })
})
