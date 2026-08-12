/**
 * P0 parity: USJ adapter vs @bt-synergy/usfm-processor on ULT + UGNT Titus.
 *
 * Gates (plan):
 * - ≥99% word surface+occurrence
 * - OL / gateway semantic ID set equality (case-insensitive)
 * - alignedOriginalWordIds equality for ULT tokens that have alignments
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { USFMProcessor } from '@bt-synergy/usfm-processor'

import { attachAlignmentSemanticIds } from '../src/attachAlignmentSemanticIds'
import { buildParityReport, formatParityReport } from '../src/parity'
import { USJProcessor } from '../src/USJProcessor'

const FIXTURES = join(import.meta.dir, '..', 'fixtures')

const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')

const PASS_THRESHOLD = 99

async function processBoth(usfm: string, language: string) {
  const legacyProc = new USFMProcessor()
  const usjProc = new USJProcessor()

  const legacy = await legacyProc.processUSFM(usfm, 'TIT', 'Titus', {
    language,
    includeWordTokens: true,
    includeAlignments: true,
  })
  attachAlignmentSemanticIds(
    legacy,
    legacy.chapters.flatMap((c) => c.verses)
  )

  const { scripture: usj } = await usjProc.processUSFM(usfm, 'TIT', 'Titus', {
    language,
    includeWordTokens: true,
    includeAlignments: true,
  })

  return { legacy, usj }
}

function assertParity(
  label: string,
  legacy: Awaited<ReturnType<typeof processBoth>>['legacy'],
  usj: Awaited<ReturnType<typeof processBoth>>['usj'],
  chapterFilter: number | 'all'
) {
  const report = buildParityReport(label, legacy, usj, chapterFilter)
  // Always print counts for spike go/no-go evidence
  console.log(formatParityReport(report))

  expect(report.wordSurfaceOccurrence.pct).toBeGreaterThanOrEqual(PASS_THRESHOLD)
  expect(report.semanticIds.pct).toBeGreaterThanOrEqual(PASS_THRESHOLD)
  expect(report.semanticIds.leftOnly.length).toBe(0)
  expect(report.semanticIds.rightOnly.length).toBe(0)
  expect(report.alignedOriginalWordIds.pct).toBeGreaterThanOrEqual(PASS_THRESHOLD)
  expect(report.alignedOriginalWordIds.mismatches.length).toBe(0)

  return report
}

describe('USJ P0 parity — Titus fixtures', () => {
  test('ULT Titus chapter 1: surface / semantic IDs / alignedOriginalWordIds', async () => {
    const { legacy, usj } = await processBoth(ULT_USFM, 'en')
    const report = assertParity('ULT', legacy, usj, 1)
    expect(report.wordSurfaceOccurrence.leftSize).toBeGreaterThan(0)
    expect(report.alignedOriginalWordIds.legacyAlignedCount).toBeGreaterThan(0)
  })

  test('UGNT Titus chapter 1: OL semantic ID set equality', async () => {
    const { legacy, usj } = await processBoth(UGNT_USFM, 'el-x-koine')
    const report = assertParity('UGNT', legacy, usj, 1)
    expect(report.wordSurfaceOccurrence.leftSize).toBeGreaterThan(0)
    // UGNT has no zaln alignments
    expect(report.alignedOriginalWordIds.legacyAlignedCount).toBe(0)
  })

  test('ULT + UGNT full Titus book (cheap full-book check)', async () => {
    const ult = await processBoth(ULT_USFM, 'en')
    assertParity('ULT', ult.legacy, ult.usj, 'all')

    const ugnt = await processBoth(UGNT_USFM, 'el-x-koine')
    assertParity('UGNT', ugnt.legacy, ugnt.usj, 'all')
  })

  test('documents tokenizeGatewayUsj punctuation pitfall (not used by adapter)', async () => {
    // Guardrail: whitespace tokenization attaches commas and must not drive semantic IDs.
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
