/**
 * USJ-only processUsfmToScripture gates for Titus.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { collectSemanticIdSet } from '@bt-synergy/usj-processor'
import { QuoteMatcher } from '@bt-synergy/resource-parsers'
import type { OptimizedChapter, OptimizedToken } from '@bt-synergy/resource-parsers'
import type { ProcessedScripture, WordToken } from '@bt-synergy/usj-processor'

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

describe('USJ processUsfmToScripture — Titus gates', () => {
  test('UGNT Titus 1: deterministic semantic ID set (lowercase bookId)', async () => {
    const bookId = 'tit'
    const a = await processUsfmToScripture({ usfmText: UGNT_USFM, bookId })
    const b = await processUsfmToScripture({ usfmText: UGNT_USFM, bookId })

    expect(a.chapters.length).toBeGreaterThan(0)
    expect(b.chapters.length).toBe(a.chapters.length)

    const left = collectSemanticIdSet(a, 1)
    const right = collectSemanticIdSet(b, 1)
    expect([...left].sort()).toEqual([...right].sort())
    expect(left.size).toBeGreaterThan(0)
  })

  test('ULT Titus 1: alignedOriginalWordIds present on Paul', async () => {
    const bookId = 'tit'
    const usj = await processUsfmToScripture({ usfmText: ULT_USFM, bookId })
    const paul = usj.chapters
      .find((c) => c.number === 1)
      ?.verses.find((v) => v.number === 1)
      ?.wordTokens?.find((t) => t.type === 'word' && t.content === 'Paul')

    expect(paul?.alignedOriginalWordIds?.length).toBeGreaterThan(0)
    expect(
      (paul!.alignedOriginalWordIds || []).some((id) => id.toLowerCase().includes('παῦλος'))
    ).toBe(true)
  })

  test('TN quote → semantic IDs (QuoteMatcher STEP1) succeed on USJ tokens', async () => {
    const bookId = 'tit'
    const usj = await processUsfmToScripture({ usfmText: UGNT_USFM, bookId })
    const chapters = toOptimizedChapters(usj)
    const matcher = new QuoteMatcher()
    const rows = parseTnRowsChapter1()
    expect(rows.length).toBeGreaterThan(10)

    let matched = 0
    const failures: string[] = []

    for (const row of rows) {
      const ref = {
        book: 'tit',
        startChapter: 1,
        startVerse: row.verse,
        endChapter: 1,
        endVerse: row.verse,
      }
      const result = matcher.findOriginalTokens(chapters, row.quote, row.occurrence, ref)
      if (!result.success) continue
      matched++
      const ids = semanticIdsFromQuoteMatch(
        result.totalTokens,
        'tit',
        1,
        row.verse,
        row.occurrence
      )
      if (ids.length === 0) failures.push(`${row.id} empty ids quote=${row.quote}`)
    }

    expect(matched).toBeGreaterThan(10)
    expect(failures.slice(0, 8)).toEqual([])
  })
})
