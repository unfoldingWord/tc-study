/**
 * toUsjCacheContent must emit chapter 0 (book intro) slices.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { USJ_PROCESSING_VERSION } from '../src/versions'
import { USJProcessor } from '../src/USJProcessor'

const FIXTURES = join(import.meta.dir, '..', 'fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')

describe('toUsjCacheContent chapter slices', () => {
  test('includes chapter 0 intro and uses current USJ_PROCESSING_VERSION', async () => {
    const proc = new USJProcessor()
    const result = await proc.processUSFM(ULT_USFM, 'tit', 'Titus')
    const content = proc.toUsjCacheContent(result, 'tit', 'Titus')

    expect(content.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(USJ_PROCESSING_VERSION).toBe('2.2.0-usj')
    expect(content.chapters?.length).toBeGreaterThan(0)

    const chapterNumbers = (content.chapters ?? []).map((c) => c.number)
    expect(chapterNumbers).toContain(0)
    expect(chapterNumbers.some((n) => n > 0)).toBe(true)

    const intro = content.chapters!.find((c) => c.number === 0)
    expect(intro).toBeDefined()
    expect(Array.isArray(intro!.content)).toBe(true)
    expect(intro!.content.length).toBeGreaterThan(0)
  })
})
