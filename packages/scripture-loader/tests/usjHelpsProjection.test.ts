import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractUsjBroadcastTokens,
  processUsfmToUsjResult,
  semanticIdFor,
  viewModelToOptimizedChapters,
} from '../src/index'

const FIXTURES = join(import.meta.dir, '..', '..', 'usj-processor', 'fixtures')
const UGNT_USFM = readFileSync(join(FIXTURES, 'el-x-koine_ugnt_TIT.usfm'), 'utf8')
const ULT_USFM = readFileSync(join(FIXTURES, 'en_ult_TIT.usfm'), 'utf8')

describe('usjHelpsProjection', () => {
  test('viewModelToOptimizedChapters preserves Παῦλος occurrence for QuoteMatcher', async () => {
    const { viewModel } = await processUsfmToUsjResult({
      usfmText: UGNT_USFM,
      bookId: 'tit',
      bookName: 'Titus',
      options: { language: 'el-x-koine', includeWordTokens: true, includeAlignments: true },
    })
    const chapters = viewModelToOptimizedChapters(viewModel)
    const v1 = chapters.find((c) => c.number === 1)?.verses.find((v) => v.number === 1)
    const paul = v1?.tokens.find((t) => t.text === 'Παῦλος')
    expect(paul?.occurrence).toBe(1)
    expect(paul?.type).toBe('word')
  })

  test('extractUsjBroadcastTokens includes semanticId + alignedOriginalWordIds', async () => {
    const { viewModel } = await processUsfmToUsjResult({
      usfmText: ULT_USFM,
      bookId: 'tit',
      bookName: 'Titus',
      options: { language: 'en', includeWordTokens: true, includeAlignments: true },
    })
    const tokens = extractUsjBroadcastTokens(viewModel, 1, 1, 1, 1)
    const paul = tokens.find((t) => t.text === 'Paul')
    expect(paul).toBeTruthy()
    expect(paul!.semanticId).toBe(semanticIdFor('tit 1:1', 'Paul', 1))
    expect(paul!.alignedOriginalWordIds.length).toBeGreaterThan(0)
  })
})
