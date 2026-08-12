/**
 * USJ-native view model identity contract (Pipeline / Identity team).
 *
 * Gates:
 * - semanticId = verseRef:content:occurrence from `\w` surfaces
 * - alignedOriginalWordIds on ULT match OL surfaces from AlignmentMap
 * - projection → ProcessedScripture preserves the same IDs
 * - lowercase vs uppercase bookCode: case-insensitive set equality
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  collectViewModelSemanticIdSet,
  flattenUsjTokens,
  projectToProcessedScripture,
  semanticIdFor,
  USJProcessor,
} from '../src/index'
import { collectSemanticIdSet, compareAlignedOriginalWordIds } from '../src/parity'

const FIXTURES = join(import.meta.dir, '..', 'fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')

describe('UsjScriptureViewModel identity contract', () => {
  test('ULT Titus 1: every token has semanticId from surface+occurrence', async () => {
    const { viewModel } = await new USJProcessor().processUSFM(ULT_USFM, 'TIT', 'Titus')
    const ch1 = viewModel.chapters.find((c) => c.number === 1)
    expect(ch1).toBeTruthy()
    const tokens = flattenUsjTokens(viewModel, 1)
    expect(tokens.length).toBeGreaterThan(100)

    for (const t of tokens) {
      expect(t.semanticId).toBe(semanticIdFor(t.verseRef, t.content, t.occurrence))
      expect(t.verseRef.startsWith('TIT 1:')).toBe(true)
      expect(t.occurrence).toBeGreaterThanOrEqual(1)
      expect(t.content.includes(',')).toBe(false)
    }

    // Paul appears once in 1:1 without trailing punctuation
    const v1 = ch1!.verses.find((v) => v.number === 1)!
    expect(v1.tokens.some((t) => t.content === 'Paul')).toBe(true)
    expect(v1.tokens.some((t) => t.content === 'Paul,')).toBe(false)
  })

  test('ULT Titus 1: alignedOriginalWordIds non-empty and use OL surfaces', async () => {
    const { viewModel } = await new USJProcessor().processUSFM(ULT_USFM, 'TIT', 'Titus')
    const tokens = flattenUsjTokens(viewModel, 1)
    const aligned = tokens.filter((t) => t.alignedOriginalWordIds.length > 0)
    expect(aligned.length).toBeGreaterThan(50)

    for (const t of aligned) {
      for (const olId of t.alignedOriginalWordIds) {
        // verseRef:content:occurrence — at least 3 colon-separated parts after book+ch:v
        expect(olId.toLowerCase().startsWith('tit 1:')).toBe(true)
        const parts = olId.split(':')
        expect(parts.length).toBeGreaterThanOrEqual(3)
        // content is non-empty Unicode (Greek for UGNT sources)
        const content = parts.slice(2, -1).join(':') // handle content with colons? rare
        // Standard form: `${verseRef}:${content}:${occurrence}` where verseRef has one colon
        // verseRef = "TIT 1:1" → split gives ["TIT 1", "1", content..., occurrence]
        expect(parts.length).toBeGreaterThanOrEqual(4)
        expect(parts[parts.length - 1]).toMatch(/^\d+$/)
      }
    }
  })

  test('UGNT Titus 1: OL tokens have empty alignedOriginalWordIds', async () => {
    const { viewModel } = await new USJProcessor().processUSFM(
      UGNT_USFM,
      'TIT',
      'Titus',
      { language: 'el-x-koine' }
    )
    const tokens = flattenUsjTokens(viewModel, 1)
    expect(tokens.length).toBeGreaterThan(50)
    expect(tokens.every((t) => t.alignedOriginalWordIds.length === 0)).toBe(true)
    expect(collectViewModelSemanticIdSet(viewModel, 1).size).toBe(tokens.length)
  })

  test('projection preserves semantic IDs and alignedOriginalWordIds', async () => {
    const { viewModel, scripture } = await new USJProcessor().processUSFM(
      ULT_USFM,
      'TIT',
      'Titus'
    )
    const projected = projectToProcessedScripture(viewModel)
    const fromResult = collectSemanticIdSet(scripture, 1)
    const fromProjected = collectSemanticIdSet(projected, 1)
    const fromView = collectViewModelSemanticIdSet(viewModel, 1)

    expect(fromView.size).toBe(fromResult.size)
    expect(fromProjected.size).toBe(fromView.size)
    for (const id of fromView) {
      expect(fromResult.has(id)).toBe(true)
      expect(fromProjected.has(id)).toBe(true)
    }

    const alignParity = compareAlignedOriginalWordIds(scripture, projected, 1)
    expect(alignParity.mismatches.length).toBe(0)
    expect(alignParity.pct).toBe(100)
  })

  test('lowercase bookCode semantic ID sets equal uppercase (case-insensitive)', async () => {
    const proc = new USJProcessor()
    const upper = await proc.processUSFM(ULT_USFM, 'TIT', 'Titus')
    const lower = await proc.processUSFM(ULT_USFM, 'tit', 'Titus')

    const u = collectViewModelSemanticIdSet(upper.viewModel, 1)
    const l = collectViewModelSemanticIdSet(lower.viewModel, 1)
    expect(u.size).toBe(l.size)
    expect(u.size).toBeGreaterThan(0)

    // Case-insensitive equality of the sets
    for (const id of u) expect(l.has(id)).toBe(true)

    // Alignments also match case-insensitively when projected
    const align = compareAlignedOriginalWordIds(upper.scripture, lower.scripture, 1)
    expect(align.mismatches.length).toBe(0)
  })

  test('ULT aligned OL ids intersect UGNT semantic IDs (case-insensitive)', async () => {
    const proc = new USJProcessor()
    const ult = await proc.processUSFM(ULT_USFM, 'TIT', 'Titus')
    const ugnt = await proc.processUSFM(UGNT_USFM, 'TIT', 'Titus', {
      language: 'el-x-koine',
    })

    const olIds = collectViewModelSemanticIdSet(ugnt.viewModel, 1)
    const ultTokens = flattenUsjTokens(ult.viewModel, 1)
    let hit = 0
    let miss = 0
    for (const t of ultTokens) {
      for (const ol of t.alignedOriginalWordIds) {
        if (olIds.has(ol.toLowerCase())) hit++
        else miss++
      }
    }
    expect(hit).toBeGreaterThan(100)
    // Small miss budget for zaln/content edge cases; hard fail if majority miss
    expect(miss).toBeLessThan(hit * 0.05)
  })
})
