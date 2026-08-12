/**
 * Door43 ingredients often use lowercase book ids (tit); USJ sids use TIT.
 * Adapter must accept either and keep verseRef/alignment casing consistent.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { collectSemanticIdSet } from '../src/parity'
import { USJProcessor } from '../src/USJProcessor'

const FIXTURES = join(import.meta.dir, '..', 'fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')

describe('USJProcessor bookCode casing', () => {
  test('lowercase bookId produces chapters + alignedOriginalWordIds', async () => {
    const { scripture } = await new USJProcessor().processUSFM(ULT_USFM, 'tit', 'Titus', {
      includeWordTokens: true,
      includeAlignments: true,
    })
    expect(scripture.chapters.length).toBe(3)
    expect(scripture.chapters[0].verses[0].reference).toBe('tit 1:1')
    expect(scripture.alignments?.[0]?.verseRef).toBe('tit 1:1')
    const withAlign = scripture.chapters[0].verses[0].wordTokens?.find(
      (t) => (t.alignedOriginalWordIds?.length || 0) > 0
    )
    expect(withAlign).toBeTruthy()
    expect(withAlign!.alignedOriginalWordIds![0].startsWith('tit 1:1:')).toBe(true)
  })

  test('uppercase vs lowercase bookId: case-insensitive semantic ID sets equal', async () => {
    const proc = new USJProcessor()
    const upper = await proc.processUSFM(ULT_USFM, 'TIT', 'Titus')
    const lower = await proc.processUSFM(ULT_USFM, 'tit', 'Titus')
    const a = collectSemanticIdSet(upper.scripture, 1)
    const b = collectSemanticIdSet(lower.scripture, 1)
    expect(a.size).toBe(b.size)
    expect(a.size).toBeGreaterThan(0)
  })
})
