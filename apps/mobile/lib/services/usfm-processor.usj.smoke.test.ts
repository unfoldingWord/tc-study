/**
 * Smoke: mobile USFMProcessor facade uses USJ (no usfm-js).
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { usfmProcessor } from './usfm-processor'

const FIXTURE = join(
  import.meta.dir,
  '../../../../packages/usj-processor/fixtures/en_ult_TIT.usfm'
)

describe('mobile usfm-processor USJ facade', () => {
  test('processUSFMOptimized returns aligned OptimizedScripture for Titus ULT', async () => {
    const usfm = readFileSync(FIXTURE, 'utf8')
    const result = await usfmProcessor.processUSFMOptimized(usfm, 'tit', 'Titus', 'en')

    expect(result.meta.bookCode).toBe('tit')
    expect(result.meta.type).toBe('aligned')
    expect(result.meta.hasAlignments).toBe(true)
    expect(result.chapters.length).toBeGreaterThanOrEqual(3)

    const v1 = result.chapters[0]?.verses.find((v) => v.number === 1)
    expect(v1).toBeTruthy()
    expect(v1!.text.toLowerCase()).toContain('paul')

    const paul = v1!.tokens.find((t) => t.text === 'Paul' && t.type === 'word')
    expect(paul).toBeTruthy()
    expect(paul!.align?.length).toBeGreaterThan(0)

    expect(result.translatorSections?.length).toBeGreaterThan(0)
  })

  test('processUSFM returns ProcessedScripture chapters', async () => {
    const usfm = readFileSync(FIXTURE, 'utf8')
    const { structuredText, alignments } = await usfmProcessor.processUSFM(
      usfm,
      'tit',
      'Titus'
    )
    expect(structuredText.chapters.length).toBeGreaterThanOrEqual(3)
    expect(alignments.length).toBeGreaterThan(0)
  })
})
