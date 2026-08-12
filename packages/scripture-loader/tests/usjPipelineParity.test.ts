/**
 * P1: flag on/off produce comparable Titus 1 semantic ID sets via processUsfmToScripture.
 * Reuses usj-processor fixtures + parity helpers (no IndexedDB / viewer).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  attachAlignmentSemanticIds,
  collectSemanticIdSet,
  compareAlignedOriginalWordIds,
} from '@bt-synergy/usj-processor'
import { QuoteMatcher } from '@bt-synergy/resource-parsers'
import type { OptimizedChapter, OptimizedToken } from '@bt-synergy/resource-parsers'
import type { ProcessedScripture, WordToken } from '@bt-synergy/usfm-processor'

import { processUsfmToScripture } from '../src/processUsfm'

const FIXTURES = join(import.meta.dir, '..', '..', 'usj-processor', 'fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')
const TN_TSV = readFileSync(join(FIXTURES, 'en_tn_TIT.tsv'), 'utf8')

/** Minimal ProcessedScripture → OptimizedChapter[] for QuoteMatcher STEP1. */
function toOptimizedChapters(scripture: ProcessedScripture): OptimizedChapter[] {
  return scripture.chapters.map((ch) => ({
    number: ch.number,
    verseCount: ch.verseCount,
    paragraphCount: ch.paragraphCount,
    verses: ch.verses.map((v) => ({
      number: v.number,
      text: v.text || '',
      tokens: (v.wordTokens || [])
        .filter((t: WordToken) => t.type === 'word')
        .map(
          (t: WordToken, i: number): OptimizedToken => ({
            id: i + 1,
            text: t.content,
            type: 'word',
            occurrence: t.occurrence,
          })
        ),
    })),
  }))
}

function parseTnRowsChapter1(): Array<{
  id: string
  quote: string
  occurrence: number
  verse: number
}> {
  const lines = TN_TSV.split(/\r?\n/).slice(1)
  const rows: Array<{ id: string; quote: string; occurrence: number; verse: number }> = []
  for (const line of lines) {
    if (!line.trim()) continue
    const cols = line.split('\t')
    const ref = cols[0] || ''
    const id = cols[1] || ''
    const quote = cols[4] || ''
    const occurrence = parseInt(cols[5] || '1', 10) || 1
    // Titus chapter 1 verse rows: "1:1", "1:2", … skip intros
    const m = ref.match(/^1:(\d+)$/)
    if (!m || !quote.trim()) continue
    rows.push({ id, quote, occurrence, verse: parseInt(m[1], 10) })
  }
  return rows
}

function semanticIdsFromQuoteMatch(
  tokens: OptimizedToken[],
  bookCode: string,
  chapter: number,
  verse: number,
  baseOccurrence: number
): string[] {
  const verseRef = `${bookCode.toLowerCase()} ${chapter}:${verse}`
  if (tokens.length === 1) {
    return [`${verseRef}:${tokens[0].text}:${baseOccurrence}`.toLowerCase()]
  }
  return tokens.map((t) => `${verseRef}:${t.text}:${t.occurrence || 1}`.toLowerCase())
}

describe('P1 USE_USJ_PIPELINE — Titus semantic parity', () => {
  test('flag off vs on: UGNT Titus 1 semantic ID sets equal (lowercase bookId)', async () => {
    // Door43 ingredients typically use lowercase identifiers
    const bookId = 'tit'
    const legacy = await processUsfmToScripture({
      usfmText: UGNT_USFM,
      bookId,
      useUsjPipeline: false,
    })
    const usj = await processUsfmToScripture({
      usfmText: UGNT_USFM,
      bookId,
      useUsjPipeline: true,
    })

    expect(legacy.chapters.length).toBeGreaterThan(0)
    expect(usj.chapters.length).toBe(legacy.chapters.length)

    const left = collectSemanticIdSet(legacy, 1)
    const right = collectSemanticIdSet(usj, 1)
    const leftOnly = [...left].filter((id) => !right.has(id))
    const rightOnly = [...right].filter((id) => !left.has(id))
    expect(leftOnly).toEqual([])
    expect(rightOnly).toEqual([])
    expect(left.size).toBeGreaterThan(0)
  })

  test('flag off vs on: ULT Titus 1 alignedOriginalWordIds parity', async () => {
    const bookId = 'tit'
    const legacy = await processUsfmToScripture({
      usfmText: ULT_USFM,
      bookId,
      useUsjPipeline: false,
    })
    // Flag-off keeps viewer-side attach (existing behavior). Apply here for parity compare.
    attachAlignmentSemanticIds(
      legacy,
      legacy.chapters.flatMap((c) => c.verses)
    )
    const usj = await processUsfmToScripture({
      usfmText: ULT_USFM,
      bookId,
      useUsjPipeline: true,
    })

    const align = compareAlignedOriginalWordIds(legacy, usj, 1)
    expect(align.legacyAlignedCount).toBeGreaterThan(0)
    expect(align.mismatches).toEqual([])
    expect(align.pct).toBe(100)
  })

  test('TN quote → semantic IDs (QuoteMatcher STEP1) match between pipelines', async () => {
    const bookId = 'tit'
    const legacy = await processUsfmToScripture({
      usfmText: UGNT_USFM,
      bookId,
      useUsjPipeline: false,
    })
    const usj = await processUsfmToScripture({
      usfmText: UGNT_USFM,
      bookId,
      useUsjPipeline: true,
    })

    const legacyCh = toOptimizedChapters(legacy)
    const usjCh = toOptimizedChapters(usj)
    const matcher = new QuoteMatcher()
    const rows = parseTnRowsChapter1()
    expect(rows.length).toBeGreaterThan(10)

    let compared = 0
    let matched = 0
    const mismatches: string[] = []

    for (const row of rows) {
      const ref = {
        book: 'tit',
        startChapter: 1,
        startVerse: row.verse,
        endChapter: 1,
        endVerse: row.verse,
      }
      const a = matcher.findOriginalTokens(legacyCh, row.quote, row.occurrence, ref)
      const b = matcher.findOriginalTokens(usjCh, row.quote, row.occurrence, ref)

      // Both succeed or both fail — prove underline *inputs* match
      if (!a.success && !b.success) continue
      compared++
      if (a.success !== b.success) {
        mismatches.push(
          `${row.id} success mismatch legacy=${a.success} usj=${b.success} quote=${row.quote}`
        )
        continue
      }
      const idsA = semanticIdsFromQuoteMatch(
        a.totalTokens,
        'tit',
        1,
        row.verse,
        row.occurrence
      ).sort()
      const idsB = semanticIdsFromQuoteMatch(
        b.totalTokens,
        'tit',
        1,
        row.verse,
        row.occurrence
      ).sort()
      if (idsA.join('|') === idsB.join('|')) matched++
      else mismatches.push(`${row.id} ids legacy=[${idsA}] usj=[${idsB}]`)
    }

    expect(compared).toBeGreaterThan(10)
    expect(mismatches.slice(0, 8)).toEqual([])
    expect(matched).toBe(compared)
  })

  test('underline target: ULT Paul resolves to Παῦλος semantic id (both pipelines)', async () => {
    const bookId = 'tit'
    const legacy = await processUsfmToScripture({
      usfmText: ULT_USFM,
      bookId,
      useUsjPipeline: false,
    })
    attachAlignmentSemanticIds(
      legacy,
      legacy.chapters.flatMap((c) => c.verses)
    )
    const usj = await processUsfmToScripture({
      usfmText: ULT_USFM,
      bookId,
      useUsjPipeline: true,
    })

    const findPaul = (scripture: ProcessedScripture) =>
      scripture.chapters
        .find((c) => c.number === 1)
        ?.verses.find((v) => v.number === 1)
        ?.wordTokens?.find((t) => t.type === 'word' && t.content === 'Paul')

    const legacyPaul = findPaul(legacy)
    const usjPaul = findPaul(usj)
    expect(legacyPaul?.alignedOriginalWordIds?.length).toBeGreaterThan(0)
    expect(usjPaul?.alignedOriginalWordIds?.length).toBeGreaterThan(0)

    const norm = (ids: string[] | undefined) =>
      (ids || []).map((id) => id.toLowerCase()).sort()
    expect(norm(usjPaul!.alignedOriginalWordIds)).toEqual(norm(legacyPaul!.alignedOriginalWordIds))
    expect(norm(usjPaul!.alignedOriginalWordIds).some((id) => id.includes('παῦλος'))).toBe(true)
  })
})
