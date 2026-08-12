/**
 * Loader API: processUsfmToUsjResult returns view model + scripture-usj cache payload.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  isUsjScriptureCacheContent,
  processUsfmToUsjResult,
  USJ_PROCESSING_VERSION,
  viewModelFromUsjCache,
} from '../src/index'
import { USJProcessor } from '@bt-synergy/usj-processor'

const FIXTURES = join(import.meta.dir, '../../usj-processor/fixtures')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')

describe('processUsfmToUsjResult', () => {
  test('returns viewModel, scripture projection, and cacheContent', async () => {
    const result = await processUsfmToUsjResult({
      usfmText: ULT_USFM,
      bookId: 'tit',
      bookName: 'Titus',
    })

    expect(result.viewModel.bookCode).toBe('tit')
    expect(result.viewModel.processingVersion).toBe(USJ_PROCESSING_VERSION)
    expect(result.viewModel.chapters.length).toBeGreaterThan(0)
    expect(result.scripture.chapters.length).toBe(result.viewModel.chapters.length)
    expect(Object.keys(result.alignmentMap).length).toBeGreaterThan(0)

    expect(isUsjScriptureCacheContent(result.cacheContent)).toBe(true)
    expect(result.cacheContent.metadata.version).toBe(USJ_PROCESSING_VERSION)
    expect(result.cacheContent.alignmentMap).toBeTruthy()
    expect(result.cacheContent.usj || result.cacheContent.chapters).toBeTruthy()

    const roundTrip = viewModelFromUsjCache(
      result.cacheContent,
      'tit',
      new USJProcessor()
    )
    expect(roundTrip).toBeTruthy()
    expect(roundTrip!.chapters[0]?.verses[0]?.tokens[0]?.semanticId).toBeTruthy()
  })
})
