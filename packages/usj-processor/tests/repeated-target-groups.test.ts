/**
 * Alignment groups that share target words must all survive groupsForVerse.
 *
 * es-419 GLT v42 Titus 1:1 aligns «de Dios» to Θεοῦ twice (occurrence 1 and 2)
 * and «y» to δὲ and καὶ. Deduping groups by target words alone dropped the
 * second «de Dios» and the second «y», so «Dios» #2 and «y» #2 lost their
 * alignment and every later «de» took the ids meant for the next one
 * («de» #5 carried κατ’, «de» #6 carried nothing).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  alignmentGroupSignature,
  mergePreVerseAlignments,
  semanticIdFor,
  USJProcessor,
} from '../src/index'

const GLT_TIT_1_1 = readFileSync(
  join(import.meta.dir, '..', 'fixtures', 'es-419_glt_TIT1-1.usfm'),
  'utf8'
)

const ref = 'tit 1:1'
const ol = (content: string, occurrence = 1) => semanticIdFor(ref, content, occurrence)

describe('repeated target-word groups (es-419 GLT Titus 1:1)', () => {
  test('every «de» carries the OL ids of its own \\zaln-s', async () => {
    const { viewModel } = await new USJProcessor().processUSFM(GLT_TIT_1_1, 'tit', 'Tito')
    const tokens = viewModel.chapters[0]!.verses[0]!.tokens
    const de = tokens.filter((t) => t.content === 'de')
    expect(de.map((t) => t.alignedOriginalWordIds)).toEqual([
      [ol('Θεοῦ', 1)],
      [ol('Ἰησοῦ'), ol('Χριστοῦ')],
      [ol('ἐκλεκτῶν')],
      [ol('Θεοῦ', 2)],
      [ol('ἀληθείας')],
      [ol('κατ’')],
    ])
  })

  test('second «Dios» and second «y» keep their alignment', async () => {
    const { viewModel } = await new USJProcessor().processUSFM(GLT_TIT_1_1, 'tit', 'Tito')
    const tokens = viewModel.chapters[0]!.verses[0]!.tokens
    const byOcc = (content: string, occurrence: number) =>
      tokens.find((t) => t.content === content && t.occurrence === occurrence)
    expect(byOcc('Dios', 2)?.alignedOriginalWordIds).toEqual([ol('Θεοῦ', 2)])
    expect(byOcc('y', 1)?.alignedOriginalWordIds).toEqual([ol('δὲ')])
    expect(byOcc('y', 2)?.alignedOriginalWordIds).toEqual([ol('καὶ')])
    expect(tokens.every((t) => t.alignedOriginalWordIds.length > 0)).toBe(true)
  })

  test('case-variant keys holding the same groups still merge without duplicates', () => {
    const group = (word: string, occurrence: number, content: string, srcOcc: number) => ({
      sources: [{ strong: '', lemma: '', content, occurrence: srcOcc, occurrences: 2 }],
      targets: [
        { word: 'de', occurrence, occurrences: 2 },
        { word, occurrence: srcOcc, occurrences: 2 },
      ],
    })
    const first = group('Dios', 1, 'Θεοῦ', 1)
    const second = group('Dios', 2, 'Θεοῦ', 2)
    expect(alignmentGroupSignature(first)).not.toBe(alignmentGroupSignature(second))

    const merged = mergePreVerseAlignments(
      { 'TIT 1:1': [first, second], 'tit 1:1': [first, second] },
      {}
    )
    expect(Object.keys(merged)).toEqual(['TIT 1:1'])
    expect(merged['TIT 1:1']).toHaveLength(2)
  })
})
