/**
 * USJ Titus fixture gates.
 * Self-consistency + identity / alignment / punctuation guards.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { collectSemanticIdSet, collectSurfaceOccurrenceSet } from '../src/parity'
import { USJProcessor } from '../src/USJProcessor'
import { flattenUsjTokens, semanticIdFor } from '../src/index'

const FIXTURES = join(import.meta.dir, '..', 'fixtures')

const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')

describe('USJ Titus fixtures — self-consistency', () => {
  test('ULT Titus chapter 1: deterministic process + non-empty identity sets', async () => {
    const proc = new USJProcessor()
    const a = await proc.processUSFM(ULT_USFM, 'TIT', 'Titus', {
      language: 'en',
      includeWordTokens: true,
      includeAlignments: true,
    })
    const b = await proc.processUSFM(ULT_USFM, 'TIT', 'Titus', {
      language: 'en',
      includeWordTokens: true,
      includeAlignments: true,
    })

    const idsA = collectSemanticIdSet(a.scripture, 1)
    const idsB = collectSemanticIdSet(b.scripture, 1)
    expect([...idsA].sort()).toEqual([...idsB].sort())
    expect(idsA.size).toBeGreaterThan(0)

    const surfaces = collectSurfaceOccurrenceSet(a.scripture, 1)
    expect(surfaces.size).toBeGreaterThan(0)

    const vmTokens = flattenUsjTokens(a.viewModel, 1)
    expect(vmTokens.length).toBeGreaterThan(0)
    expect(vmTokens.every((t) => t.semanticId === semanticIdFor(t.verseRef, t.content, t.occurrence))).toBe(
      true
    )

    const aligned = vmTokens.filter((t) => t.alignedOriginalWordIds.length > 0)
    expect(aligned.length).toBeGreaterThan(0)
  })

  test('UGNT Titus chapter 1: OL semantic IDs; no gateway alignments', async () => {
    const { scripture, viewModel } = await new USJProcessor().processUSFM(
      UGNT_USFM,
      'TIT',
      'Titus',
      { language: 'el-x-koine', includeWordTokens: true, includeAlignments: true }
    )
    const ids = collectSemanticIdSet(scripture, 1)
    expect(ids.size).toBeGreaterThan(0)
    const aligned = flattenUsjTokens(viewModel, 1).filter((t) => t.alignedOriginalWordIds.length > 0)
    expect(aligned.length).toBe(0)
  })

  test('ULT + UGNT full Titus book process succeeds', async () => {
    const proc = new USJProcessor()
    const ult = await proc.processUSFM(ULT_USFM, 'TIT', 'Titus', { language: 'en' })
    const ugnt = await proc.processUSFM(UGNT_USFM, 'TIT', 'Titus', {
      language: 'el-x-koine',
    })
    expect(ult.scripture.chapters.length).toBeGreaterThan(0)
    expect(ugnt.scripture.chapters.length).toBeGreaterThan(0)
    expect(collectSemanticIdSet(ult.scripture, 'all').size).toBeGreaterThan(0)
    expect(collectSemanticIdSet(ugnt.scripture, 'all').size).toBeGreaterThan(0)
  })

  test('documents tokenizeGatewayUsj punctuation pitfall (not used by adapter)', async () => {
    const { USFMParser, stripAlignments, tokenizeGatewayUsj } = await import('../src/usfmTools')
    const parser = new USFMParser()
    parser.parse(ULT_USFM)
    const usj = parser.toJSON()
    const { editable } = stripAlignments(usj)
    const tokens = tokenizeGatewayUsj(editable)
    const v1 = tokens['TIT 1:1'] || []
    const withComma = v1.filter((t: { surface: string }) => t.surface.includes(','))
    expect(withComma.length).toBeGreaterThan(0)

    const { scripture } = await new USJProcessor().processUSFM(ULT_USFM, 'TIT', 'Titus')
    const ch1 = scripture.chapters.find((c) => c.number === 1)!
    const verse1 = ch1.verses.find((v) => v.number === 1)!
    const adapterSurfaces = (verse1.wordTokens || [])
      .filter((t) => t.type === 'word')
      .map((t) => t.content)
    expect(adapterSurfaces.some((s) => s.includes(','))).toBe(false)
    expect(adapterSurfaces).toContain('Paul')
    expect(adapterSurfaces).not.toContain('Paul,')
  })
})
